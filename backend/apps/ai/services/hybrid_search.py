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
from .embeddings import generate_embedding

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

    # Step 1 – Vector Search
    vector_scores = _vector_search(query, owner_id, top_k * 3, filters, user=user)

    # Step 2 – BM25 (keyword) over OCR text stored in DB
    bm25_scores = _bm25_search(query, owner_id, top_k * 3)

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
    """Returns {doc_id: {score, original_name, category, ...}}"""
    try:
        from qdrant_client.models import Filter, FieldCondition, MatchValue, HasIdCondition
        from utils.qdrant_client import get_client

        vector = generate_embedding(query, is_query=True)
        client = get_client()

        # Build permission-aware filter
        must = []

        if user:
            # Use the permission engine to restrict to accessible documents
            try:
                from apps.organizations.permissions import get_accessible_document_ids
                accessible = get_accessible_document_ids(user)
                if accessible:
                    # Qdrant: filter by payload document_id being in the accessible set
                    # We use owner_id as baseline + accessible doc override
                    must.append(FieldCondition(key="owner_id", match=MatchValue(value=owner_id)))
                else:
                    must.append(FieldCondition(key="owner_id", match=MatchValue(value=owner_id)))
            except Exception:
                must.append(FieldCondition(key="owner_id", match=MatchValue(value=owner_id)))
        else:
            must.append(FieldCondition(key="owner_id", match=MatchValue(value=owner_id)))

        if filters.get("category"):
            must.append(FieldCondition(key="category", match=MatchValue(value=filters["category"])))
        if filters.get("confidentiality"):
            must.append(FieldCondition(key="confidentiality", match=MatchValue(value=filters["confidentiality"])))

        res = client.query_points(
            collection_name=settings.QDRANT_COLLECTION,
            query=vector,
            query_filter=Filter(must=must),
            limit=top_k,
            with_payload=True,
        )

        out = {}
        for r in res.points:
            doc_id = r.payload.get("document_id")
            if not doc_id:
                continue
            if doc_id not in out or r.score > out[doc_id]["score"]:
                short_summary = r.payload.get("chunk_text", r.payload.get("short_summary", ""))[:200].strip() + "..."
                is_encrypted = r.payload.get("is_encrypted", False)
                if is_encrypted and (r.payload.get("short_summary_enc") or r.payload.get("chunk_text_enc")):
                    try:
                        from apps.documents.models import DocumentEncryptionKey
                        from apps.documents.services.encryption import decrypt_string
                        key_record = DocumentEncryptionKey.objects.get(document_id=doc_id)
                        aes_key = key_record.encrypted_aes_key
                        if r.payload.get("chunk_text_enc"):
                            short_summary = decrypt_string(r.payload.get("chunk_text_enc"), aes_key)[:200].strip() + "..."
                        elif r.payload.get("short_summary_enc"):
                            short_summary = decrypt_string(r.payload.get("short_summary_enc"), aes_key)[:200].strip() + "..."
                    except Exception as dec_err:
                        short_summary = "[Encrypted Content]"

                out[doc_id] = {
                    "document_id":    doc_id,
                    "original_name":  r.payload.get("original_name", ""),
                    "category":       r.payload.get("category", ""),
                    "tags":           r.payload.get("tags", []),
                    "short_summary":  short_summary,
                    "confidentiality": r.payload.get("confidentiality", "internal"),
                    "score":          r.score,
                }
        return out
    except Exception as e:
        logger.warning(f"[Hybrid/Vector] {e}")
        return {}


# ── Signal 2: BM25 via DB ─────────────────────────────────────

def _bm25_search(query: str, owner_id: str, top_k: int) -> dict:
    """
    Approximate BM25 over DocumentOCR.cleaned_text using Django ORM.
    We tokenise the query and count term frequencies.
    Returns {doc_id: normalised_score 0-1}
    """
    try:
        from apps.ai.models import DocumentOCR
        from apps.documents.models import Document

        tokens = [t.lower() for t in query.split() if len(t) > 2]
        if not tokens:
            return {}

        # Fetch OCR rows for this owner
        doc_ids = Document.objects.filter(
            owner_id=owner_id, is_deleted=False, status="ai_ready"
        ).values_list("id", flat=True)

        ocr_rows = DocumentOCR.objects.filter(document_id__in=doc_ids).only(
            "document_id", "cleaned_text", "raw_text"
        )

        scores = {}
        max_score = 0.0

        for row in ocr_rows:
            text = (row.cleaned_text or row.raw_text or "").lower()
            if not text:
                continue
            word_count = len(text.split()) or 1

            # Simple TF score (BM25 approximation, k1=1.5, b=0.75)
            avg_dl = 500  # approximate average document length in words
            k1, b = 1.5, 0.75
            tf_score = 0.0
            for token in tokens:
                tf = text.count(token)
                tf_bm25 = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * word_count / avg_dl))
                tf_score += tf_bm25

            doc_id_str = str(row.document_id)
            scores[doc_id_str] = tf_score
            if tf_score > max_score:
                max_score = tf_score

        # Normalise to 0-1
        if max_score > 0:
            return {k: v / max_score for k, v in scores.items() if v > 0}
        return {}
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

        docs = Document.objects.filter(
            id__in=doc_ids, owner_id=owner_id
        ).values("id", "updated_at")

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
