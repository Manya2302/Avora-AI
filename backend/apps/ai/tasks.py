"""Avora AI — Phase 3 Full Pipeline"""
import logging
from celery import shared_task
from django.utils import timezone
logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def run_ai_pipeline(self, document_id: str, owner_id: str):
    from apps.ai.models import AIProcessingQueue, DocumentOCR
    from apps.documents.models import Document
    queue, _ = AIProcessingQueue.objects.get_or_create(
        document_id=document_id, defaults={'stage':'queued','progress':0})
    queue.started_at = timezone.now(); queue.save()
    def step(stage, pct):
        queue.stage=stage; queue.progress=pct
        queue.save(update_fields=['stage','progress','updated_at'])
        logger.info(f"[Pipeline] {document_id[:8]} → {stage} ({pct}%)")
    try:
        step('ocr', 8)
        raw_text = clean = ''; conf = 0.0; engine = 'scaffold'; q_score = 0.0; pages = 0
        try:
            doc = Document.objects.get(id=document_id)
            from apps.ai.engine.document_processor import AvoraDocumentProcessor
            result   = AvoraDocumentProcessor().process(b'', doc.mime_type or '', doc.original_name)
            raw_text = result.raw_text; clean = result.clean_text or raw_text
            conf = result.confidence; engine = result.engine_used
            q_score = result.quality_score; pages = result.page_count
        except Exception as e:
            logger.warning(f"[Pipeline] OCR fallback: {e}")
        DocumentOCR.objects.update_or_create(
            document_id=document_id,
            defaults={'status':'completed','raw_text':raw_text,'cleaned_text':clean,
                      'confidence_score':conf,'engine_used':engine,
                      'word_count':len(clean.split()),'page_count':pages})

        step('classification', 30)
        from apps.ai.services.classification import classify_document_v2
        cls_data = classify_document_v2(document_id, clean)
        category = cls_data.get('category','other')

        step('metadata', 48)
        from apps.ai.services.metadata import extract_metadata
        extract_metadata(document_id, clean, category)

        step('summary', 62)
        from apps.ai.services.summary import generate_summaries
        summaries = generate_summaries(document_id, clean)

        step('embedding', 78)
        from apps.ai.services.embeddings import generate_and_store_embedding_v2
        generate_and_store_embedding_v2(document_id, clean, category,
            summaries.get('short',''), owner_id)

        step('storing', 92)
        from apps.ai.services.collections import assign_document_to_collections
        assign_document_to_collections(document_id, owner_id, category)

        # Phase 3 auto-hooks (non-blocking)
        if category in ('contract','vendor_agreement','legal_agreement'):
            analyze_contract_async.delay(document_id, owner_id)
        scan_document_expiry.delay(document_id, owner_id)
        compute_similarity.delay(document_id, owner_id)

        queue.stage='completed'; queue.progress=100
        queue.completed_at=timezone.now()
        queue.duration_ms=int((queue.completed_at-queue.started_at).total_seconds()*1000)
        queue.save()
        Document.objects.filter(id=document_id).update(status='ai_ready')
        logger.info(f"[Pipeline] ✅ {document_id[:8]} {queue.duration_ms}ms quality={q_score:.2f}")
    except Exception as exc:
        queue.stage='failed'; queue.error_message=str(exc); queue.retry_count+=1; queue.save()
        Document.objects.filter(id=document_id).update(status='failed')
        raise self.retry(exc=exc)

@shared_task
def compute_similarity(document_id: str, owner_id: str):
    try:
        from apps.ai.services.similarity import find_similar_documents
        find_similar_documents(document_id, owner_id)
    except Exception as e: logger.warning(f"[Similarity] {e}")

@shared_task
def analyze_contract_async(document_id: str, owner_id: str):
    try:
        from django.contrib.auth import get_user_model
        from apps.documents.models import Document
        from apps.ai.models import DocumentOCR
        from apps.contracts.services.contract_extractor import extract_contract_data
        from apps.contracts.services.clause_analyzer import analyze_clauses
        from apps.contracts.services.risk_detector import detect_risks
        from apps.contracts.services.renewal_tracker import setup_renewal_tracking
        from apps.contracts.models import ContractAnalysis
        from datetime import datetime
        User = get_user_model()
        doc  = Document.objects.get(id=document_id)
        owner= User.objects.get(id=owner_id)
        ocr  = DocumentOCR.objects.get(document_id=document_id)
        text = ocr.cleaned_text or ocr.raw_text
        ext  = extract_contract_data(text)
        parts= ext.get('parties',{})
        def pd(s):
            if not s: return None
            for fmt in ('%d/%m/%Y','%d-%m-%Y','%Y-%m-%d','%m/%d/%Y'):
                try: return datetime.strptime(s,fmt).date()
                except: pass
        c, _ = ContractAnalysis.objects.update_or_create(
            document_id=document_id,
            defaults={'owner':owner,'title':doc.original_name,
                'party_a':parts.get('party_a',''),'party_b':parts.get('party_b',''),
                'contract_type':ext.get('contract_type',''),
                'effective_date':pd(ext.get('effective_date')),'expiry_date':pd(ext.get('expiry_date')),
                'contract_value':ext.get('contract_value'),'currency':ext.get('currency',''),
                'notice_period_days':ext.get('notice_period'),'auto_renewal':ext.get('auto_renewal',False),
                'key_obligations':ext.get('key_obligations',[]),'key_dates':ext.get('key_dates',[])})
        analyze_clauses(c, text); detect_risks(c, text); setup_renewal_tracking(c)
        logger.info(f"[Pipeline] Contract auto-analyzed: {document_id[:8]}")
    except Exception as e: logger.error(f"[Contract auto] {e}")

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
def rebuild_smart_collections(user_id: str):
    from apps.ai.models import SmartCollection, SmartCollectionDocument
    from django.contrib.auth import get_user_model
    try:
        user = get_user_model().objects.get(id=user_id)
        for col in SmartCollection.objects.filter(owner=user):
            col.document_count = SmartCollectionDocument.objects.filter(collection=col).count()
            col.save(update_fields=['document_count'])
    except Exception as e: logger.error(f"[Collections] {e}")
