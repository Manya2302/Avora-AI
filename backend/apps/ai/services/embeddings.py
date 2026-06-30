"""Avora AI — Phase 2 Embedding Service (with rich payload storage)."""
import logging, requests, uuid
from django.conf import settings
logger = logging.getLogger(__name__)


def generate_local_fallback_embedding(text: str) -> list:
    import hashlib
    import math
    import re
    
    dim = 768
    vec = [0.0] * dim
    
    # Clean text to alphanumeric lowercase words
    words = re.findall(r'[a-zA-Z0-9]+', text.lower())
    if not words:
        return vec
        
    stopwords = {
        'what', 'is', 'the', 'of', 'a', 'an', 'and', 'or', 'to', 'in', 'on', 'at', 
        'for', 'with', 'by', 'about', 'this', 'that', 'these', 'those', 'it', 'its', 
        'you', 'your', 'my', 'me', 'he', 'him', 'his', 'she', 'her', 'they', 'them', 
        'their', 'we', 'us', 'our', 'are', 'was', 'were', 'be', 'been', 'being', 
        'have', 'has', 'had', 'do', 'does', 'did'
    }
    
    filtered_words = [w for w in words if w not in stopwords]
    if not filtered_words:
        filtered_words = words  # fallback if everything is a stopword
        
    for w in filtered_words:
        h = int(hashlib.md5(w.encode('utf-8')).hexdigest(), 16)
        idx = h % dim
        vec[idx] += 1.0
        
    # L2 Normalization
    l2 = math.sqrt(sum(v*v for v in vec))
    if l2 > 0:
        vec = [v / l2 for v in vec]
        
    return vec


def generate_embedding(text: str) -> list:
    if not text.strip():
        return [0.0] * getattr(settings, 'QDRANT_VECTOR_SIZE', 768)
    try:
        resp = requests.post(
            f"{settings.OLLAMA_HOST}/api/embeddings",
            json={"model": settings.OLLAMA_EMBED_MODEL, "prompt": text[:3072]},
            timeout=30,  # higher timeout to allow model loading
        )
        resp.raise_for_status()
        return resp.json().get('embedding', [0.0] * settings.QDRANT_VECTOR_SIZE)
    except Exception as e:
        logger.warning(f"[Avora Embed] Ollama error, using local fallback word-frequency vectorizer: {e}")
        return generate_local_fallback_embedding(text)


def generate_and_store_embedding_v2(
    document_id: str,
    text: str,
    category: str = '',
    short_summary: str = '',
    owner_id: str = '',
):
    """Generate embedding and store in Qdrant with rich payload for search filtering."""
    from qdrant_client.models import PointStruct, VectorParams, Distance
    from apps.ai.models import DocumentEmbedding, DocumentClassification
    from utils.qdrant_client import get_client

    vector     = generate_embedding(text)
    client     = get_client()
    collection = settings.QDRANT_COLLECTION

    try:
        client.get_collection(collection)
    except Exception:
        client.create_collection(
            collection_name=collection,
            vectors_config=VectorParams(size=settings.QDRANT_VECTOR_SIZE, distance=Distance.COSINE),
        )

    # Pull extra metadata for payload
    confidentiality = 'internal'
    original_name = ''
    try:
        cls = DocumentClassification.objects.get(document_id=document_id)
        confidentiality = cls.confidentiality
    except Exception:
        pass

    try:
        from apps.documents.models import Document
        doc = Document.objects.get(id=document_id)
        original_name = doc.original_name
    except Exception:
        pass

    point_id = str(uuid.UUID(str(document_id)))
    client.upsert(
        collection_name=collection,
        points=[PointStruct(
            id=point_id,
            vector=vector,
            payload={
                'document_id':     str(document_id),
                'owner_id':        str(owner_id),
                'category':        category,
                'confidentiality': confidentiality,
                'short_summary':   short_summary,
                'original_name':   original_name,
                'tags':            [],
            }
        )],
    )

    DocumentEmbedding.objects.update_or_create(
        document_id=document_id,
        defaults={
            'qdrant_point_id': uuid.UUID(point_id),
            'model_name':      settings.OLLAMA_EMBED_MODEL,
            'vector_size':     len(vector),
        }
    )
    logger.info(f"[Avora Embed] Stored {document_id}")
