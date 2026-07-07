"""Celery tasks for Orivo AI pipeline."""
import logging
from celery import shared_task

logger = logging.getLogger(__name__)

def extract_text(document) -> str:
    """Reassemble chunks, decrypt using AES key, and run text extraction."""
    from apps.documents.services.storage import download_chunk
    from apps.documents.services.encryption import decrypt_chunk
    from apps.documents.services.compression import decompress
    from apps.ai.engine.document_processor import AvoraDocumentProcessor

    # 1. Fetch all chunks in order
    chunks = document.chunks.all().order_by('chunk_index')
    if not chunks.exists():
        logger.warning(f"No chunks found for document {document.id}")
        return ""

    # 2. Get the plaintext AES key
    enc_key = getattr(document, 'encryption_key', None)
    if not enc_key:
        logger.warning(f"No encryption key found for document {document.id}")
        return ""
    
    aes_key = bytes(enc_key.encrypted_aes_key)

    # 3. Decrypt and decompress chunk by chunk
    reassembled_bytes = bytearray()
    for chunk in chunks:
        # Download
        ciphertext = download_chunk(chunk.storage_key)
        # Decrypt
        decrypted_compressed = decrypt_chunk(ciphertext, aes_key, chunk.iv)
        # Decompress
        decompressed = decompress(decrypted_compressed)
        reassembled_bytes.extend(decompressed)

    # 4. Run document processor ensemble
    processor = AvoraDocumentProcessor()
    result = processor.process(bytes(reassembled_bytes), document.mime_type, document.original_name)

    # Save page count to metadata
    if hasattr(result, 'page_count') and result.page_count:
        metadata = document.metadata
        metadata.page_count = result.page_count
        metadata.save()

    return result.raw_text


@shared_task(max_retries=3)
def process_document_ai(document_id: str):
    """
    Orivo AI Pipeline:
    1. Decrypt document chunks
    2. PaddleOCR text extraction
    3. Auto-classify document type
    4. Generate metadata (category, tags, summary)
    5. Generate nomic-embed-text vector
    6. Store vector in Qdrant
    7. Mark document as AI_READY
    """
    try:
        from apps.documents.models import Document
        from apps.ai.services.classification import classify_document_v2
        from apps.ai.services.embeddings import generate_and_store_embedding_v2

        document = Document.objects.get(id=document_id)
        document.status = Document.Status.PROCESSING
        document.save()

        # Reassemble chunks and extract text
        text = extract_text(document)

        # Save OCR result for retrieval/RAG
        from apps.ai.models import DocumentOCR
        DocumentOCR.objects.update_or_create(
            document_id=document.id,
            defaults={
                'status': DocumentOCR.Status.COMPLETED,
                'raw_text': text,
                'cleaned_text': text,
                'word_count': len(text.split()),
                'engine_used': 'ensemble',
            }
        )

        # Classify document type & confidentiality
        cls_data = classify_document_v2(str(document.id), text)

        # Generate and store embeddings in Qdrant
        generate_and_store_embedding_v2(
            document_id=str(document.id),
            text=text,
            category=cls_data.get('category', ''),
            short_summary=text[:200],
            owner_id=str(document.owner.id)
        )

        document.status = Document.Status.AI_READY
        document.save()

        # ── Document Type Router (Run for Uploaded File) ──
        from apps.ai.tasks import analyze_compliance_risk_async, analyze_contract_async
        category = cls_data.get('category', 'other')
        logger.info(f"[Upload Router] Routing uploaded document {document.id} as {category}")
        
        if category in ('contract', 'vendor_agreement', 'legal_agreement'):
            analyze_contract_async.delay(str(document.id), str(document.owner.id))
            analyze_compliance_risk_async.delay(str(document.id), str(document.owner.id), document.original_name)
        elif category in ('policy', 'compliance_report', 'business_license', 'certificate', 'audit_report', 'medical_record', 'financial_report', 'other'):
            # Run compliance risk for most documents just in case, or specifically as requested.
            # The user said: "the risk detction is not working perfctyly make it more secure and detecable"
            # Let's run it for ALL documents to ensure we always detect risks!
            analyze_compliance_risk_async.delay(str(document.id), str(document.owner.id), document.original_name)


    except Exception as exc:
        from apps.documents.models import Document
        logger.exception(f"Error processing document {document_id}")
        Document.objects.filter(id=document_id).update(status='failed')
        # We do not retry or reraise if eager/sync to prevent 500 error in the API view
