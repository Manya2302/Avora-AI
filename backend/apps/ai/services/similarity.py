"""
Avora AI — Document Similarity & Duplicate Detection
Uses Qdrant cosine similarity to find near-duplicate or related documents.
"""
import logging
from django.conf import settings
from apps.ai.models import DocumentRelationship
logger = logging.getLogger(__name__)

DUPLICATE_THRESHOLD  = 0.97
REVISION_THRESHOLD   = 0.90
RELATED_THRESHOLD    = 0.75


def find_similar_documents(document_id: str, owner_id: str, top_k: int = 10) -> list:
    """
    Return documents similar to the given document.
    Annotated with relationship type: duplicate / revision / related.
    """
    try:
        from utils.qdrant_client import get_client
        import uuid
        client     = get_client()
        collection = settings.QDRANT_COLLECTION

        # Get target vector
        point_id = str(uuid.UUID(str(document_id)))
        result   = client.retrieve(collection, ids=[point_id], with_vectors=True, with_payload=True)
        if not result:
            return []
        vector = result[0].vector

        # Search other DOCUMENT points (mean-of-chunks vectors) of the same owner & model
        from qdrant_client.models import Filter, FieldCondition, MatchValue
        payload = result[0].payload or {}
        must = [FieldCondition(key="owner_id", match=MatchValue(value=str(owner_id or payload.get("owner_id", "")))),
                FieldCondition(key="chunk_type", match=MatchValue(value="document"))]
        if payload.get("embed_model"):
            must.append(FieldCondition(key="embed_model", match=MatchValue(value=payload["embed_model"])))
        hits = client.query_points(
            collection_name=collection,
            query=vector,
            query_filter=Filter(must=must),
            limit=top_k + 1,  # +1 because self will appear
            with_payload=True,
            score_threshold=RELATED_THRESHOLD,
        ).points

        similar = []
        for hit in hits:
            if str(hit.payload.get('document_id')) == str(document_id):
                continue   # skip self
            score = round(hit.score, 4)
            rel_type = (
                DocumentRelationship.RelType.DUPLICATE if score >= DUPLICATE_THRESHOLD else
                DocumentRelationship.RelType.REVISION  if score >= REVISION_THRESHOLD  else
                DocumentRelationship.RelType.RELATED
            )
            similar.append({
                'document_id':    hit.payload.get('document_id'),
                'original_name':  hit.payload.get('original_name', ''),
                'category':       hit.payload.get('category', ''),
                'similarity_score': round(score * 100, 1),
                'relationship':   rel_type,
                'label': {
                    DocumentRelationship.RelType.DUPLICATE: 'Potential Duplicate',
                    DocumentRelationship.RelType.REVISION:  'Potential Revision',
                    DocumentRelationship.RelType.RELATED:   'Related Document',
                }[rel_type],
            })
            _persist_relationship(document_id, hit.payload.get('document_id'), rel_type, score)

        return similar

    except Exception as e:
        logger.error(f"[Avora Similarity] Error: {e}")
        return []


def _persist_relationship(source_id: str, target_id: str, rel_type: str, score: float):
    try:
        DocumentRelationship.objects.update_or_create(
            source_document_id=source_id,
            target_document_id=target_id,
            defaults={'relationship_type': rel_type, 'similarity_score': score, 'ai_confidence': score},
        )
    except Exception as e:
        logger.debug(f"[Avora Similarity] Relationship persist: {e}")
