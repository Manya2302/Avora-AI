"""Celery tasks for the Avora document AI pipeline."""
import logging
from celery import shared_task

logger = logging.getLogger(__name__)


def extract_text(document) -> str:
    """Backwards-compatible helper: reassemble, decrypt and extract text (no indexing)."""
    from apps.ai.services.ingestion import load_document_bytes
    from apps.ai.engine.document_processor import AvoraDocumentProcessor
    result = AvoraDocumentProcessor(extract_figures=False).process(
        load_document_bytes(document), document.mime_type, document.original_name)
    if result.page_count:
        try:
            document.metadata.page_count = result.page_count
            document.metadata.save(update_fields=["page_count", "updated_at"])
        except Exception:
            pass
    return result.clean_text or result.raw_text


def route_downstream(document_id: str, owner_id: str, original_name: str, category: str):
    """Fan out to the specialised analysers (unchanged routing rules)."""
    from apps.ai.tasks import analyze_compliance_risk_async, analyze_contract_async
    logger.info(f"[Upload Router] Routing {document_id} as {category}")
    if category in ('contract', 'vendor_agreement', 'legal_agreement'):
        analyze_contract_async.delay(document_id, owner_id)
    analyze_compliance_risk_async.delay(document_id, owner_id, original_name)


@shared_task(bind=True, max_retries=2, default_retry_delay=30, acks_late=True,
             soft_time_limit=60 * 60, time_limit=60 * 65)
def process_document_ai(self, document_id: str):
    """
    Avora ingestion: decrypt → page-level extraction (+OCR where needed) →
    classify ‖ figure understanding ‖ structure-aware chunk + embed → Qdrant →
    AI_READY → downstream analysers. See apps/ai/services/ingestion.py.
    """
    from apps.ai.services.ingestion import IngestionPipeline
    pipeline = None
    try:
        pipeline = IngestionPipeline(document_id)
        out = pipeline.run()
        doc = out["document"]
        try:
            route_downstream(str(doc.id), str(doc.owner_id), doc.original_name, out["category"])
        except Exception as e:
            logger.warning(f"[Upload Router] downstream dispatch failed: {e}")
        return {"document_id": document_id, **out["stats"]}
    except Exception as exc:
        logger.exception(f"Error processing document {document_id}")
        if pipeline:
            pipeline.fail(exc)
        else:
            from apps.documents.models import Document
            Document.objects.filter(id=document_id).update(status='failed')
        # Transient infra errors (Qdrant/MinIO hiccups) are worth a retry on a real worker
        if not self.request.is_eager and self.request.retries < self.max_retries:
            raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=2, default_retry_delay=30, acks_late=True)
def reprocess_edited_document(self, document_id: str, user_id: str, changelog_id: str):
    """After an in-app text edit: classify, re-index vectors, temporal diff, analysers."""
    from apps.ai.models import DocumentOCR
    from apps.ai.services.classification import classify_document_v2
    from apps.ai.services.vector_store import index_document_chunks
    from apps.ai.engine.chunker import chunk_plain_text
    from apps.ai.tasks import analyze_temporal_diff_async
    from apps.documents.models import Document
    try:
        doc = Document.objects.get(id=document_id, is_deleted=False)
        ocr = DocumentOCR.objects.filter(document_id=document_id).only("cleaned_text", "raw_text").first()
        text = (ocr.cleaned_text or ocr.raw_text) if ocr else ""
        category = (classify_document_v2(document_id, text) or {}).get("category", "other")
        index_document_chunks(document_id, chunk_plain_text(text), category=category,
                              short_summary=text[:200], replace=True)
        analyze_temporal_diff_async.delay(changelog_id)
        route_downstream(document_id, user_id, doc.original_name, category)
        logger.info(f"[Editor] re-indexed edited document {document_id} as {category}")
    except Document.DoesNotExist:
        return
    except Exception as exc:
        logger.exception(f"[Editor] reprocess failed for {document_id}")
        if not self.request.is_eager and self.request.retries < self.max_retries:
            raise self.retry(exc=exc)
