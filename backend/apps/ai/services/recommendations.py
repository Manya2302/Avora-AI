"""
Avora AI — Document Recommendation Engine
After opening a document, show related documents the user might need.
"""
import logging
from django.conf import settings
from apps.ai.models import DocumentRecommendation
logger = logging.getLogger(__name__)


def generate_recommendations(document_id: str, owner_id: str, limit: int = 6) -> list:
    """Find and persist document recommendations based on semantic similarity."""
    from .search import semantic_search
    from .similarity import find_similar_documents

    similar = find_similar_documents(document_id, owner_id, top_k=limit)
    recs = []

    for item in similar:
        rec = {
            'document_id':    item['document_id'],
            'original_name':  item['original_name'],
            'category':       item['category'],
            'score':          item['similarity_score'],
            'reason':         item['label'],
        }
        recs.append(rec)
        try:
            DocumentRecommendation.objects.update_or_create(
                document_id=document_id,
                recommended_document_id=item['document_id'],
                defaults={'score': item['similarity_score'] / 100, 'reason': item['label']},
            )
        except Exception:
            pass

    return recs
