"""
Avora AI — Unified Chunk Retrieval (role-aware)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Used by the Copilot RAG engine, hybrid search and semantic search, so every
entry point enforces the SAME access rules and the same ranking logic.

Pipeline:
  1. ACL       owner_id == user  OR  document_id ∈ get_accessible_document_ids(user)
               (+ Python post-check on every hit: defence in depth)
  2. Model     only compare against points embedded with the same model as the query
  3. Vector    all query variations embedded in ONE call and searched in ONE
               Qdrant round-trip (query_batch_points)
  4. Keyword   exact identifiers / numbers in the question ("INV-2024-0113", "₹4,52,000",
               "clause 14.2") are looked up in the OCR text; matching documents get a
               dedicated vector search so an exact-match chunk can't be missed
  5. Lexical   BM25-style score over the candidate chunks' decrypted text
  6. Fusion    Reciprocal Rank Fusion over all ranked lists (+ soft category boost —
               a misclassified document is down-weighted, never made invisible)
"""
from __future__ import annotations

import logging
import math
import re
from collections import Counter

from django.conf import settings

logger = logging.getLogger(__name__)

RRF_K = 60
_STOP = set("""a an and are as at be been but by can could did do does for from had has have how i if in into is it its
me my no not of on or our so than that the their them then there these they this those to us was we were what when where
which who whom why will with would you your about tell show give list find please document documents file""".split())

_ID_RE = re.compile(r"\b(?=[A-Za-z0-9\-/\.]*\d)[A-Za-z0-9][A-Za-z0-9\-/\.]{3,}\b")
_QUOTED_RE = re.compile(r"[\"“']([^\"”']{4,80})[\"”']")


def _tokens(text: str) -> list:
    return [t for t in re.findall(r"[a-z0-9][a-z0-9\-\.]*[a-z0-9]|[a-z0-9]", text.lower())
            if t not in _STOP and len(t) > 1]


def _distinctive_terms(question: str) -> list:
    terms = [m.group(1).strip() for m in _QUOTED_RE.finditer(question)]
    for m in _ID_RE.finditer(question):
        t = m.group(0).strip(".-/")
        if len(re.sub(r"\D", "", t)) >= 2 and not re.fullmatch(r"(19|20)\d\d", t):
            terms.append(t)
    seen, out = set(), []
    for t in terms:
        if t.lower() not in seen:
            seen.add(t.lower())
            out.append(t)
    return out[:3]


def _base_filter(acl_filter, tag: str, filters: dict | None, document_ids: list | None):
    from qdrant_client.models import Filter, FieldCondition, MatchValue, MatchAny, IsEmptyCondition, PayloadField
    from apps.ai.services.embeddings import TAG_COHERE

    model_should = [FieldCondition(key="embed_model", match=MatchValue(value=tag))]
    if tag == TAG_COHERE:  # points indexed before v2 have no embed_model and were Cohere
        model_should.append(IsEmptyCondition(is_empty=PayloadField(key="embed_model")))

    must = [acl_filter, Filter(should=model_should)]
    filters = filters or {}
    if filters.get("category"):
        must.append(FieldCondition(key="category", match=MatchValue(value=filters["category"])))
    if filters.get("confidentiality"):
        must.append(FieldCondition(key="confidentiality", match=MatchValue(value=filters["confidentiality"])))
    if filters.get("department"):
        must.append(FieldCondition(key="department", match=MatchValue(value=filters["department"])))
    if filters.get("chunk_type"):
        must.append(FieldCondition(key="chunk_type", match=MatchValue(value=filters["chunk_type"])))
    if document_ids:
        must.append(FieldCondition(key="document_id", match=MatchAny(any=[str(d) for d in document_ids])))
    must_not = [FieldCondition(key="chunk_type", match=MatchValue(value="document"))]
    return Filter(must=must, must_not=must_not)


def _keyword_doc_ids(terms: list, uid: str, allowed: set | None, limit: int = 15) -> list:
    if not terms:
        return []
    try:
        from django.db.models import Q
        from apps.ai.models import DocumentOCR
        from apps.documents.models import Document
        scope = set(allowed or set())
        scope |= {str(i) for i in Document.objects.filter(owner_id=uid, is_deleted=False).values_list("id", flat=True)}
        if not scope:
            return []
        q = Q()
        for t in terms:
            q |= Q(cleaned_text__icontains=t)
        scope = list(scope)
        found = []
        for i in range(0, len(scope), 900):
            found += [str(x) for x in DocumentOCR.objects.filter(q, document_id__in=scope[i:i + 900])
                      .values_list("document_id", flat=True)[:limit]]
            if len(found) >= limit:
                break
        return found[:limit]
    except Exception as e:
        logger.debug(f"[Retrieval] keyword probe failed: {e}")
        return []


def retrieve_chunks(queries: list, user=None, owner_id: str | None = None, limit_per_query: int = 20,
                    filters: dict | None = None, boost_categories: list | None = None,
                    document_ids: list | None = None, max_results: int = 40) -> list:
    """
    Returns candidate chunks (dicts) ranked by fused score, access-checked and decrypted:
      {chunk_id, document_id, original_name, category, text, score, fused, page_start, page_end,
       section, chunk_type, confidentiality}
    """
    from qdrant_client.models import QueryRequest
    from utils.qdrant_client import get_client
    from apps.ai.services.embeddings import generate_query_embeddings
    from apps.ai.services.vector_store import build_acl_conditions, is_point_allowed, KeyRing, collection, ensure_collection

    queries = [q for q in dict.fromkeys(q.strip() for q in queries if q and q.strip())]
    if not queries:
        return []

    ensure_collection()
    acl_filter, allowed, uid = build_acl_conditions(user=user, owner_id=owner_id)
    vectors, tag = generate_query_embeddings(queries)
    base = _base_filter(acl_filter, tag, filters, document_ids)
    client = get_client()

    requests_ = [QueryRequest(query=v, filter=base, limit=limit_per_query, with_payload=True) for v in vectors]
    kw_terms = _distinctive_terms(queries[0])
    kw_docs = _keyword_doc_ids(kw_terms, uid, allowed) if not document_ids else []
    if kw_docs:
        requests_.append(QueryRequest(query=vectors[0], filter=_base_filter(acl_filter, tag, filters, kw_docs),
                                      limit=limit_per_query, with_payload=True))

    try:
        responses = client.query_batch_points(collection_name=collection(), requests=requests_)
    except Exception as e:
        logger.warning(f"[Retrieval] batch query failed ({e}); falling back to sequential")
        responses = []
        for r in requests_:
            try:
                responses.append(client.query_points(collection_name=collection(), query=r.query,
                                                     query_filter=r.filter, limit=r.limit, with_payload=True))
            except Exception as e2:
                logger.warning(f"[Retrieval] query failed: {e2}")

    keyring = KeyRing()
    cands: dict = {}
    rank_lists = []
    for resp in responses:
        ranked = []
        for h in getattr(resp, "points", []) or []:
            p = h.payload or {}
            if not p.get("document_id") or not is_point_allowed(p, uid, allowed):
                continue
            cid = str(h.id)
            if cid not in cands:
                cands[cid] = {
                    "chunk_id": cid,
                    "document_id": str(p["document_id"]),
                    "original_name": p.get("original_name", ""),
                    "category": p.get("category", ""),
                    "confidentiality": p.get("confidentiality", "internal"),
                    "chunk_type": p.get("chunk_type", "text"),
                    "page_start": p.get("page_start", 0),
                    "page_end": p.get("page_end", 0),
                    "section": p.get("section", ""),
                    "chunk_index": p.get("chunk_index", 0),
                    "_payload": p,
                    "score": float(h.score),
                }
            else:
                cands[cid]["score"] = max(cands[cid]["score"], float(h.score))
            ranked.append(cid)
        rank_lists.append(ranked)

    if not cands:
        return []

    for c in cands.values():
        c["text"] = keyring.decrypt(c.pop("_payload"))

    # Lexical (BM25-lite over candidates) — catches exact terms the embedding blurred
    q_toks = list(dict.fromkeys(_tokens(" ".join(queries[:1]))))
    exact_terms = [t.lower() for t in kw_terms]
    if q_toks or exact_terms:
        docs_toks = {cid: Counter(_tokens(c["text"])) for cid, c in cands.items()}
        n = len(docs_toks)
        avgdl = sum(sum(t.values()) for t in docs_toks.values()) / max(n, 1)
        df = Counter(t for toks in docs_toks.values() for t in set(toks) if t in q_toks)
        lex = {}
        for cid, toks in docs_toks.items():
            dl = sum(toks.values()) or 1
            s = 0.0
            for t in q_toks:
                tf = toks.get(t, 0)
                if tf:
                    idf = math.log(1 + (n - df[t] + 0.5) / (df[t] + 0.5))
                    s += idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * dl / avgdl))
            low = cands[cid]["text"].lower()
            s += sum(3.0 for t in exact_terms if t in low)
            if s > 0:
                lex[cid] = s
        rank_lists.append(sorted(lex, key=lambda k: -lex[k]))

    boost = {c.lower() for c in (boost_categories or [])}
    for cid, c in cands.items():
        fused = sum(1.0 / (RRF_K + lst.index(cid) + 1) for lst in rank_lists if cid in lst)
        if boost and (c["category"] or "").lower() in boost:
            fused *= 1.15
        c["fused"] = fused

    out = sorted(cands.values(), key=lambda c: (-c["fused"], -c["score"]))
    return out[:max_results]


def citation_label(c: dict) -> str:
    """'Annual Report.pdf · p. 42 · chart' — used in RAG context and source lists."""
    parts = [c.get("original_name") or "document"]
    ps, pe = c.get("page_start") or 0, c.get("page_end") or 0
    if ps:
        parts.append(f"p. {ps}" if pe in (0, ps) else f"pp. {ps}-{pe}")
    if c.get("chunk_type") in ("table", "figure"):
        parts.append(c["chunk_type"])
    return " · ".join(parts)
