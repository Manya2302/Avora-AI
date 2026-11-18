"""
Avora AI — Ingestion Pipeline (v2)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
One pipeline used by every entry point (upload, Google Drive sync, admin re-run,
/api/ai/process). Same architecture (Celery → processor → Cohere/Ollama → Qdrant),
new processing logic:

  load      encrypted chunks downloaded in PARALLEL, then decrypted + decompressed in order
  extract   single-pass page-level PDF parse, OCR only where needed, process pool
  ┌─ classify (Groq/rules)        ┐
  ├─ describe figures (VLM)       ├─ run CONCURRENTLY (all I/O bound)
  └─ chunk + embed text (Cohere)  ┘
  index     text/table chunks upserted → document marked AI_READY (searchable NOW)
  enrich    figure chunks embedded with the SAME model and appended
            figure descriptions appended to DocumentOCR text so compliance / contract /
            graph analysers also "see" the charts

Progress is written to AIProcessingQueue so the UI can show real percentages.
"""
from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor

from django.db import close_old_connections, connection
from django.utils import timezone

logger = logging.getLogger(__name__)


def _threaded(fn):
    """Run ORM-touching work in a worker thread and release its DB connection afterwards."""
    def wrapper(*a, **kw):
        try:
            return fn(*a, **kw)
        finally:
            try:
                connection.close()
            except Exception:
                pass
    return wrapper


def load_document_bytes(document) -> bytes:
    from apps.documents.services.storage import download_chunk
    from apps.documents.services.encryption import decrypt_chunk
    from apps.documents.services.compression import decompress

    chunks = list(document.chunks.all().order_by("chunk_index"))
    if not chunks:
        raise ValueError(f"No stored chunks for document {document.id}")
    enc_key = getattr(document, "encryption_key", None)
    if not enc_key:
        raise ValueError(f"No encryption key for document {document.id}")
    aes_key = bytes(enc_key.encrypted_aes_key)

    with ThreadPoolExecutor(max_workers=min(8, len(chunks))) as ex:
        blobs = list(ex.map(lambda c: download_chunk(c.storage_key), chunks))
    out = bytearray()
    for c, blob in zip(chunks, blobs):
        out.extend(decompress(decrypt_chunk(blob, aes_key, c.iv)))
    return bytes(out)


class IngestionPipeline:
    def __init__(self, document_id: str):
        from apps.ai.models import AIProcessingQueue
        self.document_id = str(document_id)
        self.queue, _ = AIProcessingQueue.objects.get_or_create(
            document_id=self.document_id, defaults={"stage": "queued", "progress": 0})
        self.t0 = time.time()
        self.stats = {}

    def _step(self, stage: str, pct: int):
        try:
            self.queue.stage, self.queue.progress = stage, pct
            self.queue.save(update_fields=["stage", "progress", "updated_at"])
        except Exception:
            pass
        logger.info(f"[Ingest] {self.document_id[:8]} → {stage} ({pct}%)")

    def run(self) -> dict:
        from apps.documents.models import Document
        from apps.ai.models import DocumentOCR
        from apps.ai.engine.document_processor import AvoraDocumentProcessor
        from apps.ai.engine.chunker import chunk_pages, chunk_plain_text
        from apps.ai.engine.vision import describe_figures
        from apps.ai.services.classification import classify_document_v2
        from apps.ai.services.vector_store import index_document_chunks

        doc = Document.objects.select_related("encryption_key").get(id=self.document_id)
        Document.objects.filter(id=doc.id).update(status=Document.Status.PROCESSING)
        self.queue.started_at = timezone.now()
        self.queue.error_message = ""
        self.queue.save(update_fields=["started_at", "error_message", "updated_at"])

        # 1. Load ----------------------------------------------------------
        self._step("text_extraction", 3)
        t = time.time()
        data = load_document_bytes(doc)
        self.stats["load_ms"] = int((time.time() - t) * 1000)

        # 2. Extract -------------------------------------------------------
        self._step("ocr", 8)
        last = [0]

        def on_pages(done, total):
            pct = 8 + int(37 * done / max(total, 1))
            if pct - last[0] >= 3:
                last[0] = pct
                close_old_connections()
                self._step("ocr", pct)

        result = AvoraDocumentProcessor(extract_figures=True, progress_cb=on_pages).process(
            data, doc.mime_type or "", doc.original_name)
        del data
        self.stats.update(result.stats or {})
        text = result.clean_text or result.raw_text or ""

        DocumentOCR.objects.update_or_create(
            document_id=doc.id,
            defaults={"status": DocumentOCR.Status.COMPLETED if text else DocumentOCR.Status.FAILED,
                      "raw_text": result.raw_text, "cleaned_text": text,
                      "confidence_score": result.confidence, "engine_used": (result.engine_used or "")[:50],
                      "word_count": len(text.split()), "page_count": result.page_count,
                      "processing_ms": result.stats.get("extract_ms") if result.stats else None,
                      "error_message": "; ".join(result.warnings)[:2000]})
        try:
            if result.page_count and hasattr(doc, "metadata"):
                doc.metadata.page_count = result.page_count
                doc.metadata.save(update_fields=["page_count", "updated_at"])
        except Exception:
            pass

        # 3. Classify ‖ describe figures ‖ chunk+embed text ------------------
        self._step("classification", 48)
        page_lookup = {}
        for p in result.pages:
            page_lookup[p["page"]] = " ".join(b["text"] for b in p.get("blocks", []))[:1200]

        with ThreadPoolExecutor(max_workers=2) as ex:
            fut_cls = ex.submit(_threaded(classify_document_v2), self.document_id, text)
            fut_fig = ex.submit(describe_figures, result.figures, page_lookup) if result.figures else None

            chunks = chunk_pages(result.pages) if result.pages else chunk_plain_text(text)
            try:
                cls_data = fut_cls.result() or {}
            except Exception as e:
                logger.warning(f"[Ingest] classification failed: {e}")
                cls_data = {}
            category = cls_data.get("category", "other")

            self._step("embedding", 60)
            t = time.time()
            idx = index_document_chunks(self.document_id, chunks, category=category,
                                        short_summary=text[:200], replace=True)
            self.stats["embed_ms"] = int((time.time() - t) * 1000)
            self.stats["text_chunks"] = idx["chunks"]

            # Searchable from here on
            Document.objects.filter(id=doc.id).update(status=Document.Status.AI_READY)
            self._step("storing", 80)

            fig_pairs = []
            if fut_fig is not None:
                try:
                    t = time.time()
                    fig_pairs = fut_fig.result()
                    self.stats["vision_ms"] = int((time.time() - t) * 1000)
                except Exception as e:
                    logger.warning(f"[Ingest] figure description failed: {e}")

        # 4. Enrich with figures -------------------------------------------
        if fig_pairs:
            fig_chunks = chunk_pages([], fig_pairs)
            index_document_chunks(self.document_id, fig_chunks, category=category, short_summary=text[:200],
                                  replace=False, start_index=len(chunks), model_tag=idx["model"])
            self.stats["figure_chunks"] = len(fig_chunks)
            fig_text = "\n\n".join(c.content for c in fig_chunks)
            DocumentOCR.objects.filter(document_id=doc.id).update(
                cleaned_text=(text + "\n\n[FIGURES & CHARTS]\n" + fig_text) if text else fig_text)
            text = (text + "\n\n" + fig_text) if text else fig_text

        self.queue.stage, self.queue.progress = "completed", 100
        self.queue.completed_at = timezone.now()
        self.queue.duration_ms = int((time.time() - self.t0) * 1000)
        self.queue.save()
        self.stats["total_ms"] = self.queue.duration_ms
        logger.info(f"[Ingest] ✅ {self.document_id[:8]} {result.page_count}p {self.stats}")
        return {"document": doc, "text": text, "category": category, "classification": cls_data,
                "page_count": result.page_count, "quality": result.quality_score, "stats": self.stats}

    def fail(self, exc: Exception):
        from apps.documents.models import Document
        try:
            self.queue.stage = "failed"
            self.queue.error_message = str(exc)[:2000]
            self.queue.retry_count += 1
            self.queue.save()
        except Exception:
            pass
        Document.objects.filter(id=self.document_id).update(status="failed")
