"""Avora AI — Phase 2 Embedding Service (with rich payload storage)."""
import logging, requests, uuid, os
from django.conf import settings
logger = logging.getLogger(__name__)

_fallback_logged_embed = False

def generate_local_fallback_embedding(text: str) -> list:
    import hashlib
    import math
    import re
    
    dim = getattr(settings, 'QDRANT_VECTOR_SIZE', 1024)
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


def generate_embedding(text: str, is_query: bool = False) -> list:
    global _fallback_logged_embed
    if not text.strip():
        return [0.0] * getattr(settings, 'QDRANT_VECTOR_SIZE', 1024)
        
    from utils.circuit_breaker import cohere_embed_cb
    cohere_key = getattr(settings, 'COHERE_API_KEY', None) or os.getenv('COHERE_API_KEY')
    
    if cohere_key and cohere_embed_cb.is_healthy():
        try:
            resp = requests.post(
                "https://api.cohere.ai/v1/embed",
                headers={"Authorization": f"Bearer {cohere_key}"},
                json={
                    "texts": [text[:3072]],
                    "model": "embed-english-v3.0",
                    "input_type": "search_query" if is_query else "search_document"
                },
                timeout=15
            )
            if resp.status_code == 200:
                cohere_embed_cb.record_success()
                return resp.json()['embeddings'][0]
            elif resp.status_code == 429:
                logger.warning("Cohere rate limit reached.")
                cohere_embed_cb.record_failure()
            else:
                logger.error(f"Cohere embed error: {resp.status_code}")
                cohere_embed_cb.record_failure()
        except requests.exceptions.Timeout:
            logger.error("Cohere embed timeout.")
            cohere_embed_cb.record_failure()
        except Exception as e:
            logger.error(f"Cohere embed error: {e}")
            cohere_embed_cb.record_failure()

    if not _fallback_logged_embed:
        logger.info("Embedding:\nFallback → nomic-embed-text")
        _fallback_logged_embed = True

    fallback_model = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
    host = os.getenv("OLLAMA_HOST", getattr(settings, "OLLAMA_HOST", "http://localhost:11434"))
    try:
        resp = requests.post(
            f"{host}/api/embeddings",
            json={"model": fallback_model, "prompt": text[:3072]},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json().get('embedding', [0.0] * getattr(settings, 'QDRANT_VECTOR_SIZE', 1024))
    except Exception as e:
        logger.warning(f"[Avora Embed] Ollama error, using local math fallback: {e}")
        return generate_local_fallback_embedding(text)


def chunk_text(text: str, max_chars: int = 2000, overlap: int = 200) -> list:
    paras = [p.strip() for p in text.split('\n') if p.strip()]
    chunks = []
    current_chunk = ""
    for p in paras:
        if len(current_chunk) + len(p) > max_chars and current_chunk:
            chunks.append(current_chunk.strip())
            words = current_chunk.split()
            current_chunk = " ".join(words[-40:]) + "\n" + p
        else:
            current_chunk += "\n" + p
    if current_chunk:
        chunks.append(current_chunk.strip())
    if not chunks and text.strip():
        chunks = [text.strip()]
    return chunks

def generate_embeddings_batch(texts: list) -> list:
    from utils.circuit_breaker import cohere_embed_cb
    global _fallback_logged_embed
    
    if not texts: return []
    cohere_key = getattr(settings, 'COHERE_API_KEY', None) or os.getenv('COHERE_API_KEY')
    
    if cohere_key and cohere_embed_cb.is_healthy():
        try:
            all_embeddings = []
            failed_batch = False
            for i in range(0, len(texts), 90):
                batch = texts[i:i+90]
                resp = requests.post(
                    "https://api.cohere.ai/v1/embed",
                    headers={"Authorization": f"Bearer {cohere_key}"},
                    json={
                        "texts": [t[:3072] for t in batch],
                        "model": "embed-english-v3.0",
                        "input_type": "search_document"
                    },
                    timeout=30
                )
                if resp.status_code == 200:
                    cohere_embed_cb.record_success()
                    all_embeddings.extend(resp.json()['embeddings'])
                elif resp.status_code == 429:
                    logger.warning("Cohere rate limit reached (batch).")
                    cohere_embed_cb.record_failure()
                    failed_batch = True
                    break
                else:
                    logger.error(f"Cohere batch error: {resp.text}")
                    cohere_embed_cb.record_failure()
                    failed_batch = True
                    break
            
            if not failed_batch:
                return all_embeddings
        except requests.exceptions.Timeout:
            logger.error("Cohere embed timeout (batch).")
            cohere_embed_cb.record_failure()
        except Exception as e:
            logger.error(f"Cohere embed batch error: {e}")
            cohere_embed_cb.record_failure()
            
    if not _fallback_logged_embed:
        logger.info("Embedding:\nFallback → nomic-embed-text")
        _fallback_logged_embed = True
            
    return [generate_embedding(t) for t in texts]


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

    client     = get_client()
    collection = settings.QDRANT_COLLECTION

    try:
        client.get_collection(collection)
    except Exception:
        client.create_collection(
            collection_name=collection,
            vectors_config=VectorParams(size=getattr(settings, 'QDRANT_VECTOR_SIZE', 1024), distance=Distance.COSINE),
        )
        client.create_payload_index(
            collection_name=collection,
            field_name="owner_id",
            field_schema="keyword"
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

    chunks = chunk_text(text)
    vectors = generate_embeddings_batch(chunks)
    
    points = []
    for i, (chunk_str, vector) in enumerate(zip(chunks, vectors)):
        point_id = str(uuid.uuid5(uuid.UUID(str(document_id)), f"chunk_{i}"))
        points.append(PointStruct(
            id=point_id,
            vector=vector,
            payload={
                'document_id':     str(document_id),
                'owner_id':        str(owner_id),
                'chunk_index':     i,
                'chunk_text':      chunk_str,
                'category':        category,
                'confidentiality': confidentiality,
                'short_summary':   short_summary,
                'original_name':   original_name,
                'tags':            [],
            }
        ))
        
    for i in range(0, len(points), 100):
        client.upsert(
            collection_name=collection,
            points=points[i:i+100]
        )

    DocumentEmbedding.objects.update_or_create(
        document_id=document_id,
        defaults={
            'qdrant_point_id': uuid.UUID(str(document_id)),
            'model_name':      settings.OLLAMA_EMBED_MODEL,
            'vector_size':     len(vector),
        }
    )
    logger.info(f"[Avora Embed] Stored {document_id}")
