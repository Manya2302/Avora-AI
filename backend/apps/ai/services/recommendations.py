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

    # Replace this document's cached recommendations in one transaction (was N update_or_create)
    from django.db import transaction
    with transaction.atomic():
        DocumentRecommendation.objects.filter(document_id=document_id).delete()
        DocumentRecommendation.objects.bulk_create([
            DocumentRecommendation(document_id=document_id, recommended_document_id=r['document_id'],
                                   score=r['score'] / 100, reason=r['reason'])
            for r in recs if r.get('document_id')
        ])
    return recs
