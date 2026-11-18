"""
Avora AI — Vector Store (Qdrant) helpers
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Single place for: collection/index bootstrap, writing a document's chunks,
deleting a document's points, and building the access-control filter.

Point layout (same collection, same unnamed 1024-d vector as before):
  • chunk points    id = uuid5(doc, "<type>_<i>")   chunk_type ∈ text|table|figure
  • document point  id = document_id                chunk_type = "document"
        vector = normalised mean of the doc's chunk vectors (no extra API call).
        Used by similarity / duplicate detection; excluded from chunk retrieval.

Payload (indexed fields marked *):
  document_id* owner_id* category* confidentiality* department* embed_model* chunk_type*
  chunk_index* page_start* page_end section original_name content_hash is_encrypted
  chunk_text | chunk_text_enc  short_summary | short_summary_enc  figure_kind caption_enc
"""
from __future__ import annotations

import hashlib
import logging
import math
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

from django.conf import settings

logger = logging.getLogger(__name__)

KEYWORD_INDEXES = ["owner_id", "document_id", "category", "confidentiality", "department",
                   "embed_model", "chunk_type"]
INTEGER_INDEXES = ["chunk_index", "page_start"]
UPSERT_BATCH = 128

_ready = False
_ready_lock = threading.Lock()


def collection() -> str:
    return settings.QDRANT_COLLECTION


def ensure_collection():
    """Create the collection + payload indexes once per process (idempotent)."""
    global _ready
    if _ready:
        return
    with _ready_lock:
        if _ready:
            return
        from qdrant_client.models import VectorParams, Distance, PayloadSchemaType
        from utils.qdrant_client import get_client
        client = get_client()
        try:
            client.get_collection(collection())
        except Exception:
            client.create_collection(
                collection_name=collection(),
                vectors_config=VectorParams(size=int(getattr(settings, "QDRANT_VECTOR_SIZE", 1024)),
                                            distance=Distance.COSINE),
            )
        for f in KEYWORD_INDEXES:
            try:
                client.create_payload_index(collection(), field_name=f, field_schema=PayloadSchemaType.KEYWORD)
            except Exception:
                pass  # already exists
        for f in INTEGER_INDEXES:
            try:
                client.create_payload_index(collection(), field_name=f, field_schema=PayloadSchemaType.INTEGER)
            except Exception:
                pass
        _ready = True


def _doc_filter(document_id: str, extra_must=None):
    from qdrant_client.models import Filter, FieldCondition, MatchValue
    return Filter(must=[FieldCondition(key="document_id", match=MatchValue(value=str(document_id)))] + (extra_must or []))


def delete_document_points(document_id: str):
    """Delete ALL points of a document (chunks + document point).
    v1 deleted by id=document_id, which never matched the uuid5 chunk ids, so
    deleted documents stayed retrievable in RAG. Filter-delete fixes that."""
    from qdrant_client.models import FilterSelector
    from utils.qdrant_client import get_client
    try:
        get_client().delete(collection_name=collection(),
                            points_selector=FilterSelector(filter=_doc_filter(document_id)), wait=True)
    except Exception as e:
        logger.warning(f"[VectorStore] delete {document_id}: {e}")


def update_document_payload(document_id: str, payload: dict):
    """Patch payload on every point of a document (e.g. new category or confidentiality)."""
    from utils.qdrant_client import get_client
    try:
        get_client().set_payload(collection_name=collection(), payload=payload,
                                 points=_doc_filter(document_id), wait=False)
    except Exception as e:
        logger.warning(f"[VectorStore] set_payload {document_id}: {e}")


def _upsert(points: list):
    from utils.qdrant_client import get_client
    client = get_client()
    batches = [points[i:i + UPSERT_BATCH] for i in range(0, len(points), UPSERT_BATCH)]
    if len(batches) <= 1:
        for b in batches:
            client.upsert(collection_name=collection(), points=b, wait=True)
        return
    with ThreadPoolExecutor(max_workers=4) as ex:
        list(ex.map(lambda b: client.upsert(collection_name=collection(), points=b, wait=True), batches))


def _doc_context(document_id: str) -> dict:
    """Metadata copied into every point payload (single DB round-trip each)."""
    ctx = {"original_name": "", "owner_id": "", "department": "", "confidentiality": "internal",
           "aes_key": None, "category": ""}
    try:
        from apps.documents.models import Document
        doc = Document.objects.select_related("metadata").get(id=document_id)
        ctx["original_name"] = doc.original_name
        ctx["owner_id"] = str(doc.owner_id)
        meta = getattr(doc, "metadata", None)
        if meta:
            ctx["department"] = meta.department or ""
            ctx["category"] = meta.category or ""
    except Exception:
        pass
    try:
        from apps.ai.models import DocumentClassification
        cls = DocumentClassification.objects.filter(document_id=document_id).only("confidentiality", "category").first()
        if cls:
            ctx["confidentiality"] = cls.confidentiality or "internal"
            ctx["category"] = cls.category or ctx["category"]
    except Exception:
        pass
    try:
        from apps.documents.models import DocumentEncryptionKey
        k = DocumentEncryptionKey.objects.filter(document_id=document_id).only("encrypted_aes_key").first()
        if k and k.encrypted_aes_key:
            ctx["aes_key"] = bytes(k.encrypted_aes_key)
    except Exception as e:
        logger.warning(f"[VectorStore] no AES key for {document_id}: {e}")
    return ctx


def index_document_chunks(document_id: str, chunks: list, category: str = "", short_summary: str = "",
                          replace: bool = True, start_index: int = 0, model_tag: str | None = None) -> dict:
    """
    Embed + upsert chunks for a document.
      replace=True  → delete the document's old points first (re-processing / new version)
      replace=False → append (used for the figure phase after text is already searchable)
      model_tag     → force the embedding model (appended chunks must match the doc's model)
    Returns {"chunks", "model", "vectors"}.
    """
    from qdrant_client.models import PointStruct
    from apps.ai.services.embeddings import embed_texts, _providers
    from apps.documents.services.encryption import encrypt_string

    ensure_collection()
    if not chunks:
        if replace:
            delete_document_points(document_id)
        return {"chunks": 0, "model": None, "vectors": []}

    ctx = _doc_context(document_id)
    category = category or ctx["category"]
    name = ctx["original_name"]
    embed_inputs = [c.embed_text(name) for c in chunks]

    vectors, tag = embed_texts(embed_inputs)
    if model_tag and tag != model_tag:
        # Figure phase must use the same model as the text phase; retry restricting providers
        logger.warning(f"[VectorStore] model mismatch ({tag} vs {model_tag}); re-embedding with {model_tag}")
        for ptag, _, fn in _providers():
            if ptag == model_tag:
                try:
                    from apps.ai.services.embeddings import fit_dim
                    vectors, tag = [fit_dim(v) for v in fn(embed_inputs, False)], ptag
                except Exception as e:
                    logger.warning(f"[VectorStore] could not embed with {model_tag}: {e}")
                break

    if replace:
        delete_document_points(document_id)

    aes_key = ctx["aes_key"]
    enc_summary = encrypt_string(short_summary, aes_key) if (aes_key and short_summary) else None
    points = []
    for i, (c, vec) in enumerate(zip(chunks, vectors), start=start_index):
        payload = {
            "document_id": str(document_id),
            "owner_id": ctx["owner_id"],
            "chunk_index": i,
            "chunk_type": c.chunk_type,
            "page_start": int(c.page_start or 0),
            "page_end": int(c.page_end or c.page_start or 0),
            "section": c.section[:200],
            "category": category,
            "confidentiality": ctx["confidentiality"],
            "department": ctx["department"],
            "original_name": name,
            "embed_model": tag,
            "content_hash": hashlib.sha256(c.content.encode("utf-8", "ignore")).hexdigest()[:24],
            "tags": [],
        }
        if c.extra.get("figure_kind"):
            payload["figure_kind"] = c.extra["figure_kind"]
        if aes_key:
            payload["chunk_text_enc"] = encrypt_string(c.content, aes_key)
            if enc_summary:
                payload["short_summary_enc"] = enc_summary
            payload["is_encrypted"] = True
        else:
            payload["chunk_text"] = c.content
            payload["short_summary"] = short_summary
            payload["is_encrypted"] = False
        pid = str(uuid.uuid5(uuid.UUID(str(document_id)), f"{c.chunk_type}_{i}"))
        points.append(PointStruct(id=pid, vector=vec, payload=payload))

    # Document-level point (mean vector) for similarity/duplicates — only on full (re)index
    if replace and vectors:
        d = len(vectors[0])
        mean = [sum(v[j] for v in vectors) / len(vectors) for j in range(d)]
        n = math.sqrt(sum(x * x for x in mean)) or 1.0
        doc_payload = {k: points[0].payload[k] for k in ("document_id", "owner_id", "category", "confidentiality",
                                                          "department", "original_name", "embed_model", "is_encrypted")}
        doc_payload.update({"chunk_type": "document", "chunk_index": -1, "page_start": 0, "tags": []})
        if enc_summary:
            doc_payload["short_summary_enc"] = enc_summary
        elif short_summary and not aes_key:
            doc_payload["short_summary"] = short_summary
        points.append(PointStruct(id=str(uuid.UUID(str(document_id))), vector=[x / n for x in mean], payload=doc_payload))

    _upsert(points)

    try:
        from apps.ai.models import DocumentEmbedding
        if replace:
            DocumentEmbedding.objects.update_or_create(
                document_id=document_id,
                defaults={"qdrant_point_id": uuid.UUID(str(document_id)), "model_name": tag[:100],
                          "vector_size": len(vectors[0]) if vectors else 0, "text_chunk_count": len(chunks)})
        else:
            from django.db.models import F
            DocumentEmbedding.objects.filter(document_id=document_id).update(
                text_chunk_count=F("text_chunk_count") + len(chunks))
    except Exception as e:
        logger.warning(f"[VectorStore] DocumentEmbedding bookkeeping: {e}")

    logger.info(f"[VectorStore] {document_id} +{len(chunks)} chunks ({tag}, replace={replace})")
    return {"chunks": len(chunks), "model": tag, "vectors": vectors}


# ── Access control ───────────────────────────────────────────────────────

def resolve_user(user=None, owner_id: str | None = None):
    if user is not None:
        return user
    if not owner_id:
        return None
    try:
        from django.contrib.auth import get_user_model
        return get_user_model().objects.get(id=owner_id)
    except Exception:
        return None


def build_acl_conditions(user=None, owner_id: str | None = None):
    """
    Returns (acl_filter_condition, allowed_ids_or_None).
    The condition matches points the user may read:
        owner_id == user  OR  document_id ∈ accessible_ids (RBAC/ABAC engine)
    allowed_ids is returned for defence-in-depth post-filtering (None = owner-only).
    """
    from qdrant_client.models import Filter, FieldCondition, MatchValue, MatchAny
    user = resolve_user(user, owner_id)
    uid = str(user.id) if user is not None else str(owner_id or "")
    should = [FieldCondition(key="owner_id", match=MatchValue(value=uid))]
    allowed = None
    if user is not None:
        try:
            from apps.organizations.permissions import get_accessible_document_ids
            allowed = get_accessible_document_ids(user)
            max_ids = int(getattr(settings, "QDRANT_ACL_MAX_IDS", 20000))
            ids = list(allowed)
            if ids and len(ids) <= max_ids:
                should.append(FieldCondition(key="document_id", match=MatchAny(any=ids)))
            elif len(ids) > max_ids:
                logger.warning(f"[ACL] {len(ids)} accessible docs > {max_ids}; owner-only vector filter")
        except Exception as e:
            logger.warning(f"[ACL] permission engine failed, owner-only: {e}")
            allowed = None
    return Filter(should=should), allowed, uid


def is_point_allowed(payload: dict, uid: str, allowed: set | None) -> bool:
    if str(payload.get("owner_id", "")) == uid:
        return True
    return allowed is not None and str(payload.get("document_id", "")) in allowed


class KeyRing:
    """Per-request AES key cache: one DB lookup per document instead of per chunk."""

    def __init__(self):
        self._keys = {}

    def decrypt(self, payload: dict, field: str = "chunk_text") -> str:
        if not payload.get("is_encrypted"):
            return payload.get(field, "") or ""
        enc = payload.get(f"{field}_enc")
        if not enc:
            return ""
        doc_id = payload.get("document_id")
        if doc_id not in self._keys:
            try:
                from apps.documents.models import DocumentEncryptionKey
                k = DocumentEncryptionKey.objects.filter(document_id=doc_id).only("encrypted_aes_key").first()
                self._keys[doc_id] = bytes(k.encrypted_aes_key) if k else None
            except Exception:
                self._keys[doc_id] = None
        key = self._keys[doc_id]
        if not key:
            return "[Encrypted Content]"
        from apps.documents.services.encryption import decrypt_string
        return decrypt_string(enc, key) or "[Encrypted Content - Decryption Failed]"
