"""
Avora AI — Hybrid Retrieval Engine
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Combines 5 complementary signals then reranks:

  1. Vector Search  – semantic cosine similarity via Qdrant
  2. BM25           – classical keyword/TF-IDF scoring via Django ORM
  3. Metadata       – category / department / tag boosting
  4. Knowledge Graph – relationship-based score spreading
  5. Recency        – time-decay favour for recently updated docs

Final result is sorted by a weighted composite score and the top-K
unique documents are returned.
"""

import logging
import math
import time
from datetime import timezone as dt_tz
from django.conf import settings
from django.utils import timezone
from .embeddings import generate_embedding  # noqa: F401 (kept for callers importing it from here)

logger = logging.getLogger(__name__)

# ── Fusion Weights ────────────────────────────────────────────
W_VECTOR   = 0.40   # semantic similarity
W_BM25     = 0.25   # keyword relevance
W_METADATA = 0.10   # category / tag / department match
W_GRAPH    = 0.10   # knowledge-graph relationship spreading
W_RECENCY  = 0.15   # time-decay freshness
RECENCY_HALF_LIFE_DAYS = 90  # score halves every 90 days


# ── Main Entry Point ─────────────────────────────────────────

def hybrid_search(
    query: str,
    owner_id: str,
    top_k: int = 10,
    filters: dict | None = None,
    user=None,
) -> dict:
    """
    Full Hybrid Retrieval: Vector + BM25 + Metadata + KG + Recency + Rerank.
    """
    t0 = time.time()
    filters = filters or {}
    from .vector_store import resolve_user
    acl_user = resolve_user(user, owner_id)

    # Step 1 – Vector Search (role-aware, chunk level → best chunk per document)
    vector_scores = _vector_search(query, owner_id, top_k * 3, filters, user=acl_user)

    # Step 2 – BM25 (keyword) over OCR text of documents the user may access
    bm25_scores = _bm25_search(query, owner_id, top_k * 3, user=acl_user)

    # Step 3 – Collect all candidate doc IDs
    all_doc_ids = set(vector_scores.keys()) | set(bm25_scores.keys())
    if not all_doc_ids:
        elapsed = int((time.time() - t0) * 1000)
        if user:
            _log_search(user, query, 0, elapsed, filters)
        return {"results": [], "count": 0, "elapsed_ms": elapsed, "query": query}

    # Step 4 – Metadata boosting
    metadata_scores = _metadata_scores(query, all_doc_ids, filters)

    # Step 5 – Knowledge Graph spreading
    graph_scores = _graph_scores(all_doc_ids, owner_id)

    # Step 6 – Recency decay
    recency_scores = _recency_scores(all_doc_ids, owner_id)

    # Step 7 – Fuse scores
    fused = {}
    for doc_id in all_doc_ids:
        v  = vector_scores.get(doc_id, {}).get("score", 0.0)
        b  = bm25_scores.get(doc_id, 0.0)
        m  = metadata_scores.get(doc_id, 0.0)
        g  = graph_scores.get(doc_id, 0.0)
        r  = recency_scores.get(doc_id, 0.0)
        composite = (W_VECTOR * v) + (W_BM25 * b) + (W_METADATA * m) + (W_GRAPH * g) + (W_RECENCY * r)
        fused[doc_id] = {
            **vector_scores.get(doc_id, {"original_name": "", "category": "", "tags": [], "short_summary": "", "confidentiality": "internal"}),
            "doc_id": doc_id,
            "score": round(composite * 100, 1),
            "score_breakdown": {
                "vector":   round(v * 100, 1),
                "bm25":     round(b * 100, 1),
                "metadata": round(m * 100, 1),
                "graph":    round(g * 100, 1),
                "recency":  round(r * 100, 1),
            },
        }

    # Step 8 – Sort and slice
    results = sorted(fused.values(), key=lambda x: -x["score"])[:top_k]

    elapsed = int((time.time() - t0) * 1000)
    if user:
        _log_search(user, query, len(results), elapsed, filters)

    logger.info(f"[Hybrid] '{query}' → {len(results)} results in {elapsed}ms")
    return {"results": results, "count": len(results), "elapsed_ms": elapsed, "query": query}


# ── Signal 1: Vector Search ───────────────────────────────────

def _vector_search(query: str, owner_id: str, top_k: int, filters: dict, user=None) -> dict:
    """Returns {doc_id: {score, original_name, category, ...}} using the shared
    ACL-aware retriever (owner OR RBAC-granted documents, same-model vectors only)."""
    try:
        from .retrieval import retrieve_chunks
        chunks = retrieve_chunks([query], user=user, owner_id=owner_id, limit_per_query=max(top_k * 2, 30),
                                 filters=filters, max_results=300)
        out = {}
        for c in chunks:
            d = c["document_id"]
            if d not in out or c["score"] > out[d]["score"]:
                out[d] = {
                    "document_id":     d,
                    "original_name":   c.get("original_name", ""),
                    "category":        c.get("category", ""),
                    "tags":            [],
                    "short_summary":   (c.get("text") or "")[:200].strip() + "...",
                    "confidentiality": c.get("confidentiality", "internal"),
                    "score":           c["score"],
                    "page":            c.get("page_start") or None,
                    "match_type":      c.get("chunk_type", "text"),
                }
        return out
    except Exception as e:
        logger.warning(f"[Hybrid/Vector] {e}")
        return {}



# ── Signal 2: BM25 via DB ─────────────────────────────────────

def _bm25_search(query: str, owner_id: str, top_k: int, user=None) -> dict:
    """
    BM25 over DocumentOCR.cleaned_text, restricted to documents the user can access.
    The database prefilters rows containing at least one query term (icontains), so we
    no longer pull every document's full text into Python on every query.
    Returns {doc_id: normalised_score 0-1}
    """
    try:
        import re
        from django.db.models import Q
        from apps.ai.models import DocumentOCR
        from apps.documents.models import Document

        tokens = list(dict.fromkeys(t.lower() for t in re.findall(r"[A-Za-z0-9][A-Za-z0-9\-\.]*", query) if len(t) > 2))
        if not tokens:
            return {}

        if user is not None:
            from apps.organizations.permissions import get_accessible_document_ids
            scope = list(get_accessible_document_ids(user))
        else:
            scope = [str(i) for i in Document.objects.filter(owner_id=owner_id, is_deleted=False)
                     .values_list("id", flat=True)]
        if not scope:
            return {}
        ready = set()
        for i in range(0, len(scope), 900):
            ready |= {str(x) for x in Document.objects.filter(id__in=scope[i:i + 900], status="ai_ready")
                      .values_list("id", flat=True)}
        if not ready:
            return {}

        term_q = Q()
        for t in tokens[:8]:
            term_q |= Q(cleaned_text__icontains=t)
        rows = []
        ready = list(ready)
        for i in range(0, len(ready), 900):
            rows += list(DocumentOCR.objects.filter(term_q, document_id__in=ready[i:i + 900])
                         .values_list("document_id", "cleaned_text")[:500])

        if not rows:
            return {}
        texts = {str(d): (t or "").lower() for d, t in rows}
        lens = {d: max(len(t.split()), 1) for d, t in texts.items()}
        avg_dl = sum(lens.values()) / len(lens)
        n = len(texts)
        df = {tok: sum(1 for t in texts.values() if tok in t) for tok in tokens}
        k1, b = 1.5, 0.75
        scores = {}
        for d, t in texts.items():
            s = 0.0
            for tok in tokens:
                tf = t.count(tok)
                if tf:
                    idf = math.log(1 + (n - df[tok] + 0.5) / (df[tok] + 0.5))
                    s += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * lens[d] / avg_dl))
            if s > 0:
                scores[d] = s
        mx = max(scores.values(), default=0)
        top = sorted(scores.items(), key=lambda x: -x[1])[:top_k]
        return {k: v / mx for k, v in top} if mx else {}
    except Exception as e:
        logger.warning(f"[Hybrid/BM25] {e}")
        return {}


# ── Signal 3: Metadata Boosting ───────────────────────────────

def _metadata_scores(query: str, doc_ids: set, filters: dict) -> dict:
    """
    Boost score based on:
    - Category match with the query tokens
    - Department match
    - Tag match
    """
    try:
        from apps.ai.models import DocumentTag, DocumentMetadataAI
        from apps.ai.models import DocumentClassification

        q_lower = query.lower()
        scores = {}

        # Fetch classifications for category-query matching
        classifications = DocumentClassification.objects.filter(
            document_id__in=doc_ids
        ).values("document_id", "category")

        for cls in classifications:
            doc_id = str(cls["document_id"])
            cat = (cls["category"] or "").lower().replace("_", " ")
            score = 0.0
            if any(token in cat for token in q_lower.split()):
                score += 0.5
            # Boost if department filter matches
            if filters.get("category") and cat == filters["category"].lower():
                score += 0.5
            scores[doc_id] = score

        # Tag matching
        tags = DocumentTag.objects.filter(document_id__in=doc_ids).values("document_id", "tag")
        for t in tags:
            doc_id = str(t["document_id"])
            if (t["tag"] or "").lower() in q_lower:
                scores[doc_id] = scores.get(doc_id, 0.0) + 0.3

        # Normalise to 0-1
        max_s = max(scores.values(), default=1.0) or 1.0
        return {k: min(v / max_s, 1.0) for k, v in scores.items()}
    except Exception as e:
        logger.warning(f"[Hybrid/Metadata] {e}")
        return {}


# ── Signal 4: Knowledge Graph ─────────────────────────────────

def _graph_scores(doc_ids: set, owner_id: str) -> dict:
    """
    If a candidate document has relationships to many other documents
    owned by this user, it receives a higher graph centrality score.
    """
    try:
        from apps.ai.models import DocumentRelationship

        # Count outgoing + incoming relationships for each doc
        relationship_counts = {}
        relationships = DocumentRelationship.objects.filter(
            source_document_id__in=doc_ids
        ).values("source_document_id", "similarity_score")

        for rel in relationships:
            doc_id = str(rel["source_document_id"])
            relationship_counts[doc_id] = relationship_counts.get(doc_id, 0.0) + (rel["similarity_score"] or 0.5)

        max_s = max(relationship_counts.values(), default=1.0) or 1.0
        return {k: min(v / max_s, 1.0) for k, v in relationship_counts.items()}
    except Exception as e:
        logger.warning(f"[Hybrid/Graph] {e}")
        return {}


# ── Signal 5: Recency Decay ───────────────────────────────────

def _recency_scores(doc_ids: set, owner_id: str) -> dict:
    """
    Score = e^(-lambda * days_old), where lambda = ln(2) / half_life
    Documents updated recently score close to 1.0.
    """
    try:
        from apps.documents.models import Document

        # doc_ids are already access-checked (shared documents included)
        docs = Document.objects.filter(id__in=list(doc_ids)).values("id", "updated_at")

        now = timezone.now()
        lam = math.log(2) / RECENCY_HALF_LIFE_DAYS
        scores = {}

        for doc in docs:
            delta = (now - doc["updated_at"]).days
            scores[str(doc["id"])] = math.exp(-lam * max(delta, 0))

        return scores
    except Exception as e:
        logger.warning(f"[Hybrid/Recency] {e}")
        return {}


# ── Analytics Logger ──────────────────────────────────────────

def _log_search(user, query: str, result_count: int, elapsed_ms: int, filters: dict):
    try:
        from apps.ai.models import SearchHistory, SearchAnalytics
        SearchHistory.objects.create(
            user=user, query=query, result_count=result_count,
            search_ms=elapsed_ms, filters=filters,
        )
        obj, _ = SearchAnalytics.objects.get_or_create(query=query)
        obj.search_count += 1
        obj.avg_results = (obj.avg_results * (obj.search_count - 1) + result_count) / obj.search_count
        obj.save(update_fields=["search_count", "avg_results", "last_searched"])
    except Exception as e:
        logger.debug(f"[Hybrid] Analytics log error: {e}")
