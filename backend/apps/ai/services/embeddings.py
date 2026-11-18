"""
Avora AI — Embedding Service (v2)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
What changed vs v1 and why:

  SPEED
  • Cohere batches (96 texts) run CONCURRENTLY (EMBED_CONCURRENCY, default 4) instead of
    one after another; 429s are retried with backoff (respecting Retry-After) instead of
    abandoning the whole batch.
  • The Ollama fallback uses the batch endpoint /api/embed (32 texts per call) instead of
    one HTTP call per chunk (400 chunks = 400 sequential calls before).
  • Per-text cache keyed by (model, sha256(text)): re-uploads, new versions and retried
    tasks only embed chunks that actually changed.

  CORRECTNESS
  • One model per document. v1 could embed half a document with Cohere and half with
    nomic when a rate-limit hit mid-way: those vectors live in different spaces and
    cosine between them is noise. Now a document is embedded entirely by one model and
    every point records `embed_model`; retrieval only compares a query against points
    of the SAME model.
  • Vectors are zero-padded to QDRANT_VECTOR_SIZE (768-d nomic in a 1024-d collection used
    to fail the upsert). Zero-padding preserves cosine similarity exactly.

Public API kept: generate_embedding, generate_embeddings_batch, chunk_text,
generate_and_store_embedding_v2.
"""
from __future__ import annotations

import hashlib
import logging
import math
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor

import requests
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

COHERE_MODEL = "embed-english-v3.0"
COHERE_BATCH = 96
OLLAMA_BATCH = 32
MAX_EMBED_CHARS = 3000          # Cohere v3 truncates at 512 tokens anyway
CACHE_TTL = 60 * 60 * 24 * 14

TAG_COHERE = f"cohere/{COHERE_MODEL}"
TAG_HASH = "local/hash-1024"


def _dim() -> int:
    return int(getattr(settings, "QDRANT_VECTOR_SIZE", 1024))


def _ollama_model() -> str:
    return os.getenv("OLLAMA_EMBED_MODEL", getattr(settings, "OLLAMA_EMBED_MODEL", "nomic-embed-text"))


def _ollama_host() -> str:
    return os.getenv("OLLAMA_HOST", getattr(settings, "OLLAMA_HOST", "http://localhost:11434"))


def _cohere_key():
    return getattr(settings, "COHERE_API_KEY", None) or os.getenv("COHERE_API_KEY")


def fit_dim(vec: list) -> list:
    """Zero-pad (cosine-preserving) or truncate a vector to the collection size."""
    d = _dim()
    if len(vec) == d:
        return vec
    if len(vec) < d:
        return list(vec) + [0.0] * (d - len(vec))
    logger.warning(f"[Embed] vector of size {len(vec)} truncated to {d}; use a model with ≤{d} dims")
    v = vec[:d]
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


# ── Local deterministic fallback (keeps the system usable offline) ────────

_STOP = {
    'what', 'is', 'the', 'of', 'a', 'an', 'and', 'or', 'to', 'in', 'on', 'at', 'for', 'with', 'by',
    'about', 'this', 'that', 'these', 'those', 'it', 'its', 'you', 'your', 'my', 'me', 'he', 'him',
    'his', 'she', 'her', 'they', 'them', 'their', 'we', 'us', 'our', 'are', 'was', 'were', 'be',
    'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did'
}


def generate_local_fallback_embedding(text: str) -> list:
    dim = _dim()
    vec = [0.0] * dim
    words = re.findall(r'[a-zA-Z0-9]+', text.lower())
    words = [w for w in words if w not in _STOP] or words
    for w in words:
        vec[int(hashlib.md5(w.encode()).hexdigest(), 16) % dim] += 1.0
    l2 = math.sqrt(sum(v * v for v in vec))
    return [v / l2 for v in vec] if l2 else vec


# ── Providers ────────────────────────────────────────────────────────────

class _ProviderError(Exception):
    pass


def _cohere_batch(texts: list, input_type: str) -> list:
    from utils.circuit_breaker import cohere_embed_cb
    key = _cohere_key()
    for attempt in range(4):
        if not cohere_embed_cb.is_healthy():
            raise _ProviderError("cohere circuit open")
        try:
            resp = requests.post(
                "https://api.cohere.ai/v1/embed",
                headers={"Authorization": f"Bearer {key}"},
                json={"texts": [t[:MAX_EMBED_CHARS] for t in texts], "model": COHERE_MODEL,
                      "input_type": input_type, "truncate": "END"},
                timeout=40,
            )
        except requests.exceptions.RequestException as e:
            if attempt < 3:
                time.sleep(1.0 * (attempt + 1))
                continue
            cohere_embed_cb.record_failure()
            raise _ProviderError(str(e))
        if resp.status_code == 200:
            cohere_embed_cb.record_success()
            return resp.json()["embeddings"]
        if resp.status_code in (429, 500, 502, 503, 504) and attempt < 3:
            wait = float(resp.headers.get("Retry-After", 0) or 0) or (1.5 * (2 ** attempt))
            logger.warning(f"[Embed] Cohere {resp.status_code}, retry in {wait:.1f}s")
            time.sleep(min(wait, 20))
            continue
        cohere_embed_cb.record_failure()
        raise _ProviderError(f"cohere {resp.status_code}: {resp.text[:200]}")
    raise _ProviderError("cohere retries exhausted")


def _ollama_batch(texts: list, is_query: bool) -> list:
    from utils.circuit_breaker import ollama_embed_cb
    if not ollama_embed_cb.is_healthy():
        raise _ProviderError("ollama circuit open")
    model = _ollama_model()
    # nomic-embed-text is trained with task prefixes; they measurably improve retrieval
    if "nomic" in model:
        texts = [("search_query: " if is_query else "search_document: ") + t for t in texts]
    texts = [t[:MAX_EMBED_CHARS * 2] for t in texts]
    try:
        resp = requests.post(f"{_ollama_host()}/api/embed", json={"model": model, "input": texts}, timeout=120)
        if resp.status_code == 200 and resp.json().get("embeddings"):
            ollama_embed_cb.record_success()
            return resp.json()["embeddings"]
        if resp.status_code != 404:
            raise _ProviderError(f"ollama {resp.status_code}: {resp.text[:200]}")
        # Old Ollama (<0.3): no batch endpoint → parallel single calls
        def one(t):
            r = requests.post(f"{_ollama_host()}/api/embeddings", json={"model": model, "prompt": t}, timeout=60)
            r.raise_for_status()
            return r.json()["embedding"]
        with ThreadPoolExecutor(max_workers=4) as ex:
            out = list(ex.map(one, texts))
        ollama_embed_cb.record_success()
        return out
    except _ProviderError:
        ollama_embed_cb.record_failure()
        raise
    except Exception as e:
        ollama_embed_cb.record_failure()
        raise _ProviderError(str(e))


def _providers():
    """Ordered provider list: (tag, batch_size, fn(texts, is_query))."""
    out = []
    if _cohere_key():
        out.append((TAG_COHERE, COHERE_BATCH,
                    lambda ts, q: _cohere_batch(ts, "search_query" if q else "search_document")))
    out.append((f"ollama/{_ollama_model()}", OLLAMA_BATCH, _ollama_batch))
    return out


def primary_model_tag() -> str:
    return _providers()[0][0]


# ── Core embedding with cache + concurrency ──────────────────────────────

def _ck(tag: str, text: str, is_query: bool) -> str:
    return f"emb:{tag}:{'q' if is_query else 'd'}:{hashlib.sha256(text.encode('utf-8', 'ignore')).hexdigest()}"


def embed_texts(texts: list, is_query: bool = False) -> tuple[list, str]:
    """
    Embed many texts with ONE model (first healthy provider that succeeds for ALL texts).
    Returns (vectors fitted to collection dim, model_tag).
    """
    if not texts:
        return [], primary_model_tag()
    concurrency = int(os.getenv("EMBED_CONCURRENCY", "4"))

    for tag, bsize, fn in _providers():
        keys = [_ck(tag, t, is_query) for t in texts]
        try:
            cached = cache.get_many(keys)
        except Exception:
            cached = {}
        missing = [i for i, k in enumerate(keys) if k not in cached]
        vectors = [cached.get(k) for k in keys]
        if missing:
            batches = [missing[i:i + bsize] for i in range(0, len(missing), bsize)]
            try:
                def run(idx_batch):
                    return idx_batch, fn([texts[i] or " " for i in idx_batch], is_query)
                workers = min(concurrency, len(batches))
                if workers > 1:
                    with ThreadPoolExecutor(max_workers=workers) as ex:
                        results = list(ex.map(run, batches))
                else:
                    results = [run(b) for b in batches]
            except _ProviderError as e:
                logger.warning(f"[Embed] {tag} failed ({e}); trying next provider")
                continue
            new = {}
            for idx_batch, embs in results:
                if len(embs) != len(idx_batch):
                    logger.warning(f"[Embed] {tag} returned {len(embs)} vectors for {len(idx_batch)} texts")
                    break
                for i, v in zip(idx_batch, embs):
                    v = fit_dim(v)
                    vectors[i] = v
                    new[keys[i]] = v
            else:
                try:
                    cache.set_many(new, CACHE_TTL)
                except Exception:
                    pass
                return vectors, tag
            continue
        return vectors, tag

    logger.warning("[Embed] all providers failed → local hash embeddings (low quality)")
    return [generate_local_fallback_embedding(t) for t in texts], TAG_HASH


def generate_query_embedding(text: str) -> tuple[list, str]:
    vecs, tag = embed_texts([text or " "], is_query=True)
    return vecs[0], tag


def generate_query_embeddings(texts: list) -> tuple[list, str]:
    return embed_texts([t or " " for t in texts], is_query=True)


# ── Backwards-compatible API ─────────────────────────────────────────────

def generate_embedding(text: str, is_query: bool = False) -> list:
    if not (text or "").strip():
        return [0.0] * _dim()
    vecs, _ = embed_texts([text], is_query=is_query)
    return vecs[0]


def generate_embeddings_batch(texts: list) -> list:
    vecs, _ = embed_texts(texts, is_query=False)
    return vecs


def chunk_text(text: str, max_chars: int = 2000, overlap: int = 200) -> list:
    """Legacy helper — new code uses apps.ai.engine.chunker."""
    from apps.ai.engine.chunker import chunk_plain_text
    return [c.content for c in chunk_plain_text(text)] or ([text.strip()] if text.strip() else [])


def generate_and_store_embedding_v2(document_id: str, text: str, category: str = '',
                                    short_summary: str = '', owner_id: str = '', chunks: list | None = None):
    """Index a document's text into Qdrant (replaces previous points for that document).
    `chunks` (list[Chunk]) may be passed to reuse structure-aware chunks from ingestion."""
    from apps.ai.engine.chunker import chunk_plain_text
    from apps.ai.services.vector_store import index_document_chunks
    chunks = chunks if chunks is not None else chunk_plain_text(text)
    return index_document_chunks(document_id, chunks, category=category,
                                 short_summary=short_summary, replace=True)
