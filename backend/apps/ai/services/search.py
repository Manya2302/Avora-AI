"""
Avora AI — Enhanced Semantic Search Engine
Supports filters, suggestions, analytics logging.
"""
import logging, time
from django.conf import settings
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
        from .retrieval import retrieve_chunks
        chunks = retrieve_chunks([query], user=user, owner_id=owner_id, limit_per_query=max(top_k * 3, 30),
                                 filters=filters or {}, max_results=200)
        unique_docs = {}
        for c in chunks:
            d = c["document_id"]
            if d not in unique_docs or c["score"] > unique_docs[d]["score_raw"]:
                unique_docs[d] = {
                    'document_id':    d,
                    'original_name':  c.get('original_name', ''),
                    'category':       c.get('category', ''),
                    'tags':           [],
                    'short_summary':  (c.get('text') or '')[:150].strip() + '...',
                    'confidentiality': c.get('confidentiality', 'internal'),
                    'page':           c.get('page_start') or None,
                    'score_raw':      c["score"],
                    'score':          round(c["score"] * 100, 1),
                }
        results = sorted(unique_docs.values(), key=lambda x: -x['score_raw'])[:top_k]
        for r in results:
            r.pop('score_raw', None)

        elapsed = int((time.time() - t0) * 1000)
        if user:
            _log_search(user, query, len(results), elapsed, filters or {})
        return {'results': results, 'count': len(results), 'elapsed_ms': elapsed, 'query': query}

    except Exception:
        logger.exception("[Avora Search] Error:")
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
