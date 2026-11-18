"""Avora AI — Phase 3 Full Pipeline"""
import logging
from celery import shared_task
from django.utils import timezone
logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=2, default_retry_delay=60, acks_late=True,
             soft_time_limit=60 * 60, time_limit=60 * 65)
def run_ai_pipeline(self, document_id: str, owner_id: str = ''):
    """Full pipeline (ingestion + metadata + summaries + collections + analysers).
    Ingestion is the shared v2 pipeline (apps/ai/services/ingestion.py)."""
    from apps.ai.services.ingestion import IngestionPipeline
    pipeline = None
    try:
        pipeline = IngestionPipeline(document_id)
        out = pipeline.run()
        doc = out["document"]
        owner_id = owner_id or str(doc.owner_id)
        clean, category = out["text"], out["category"]

        from apps.ai.services.metadata import extract_metadata
        extract_metadata(document_id, clean, category)

        from apps.ai.services.summary import generate_summaries
        generate_summaries(document_id, clean)

        from apps.ai.services.collections import assign_document_to_collections
        assign_document_to_collections(document_id, owner_id, category)

        logger.info(f"[Router] Routing document based on classification: {category}")
        analyze_compliance_risk_async.delay(document_id, owner_id, doc.original_name)
        if category in ('contract', 'vendor_agreement', 'legal_agreement', 'audit_report', 'policy', 'other'):
            analyze_contract_async.delay(document_id, owner_id)
        scan_document_expiry.delay(document_id, owner_id)
        compute_similarity.delay(document_id, owner_id)
        process_knowledge_graph_async.delay(document_id, owner_id, doc.original_name)
        logger.info(f"[Pipeline] ✅ {document_id[:8]} quality={out['quality']:.2f} {out['stats']}")
    except Exception as exc:
        logger.exception(f"[Pipeline] {document_id} failed")
        if pipeline:
            pipeline.fail(exc)
        if not self.request.is_eager and self.request.retries < self.max_retries:
            raise self.retry(exc=exc)


@shared_task
def reembed_fallback_documents(limit: int = 50):
    """
    Re-index documents that were embedded with a fallback model (Ollama / local hash)
    once the primary model (Cohere) is healthy again, so every document is searchable
    from primary-model queries. Schedule with celery-beat (e.g. hourly).
    """
    from apps.ai.models import DocumentEmbedding
    from apps.ai.services.embeddings import primary_model_tag, TAG_COHERE
    from apps.documents.tasks import process_document_ai
    primary = primary_model_tag()
    if primary != TAG_COHERE:
        return 0  # no better model configured; nothing to upgrade
    from utils.circuit_breaker import cohere_embed_cb
    if not cohere_embed_cb.is_healthy():
        return 0
    stale = list(DocumentEmbedding.objects.exclude(model_name=primary)
                 .values_list("document_id", flat=True)[:limit])
    for doc_id in stale:
        process_document_ai.delay(str(doc_id))
    logger.info(f"[Re-embed] queued {len(stale)} fallback-embedded documents")
    return len(stale)


@shared_task
def compute_similarity(document_id: str, owner_id: str):
    try:
        from apps.ai.services.similarity import find_similar_documents
        find_similar_documents(document_id, owner_id)
    except Exception as e: logger.warning(f"[Similarity] {e}")

@shared_task
def analyze_contract_async(document_id: str, owner_id: str):
    """Pipeline hook — same implementation as the /api/contracts/analyze/ background job."""
    from apps.contracts.services.analysis import run_contract_analysis
    return run_contract_analysis(document_id, owner_id)

@shared_task
def scan_document_expiry(document_id: str, owner_id: str):
    try:
        from django.contrib.auth import get_user_model
        from apps.compliance.services.expiry import scan_for_expiry_dates
        User  = get_user_model()
        owner = User.objects.get(id=owner_id)
        scan_for_expiry_dates(owner)
    except Exception as e: logger.warning(f"[Expiry] {e}")

@shared_task
def process_knowledge_graph_async(document_id: str, owner_id: str, doc_name: str):
    """Auto-scores and adds to the knowledge graph based on user settings."""
    try:
        from django.contrib.auth import get_user_model
        from apps.documents.models import DocumentMetadata
        from apps.ai.models import DocumentOCR
        from apps.knowledge.services.graph_scorer import score_document_for_graph, build_graph_from_score_result
        
        User = get_user_model()
        owner = User.objects.get(id=owner_id)
        meta = DocumentMetadata.objects.get(document_id=document_id)
        
        graph_processing = meta.extra.get('graph_processing', 'ai')
        if graph_processing == 'never':
            return
            
        ocr = DocumentOCR.objects.get(document_id=document_id)
        text = ocr.cleaned_text or ocr.raw_text or ''
        
        if not text:
            return
            
        score_result = score_document_for_graph(document_id, text, doc_name)
        
        should_add = (graph_processing == 'always') or (graph_processing == 'ai' and score_result.get('recommended', False))
        
        if should_add:
            # Inject upload metadata (department/employee) to ensure graph nodes have proper details
            build_graph_from_score_result(document_id, owner, doc_name, score_result)
            logger.info(f"[Graph] Auto-added {document_id[:8]} to Knowledge Graph")
            
    except Exception as e:
        logger.warning(f"[Graph Auto-Process] {e}")

@shared_task
def rebuild_smart_collections(user_id: str):
    from apps.ai.models import SmartCollection, SmartCollectionDocument
    from django.contrib.auth import get_user_model
    try:
        user = get_user_model().objects.get(id=user_id)
        for col in SmartCollection.objects.filter(owner=user):
            col.document_count = SmartCollectionDocument.objects.filter(collection=col).count()
            col.save(update_fields=['document_count'])
    except Exception as e: logger.error(f"[Collections] {e}")

@shared_task
def analyze_compliance_risk_async(document_id: str, owner_id: str, doc_name: str):
    try:
        from django.contrib.auth import get_user_model
        from apps.ai.models import DocumentOCR
        from apps.compliance.services.risk_analyzer import analyze_compliance_risk
        
        User = get_user_model()
        owner = User.objects.get(id=owner_id)
        ocr = DocumentOCR.objects.get(document_id=document_id)
        text = ocr.cleaned_text or ocr.raw_text
        
        if text:
            analyze_compliance_risk(document_id, owner, text, doc_name)
    except Exception as e:
        logger.error(f"[Compliance Task] Failed to run continuous compliance analysis: {e}")

@shared_task
def analyze_temporal_diff_async(changelog_id: str):
    try:
        from apps.compliance.services.temporal_diff import analyze_temporal_diff
        analyze_temporal_diff(changelog_id)
    except Exception as e:
        logger.error(f"[TemporalDiff Task] Failed to run temporal diff: {e}")
