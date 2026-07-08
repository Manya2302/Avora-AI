"""
Avora AI — Enhanced Semantic Search Engine
Supports filters, suggestions, analytics logging.
"""
import logging, time
from django.conf import settings
from .embeddings import generate_embedding
logger = logging.getLogger(__name__)


def semantic_search(
    query: str,
    owner_id: str,
    top_k: int = 10,
    filters: dict | None = None,
    user=None,
) -> dict:
    """Full semantic search with filters, timing, and analytics logging.
    Falls back to unfiltered Qdrant query + Python-side owner check
    when payload indexes are not yet created.
    """
    t0 = time.time()
    try:
        from qdrant_client.models import Filter, FieldCondition, MatchValue
        from utils.qdrant_client import get_client

        vector  = generate_embedding(query, is_query=True)
        client  = get_client()

        # Build Qdrant filter
        must = [FieldCondition(key="owner_id", match=MatchValue(value=owner_id))]
        if filters:
            if filters.get('category'):
                must.append(FieldCondition(key="category", match=MatchValue(value=filters['category'])))
            if filters.get('confidentiality'):
                must.append(FieldCondition(key="confidentiality", match=MatchValue(value=filters['confidentiality'])))

        def _run(qfilter):
            return client.query_points(
                collection_name=settings.QDRANT_COLLECTION,
                query=vector,
                query_filter=qfilter,
                limit=top_k,
                with_payload=True,
            )

        # Try filtered first; fall back to unfiltered if payload index missing
        try:
            res = _run(Filter(must=must))
        except Exception as fe:
            if "Index required" in str(fe) or "400" in str(fe):
                logger.warning(
                    "[RAG Search] Payload index missing — unfiltered fallback. "
                    "Run: python create_qdrant_indexes.py to fix permanently."
                )
                res = _run(None)
            else:
                raise

        hits = res.points

        unique_docs = {}
        for r in hits:
            payload = r.payload or {}
            # Python-side ownership enforcement for fallback path
            point_owner = payload.get("owner_id", "")
            if point_owner and str(point_owner) != str(owner_id):
                continue

            doc_id = payload.get('document_id')
            if not doc_id: continue
            if doc_id not in unique_docs or r.score > unique_docs[doc_id]['score_raw']:
                unique_docs[doc_id] = {
                    'document_id':    str(doc_id),
                    'original_name':  payload.get('original_name', ''),
                    'category':       payload.get('category', ''),
                    'tags':           payload.get('tags', []),
                    'short_summary':  payload.get('chunk_text', payload.get('short_summary', ''))[:150].strip() + '...',
                    'confidentiality':payload.get('confidentiality', 'internal'),
                    'score_raw':      r.score,
                    'score':          round(r.score * 100, 1),
                }

        results = sorted(unique_docs.values(), key=lambda x: -x['score_raw'])[:top_k]
        for r in results:
            r.pop('score_raw', None)

        elapsed = int((time.time() - t0) * 1000)

        if user:
            _log_search(user, query, len(results), elapsed, filters or {})

        return {'results': results, 'count': len(results), 'elapsed_ms': elapsed, 'query': query}

    except Exception as e:
        logger.exception(f"[Avora Search] Error:")
        return {'results': [], 'count': 0, 'elapsed_ms': 0, 'query': query}


def get_search_suggestions(partial: str, owner_id: str) -> list:
    """Return query suggestions based on search history + popular terms."""
    try:
        from apps.ai.models import SearchHistory, SearchAnalytics
        # From user history
        history = SearchHistory.objects.filter(
            query__icontains=partial
        ).values_list('query', flat=True).distinct()[:5]
        # From popular
        popular = SearchAnalytics.objects.filter(
            query__icontains=partial
        ).order_by('-search_count').values_list('query', flat=True)[:5]
        return list(dict.fromkeys(list(history) + list(popular)))[:8]
    except Exception:
        return []


def _log_search(user, query: str, result_count: int, elapsed_ms: int, filters: dict):
    try:
        from apps.ai.models import SearchHistory, SearchAnalytics
        SearchHistory.objects.create(
            user=user, query=query, result_count=result_count,
            search_ms=elapsed_ms, filters=filters,
        )
        obj, _ = SearchAnalytics.objects.get_or_create(query=query)
        obj.search_count += 1
        obj.avg_results  = (obj.avg_results * (obj.search_count - 1) + result_count) / obj.search_count
        obj.save(update_fields=['search_count', 'avg_results', 'last_searched'])
    except Exception as e:
        logger.debug(f"[Avora Search] Analytics log error: {e}")
