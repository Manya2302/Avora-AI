"""
Avora AI — Parallel, Page-Level PDF Extractor
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Replaces the old "parse the whole PDF three times (pdfplumber + PyMuPDF + PyPDF2),
then OCR only the first 2 pages at 72 DPI" logic.

How it works:
  1. PRESCAN (inline, ~5 ms/page): open once with PyMuPDF and decide, per page,
     whether the page has a usable digital text layer or needs OCR.
  2. PLAN: estimate cost (digital page ≈ 1 unit, OCR page ≈ 30 units). Cheap docs
     run inline; expensive ones are fanned out across a process pool, with OCR
     pages spread evenly across workers (interleaved, not contiguous ranges).
  3. EXTRACT each page in ONE pass:
       • text blocks with font size/bold (used later for heading detection)
       • tables → Markdown (PyMuPDF find_tables), with their text removed from
         the prose so numbers aren't indexed twice
       • figures → raster images AND vector charts (clustered drawings), rendered
         to PNG with their caption / nearby text, for semantic captioning
       • OCR only for pages that need it, at 200 DPI (every page, not just 2)

Django-free: this module is imported by spawned worker processes.
"""
from __future__ import annotations

import logging
import math
import os
import re
import threading
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

CAPTION_RE = re.compile(r"^\s*(fig(ure)?\b|fig\.|chart\b|graph\b|exhibit\b|diagram\b|plot\b|illustration\b|source\s*:)", re.I)


@dataclass
class ExtractOptions:
    ocr_dpi: int = 0                        # 0 = auto (200 RapidOCR, 150 EasyOCR)
    figure_dpi: int = 144
    min_figure_area_frac: float = 0.04     # ignore logos / icons smaller than 4% of the page
    min_vector_items: int = 6               # a vector cluster needs ≥ N drawing ops to count as a chart
    max_figures_per_page: int = 4
    detect_tables: bool = True
    extract_figures: bool = True
    scanned_page_as_figure: bool = False    # send graphics-heavy scanned pages to the vision model
    figure_ocr: bool = False                # OCR figure labels (used when no vision model is configured)

    def as_dict(self):
        return dict(self.__dict__)


@dataclass
class PrescanInfo:
    page_count: int
    needs_ocr: list = field(default_factory=list)   # page indexes (0-based)


# ── Prescan ──────────────────────────────────────────────────────────────

def _text_is_usable(text: str) -> bool:
    words = text.split()
    if len(words) < 8:
        return False
    avg = sum(len(w) for w in words) / len(words)
    if avg < 2.5 or avg > 18:          # glyph soup / broken encodings
        return False
    bad = text.count("�") + len(re.findall(r"[\x00-\x08\x0e-\x1f]", text))
    return bad / max(len(text), 1) < 0.05


def _image_coverage(page) -> float:
    area = abs(page.rect) or 1.0
    covered = 0.0
    try:
        for info in page.get_image_info():
            covered += abs(page.rect & info["bbox"])
    except Exception:
        return 0.0
    return min(covered / area, 1.0)


def prescan(pdf_path: str) -> PrescanInfo:
    import fitz
    with fitz.open(pdf_path) as doc:
        info = PrescanInfo(page_count=len(doc))
        for i, page in enumerate(doc):
            txt = page.get_text("text")
            if not _text_is_usable(txt) and (_image_coverage(page) > 0.3 or len(txt.strip()) < 20):
                info.needs_ocr.append(i)
        return info


# ── Per-page extraction (runs in workers) ────────────────────────────────

def _blocks_with_style(page, exclude_rects):
    """Return text blocks as dicts with dominant font size + bold flag."""
    import fitz
    out = []
    d = page.get_text("dict", flags=fitz.TEXTFLAGS_TEXT)
    for b in d.get("blocks", []):
        if b.get("type") != 0:
            continue
        rect = fitz.Rect(b["bbox"])
        if any(abs(rect & r) > 0.5 * max(abs(rect), 1) for r in exclude_rects):
            continue  # text belongs to a table/figure we extract separately
        lines, sizes, bold_chars, total_chars = [], [], 0, 0
        for ln in b.get("lines", []):
            spans = ln.get("spans", [])
            t = "".join(s.get("text", "") for s in spans).strip()
            if t:
                lines.append(t)
            for s in spans:
                n = len(s.get("text", "").strip())
                if n:
                    sizes.append((s.get("size", 0), n))
                    total_chars += n
                    if s.get("flags", 0) & 16 or "bold" in s.get("font", "").lower():
                        bold_chars += n
        text = " ".join(lines).strip()
        if not text:
            continue
        size = max(sizes, key=lambda x: x[1])[0] if sizes else 0
        out.append({
            "type": "text",
            "text": text,
            "size": round(size, 1),
            "bold": total_chars > 0 and bold_chars / total_chars > 0.6,
            "bbox": [round(v, 1) for v in rect],
            "chars": total_chars,
        })
    return out


def _table_to_markdown(tab) -> str:
    try:
        rows = tab.extract()
    except Exception:
        return ""
    rows = [[(c or "").replace("\n", " ").strip() for c in r] for r in rows if r and any(c for c in r)]
    if len(rows) < 2:
        return ""
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    header, body = rows[0], rows[1:]
    md = ["| " + " | ".join(header) + " |", "|" + "---|" * width]
    md += ["| " + " | ".join(r) + " |" for r in body]
    return "\n".join(md)


def _caption_for(rect, text_blocks, page_height):
    """Find a caption ('Figure 3: …') or the closest text near a figure rect."""
    best, best_dist = "", 1e9
    for b in text_blocks:
        x0, y0, x1, y1 = b["bbox"]
        # horizontal overlap required
        if x1 < rect.x0 or x0 > rect.x1:
            continue
        if y1 > rect.y0 and y0 < rect.y1:
            continue  # text inside the figure = labels, not its caption
        dist = (y0 - rect.y1) if y0 >= rect.y1 else (rect.y0 - y1)
        if dist > 0.12 * page_height:
            continue
        if CAPTION_RE.match(b["text"]):
            return b["text"][:400]
        if dist < best_dist:
            best, best_dist = b["text"][:300], dist
    return best


def _render_clip(page, rect, dpi):
    pad = 6
    import fitz
    clip = fitz.Rect(rect.x0 - pad, rect.y0 - pad, rect.x1 + pad, rect.y1 + pad) & page.rect
    pix = page.get_pixmap(clip=clip, dpi=dpi)
    return pix.tobytes("png")


def _find_figures(page, opts: ExtractOptions, table_rects, all_text_blocks):
    import fitz
    page_area = abs(page.rect) or 1.0
    min_area = opts.min_figure_area_frac * page_area
    cands = []

    # Raster images (photos, scanned charts, screenshots)
    try:
        for info in page.get_image_info(xrefs=True):
            r = fitz.Rect(info["bbox"]) & page.rect
            if abs(r) >= min_area and abs(r) < 0.97 * page_area:
                cands.append(("raster", r, info.get("xref", 0)))
    except Exception as e:
        logger.debug(f"[Extract] image info p{page.number}: {e}")

    # Vector graphics (matplotlib/Excel charts exported to PDF, diagrams)
    try:
        if hasattr(page, "cluster_drawings"):
            drawings = page.get_drawings()
            if len(drawings) >= opts.min_vector_items:
                for r in page.cluster_drawings(drawings=drawings):
                    if abs(r) < min_area or abs(r) > 0.9 * page_area:
                        continue  # icons/rules, or page borders/backgrounds
                    if any(abs(r & t) > 0.5 * abs(r) for t in table_rects):
                        continue  # it's a table grid, already handled
                    n_items = sum(1 for dr in drawings if fitz.Rect(dr["rect"]).intersects(r))
                    inner_chars = sum(b["chars"] for b in all_text_blocks if fitz.Rect(b["bbox"]).intersects(r))
                    if n_items < opts.min_vector_items:
                        continue
                    if inner_chars > 350 and n_items < 25:
                        continue  # a framed text box / callout, not a chart
                    cands.append(("vector", r, 0))
    except Exception as e:
        logger.debug(f"[Extract] drawings p{page.number}: {e}")

    # Merge overlapping candidates, keep largest first
    cands.sort(key=lambda c: -abs(c[1]))
    kept = []
    for kind, r, xref in cands:
        if any(abs(r & k[1]) > 0.5 * abs(r) for k in kept):
            continue
        kept.append((kind, r, xref))
        if len(kept) >= opts.max_figures_per_page:
            break

    figures = []
    for kind, r, xref in kept:
        try:
            png = _render_clip(page, r, opts.figure_dpi)
        except Exception as e:
            logger.debug(f"[Extract] render p{page.number}: {e}")
            continue
        # Text physically inside the figure = axis labels, legends, data labels
        inner = " ".join(b["text"] for b in all_text_blocks if fitz.Rect(b["bbox"]).intersects(r))[:1200]
        fig = {
            "page": page.number + 1,
            "kind": kind,
            "xref": xref,
            "bbox": [round(v, 1) for v in r],
            "caption": _caption_for(r, all_text_blocks, page.rect.height),
            "inner_text": inner,
            "image_png": png,
        }
        if opts.figure_ocr and not inner:
            from .ocr_engine import ocr_image_bytes
            fig["inner_text"] = ocr_image_bytes(png).get("text", "")[:1200]
        figures.append(fig)
    return figures


def _extract_page(doc, idx: int, ocr: bool, opts: ExtractOptions) -> dict:
    import fitz
    page = doc[idx]
    res = {"page": idx + 1, "blocks": [], "tables": [], "figures": [],
           "ocr_used": False, "ocr_conf": None, "engine": "pymupdf"}

    if ocr:
        from .ocr_engine import ocr_image_bytes
        # Large-format pages: cap pixels so OCR time stays bounded
        dpi = opts.ocr_dpi or 200
        longest_in = max(page.rect.width, page.rect.height) / 72.0
        if longest_in * dpi > 3400:
            dpi = max(110, int(3400 / longest_in))
        png = page.get_pixmap(dpi=dpi).tobytes("png")
        r = ocr_image_bytes(png)
        res.update(ocr_used=True, ocr_conf=r["confidence"], engine=r["engine"])
        paras = [p.strip() for p in re.split(r"\n{2,}", r["text"]) if p.strip()] or (
            [r["text"].strip()] if r["text"].strip() else [])
        res["blocks"] = [{"type": "text", "text": p.replace("\n", " "), "size": 0, "bold": False,
                          "bbox": None, "chars": len(p)} for p in paras]
        if opts.scanned_page_as_figure and opts.extract_figures and len(r["text"].split()) < 80:
            res["figures"].append({
                "page": idx + 1, "kind": "scanned_page", "xref": 0, "bbox": None,
                "caption": "", "inner_text": r["text"][:1200],
                "image_png": page.get_pixmap(dpi=opts.figure_dpi).tobytes("png"),
            })
        return res

    # Digital page
    table_rects = []
    if opts.detect_tables:
        try:
            # Only pay for table detection when the page has ruling lines
            if len(page.get_drawings()) >= 6:
                for tab in page.find_tables().tables:
                    md = _table_to_markdown(tab)
                    if md:
                        table_rects.append(fitz.Rect(tab.bbox))
                        res["tables"].append({"markdown": md, "bbox": [round(v, 1) for v in tab.bbox]})
        except Exception as e:
            logger.debug(f"[Extract] tables p{idx+1}: {e}")

    all_blocks = _blocks_with_style(page, [])
    if opts.extract_figures:
        res["figures"] = _find_figures(page, opts, table_rects, all_blocks)

    exclude = table_rects + [fitz.Rect(f["bbox"]) for f in res["figures"] if f.get("bbox")]
    if exclude:
        res["blocks"] = [b for b in all_blocks
                         if not any(abs(fitz.Rect(b["bbox"]) & r) > 0.5 * max(abs(fitz.Rect(b["bbox"])), 1)
                                    for r in exclude)]
    else:
        res["blocks"] = all_blocks
    return res


def extract_pages_worker(pdf_path: str, page_idxs: list, ocr_idxs: list, opts_dict: dict) -> list:
    """Entry point for a worker process / thread."""
    import fitz
    opts = ExtractOptions(**opts_dict)
    ocr_set = set(ocr_idxs)
    out = []
    with fitz.open(pdf_path) as doc:
        for i in page_idxs:
            try:
                out.append(_extract_page(doc, i, i in ocr_set, opts))
            except Exception as e:
                logger.warning(f"[Extract] page {i+1} failed: {e}")
                out.append({"page": i + 1, "blocks": [], "tables": [], "figures": [],
                            "ocr_used": False, "ocr_conf": None, "engine": "failed", "error": str(e)})
    return out


# ── Orchestration ────────────────────────────────────────────────────────

def fast_ocr_available() -> bool:
    """RapidOCR (ONNX) loads in ~1 s, so it is worth fanning out across processes.
    EasyOCR needs ~10-50 s just to import torch + load weights per process, so with
    EasyOCR we OCR in ONE long-lived process (model cached across documents) using
    all CPU threads instead."""
    import importlib.util
    if os.getenv("OCR_ENGINE", "").lower() in ("easyocr", "tesseract"):
        return False
    return bool(importlib.util.find_spec("rapidocr") or importlib.util.find_spec("rapidocr_onnxruntime"))


def _ocr_workers(n_ocr: int) -> int:
    cpu = os.cpu_count() or 2
    cap = int(os.getenv("AI_EXTRACT_WORKERS", max(1, min(6, cpu - 1))))
    return max(1, min(cap, math.ceil(n_ocr / 3)))


def _process_pool(n):
    import multiprocessing as mp
    if mp.current_process().daemon:
        raise RuntimeError("daemonic process cannot spawn children")
    return ProcessPoolExecutor(max_workers=n, mp_context=mp.get_context("spawn"))


def extract_pdf(pdf_path: str, opts: ExtractOptions | None = None, progress_cb=None) -> dict:
    """
    Extract every page of a PDF. Returns
      {"page_count", "pages": [page dicts sorted by page], "ocr_pages", "workers", "pool"}

    Scheduling:
      • digital pages: inline in this process (~10-30 ms/page with PyMuPDF; a 500-page
        PDF is a few seconds — spawning processes would cost more than it saves)
      • OCR pages run CONCURRENTLY with the digital pages:
          RapidOCR available & ≥4 OCR pages → spawn process pool, OCR pages interleaved
          otherwise → one background thread using the process-wide cached OCR model
    """
    opts = opts or ExtractOptions()
    if not opts.ocr_dpi:
        opts.ocr_dpi = 200 if fast_ocr_available() else 150
    scan = prescan(pdf_path)
    ocr_idx = scan.needs_ocr
    ocr_set = set(ocr_idx)
    digital = [i for i in range(scan.page_count) if i not in ocr_set]
    total = scan.page_count
    done = 0
    lock = threading.Lock()

    def report(n):
        nonlocal done
        with lock:
            done += n
            d = done
        if progress_cb:
            try:
                progress_cb(d, total)
            except Exception:
                pass

    pool_kind, workers = "inline", 1
    ocr_futs, executor = [], None
    if ocr_idx:
        if fast_ocr_available() and len(ocr_idx) >= 4:
            workers = _ocr_workers(len(ocr_idx))
            try:
                executor = _process_pool(workers)
                pool_kind = "process"
            except Exception as e:
                logger.info(f"[Extract] process pool unavailable ({e}); using threads")
                executor = ThreadPoolExecutor(max_workers=workers)
                pool_kind = "thread"
            batches = [ocr_idx[w::workers] for w in range(workers)]
            tasks = [sorted(b[k:k + 3]) for b in batches for k in range(0, len(b), 3)]
        else:
            executor = ThreadPoolExecutor(max_workers=1)
            pool_kind = "ocr-thread"
            tasks = [[i] for i in ocr_idx]
        ocr_futs = [executor.submit(extract_pages_worker, pdf_path, t, t, opts.as_dict()) for t in tasks]

    logger.info(f"[Extract] {total} pages: {len(digital)} digital inline, {len(ocr_idx)} OCR via {pool_kind}x{workers}")

    pages = []
    try:
        for k in range(0, len(digital), 10):
            part = extract_pages_worker(pdf_path, digital[k:k + 10], [], opts.as_dict())
            pages.extend(part)
            report(len(part))
        for f in ocr_futs:
            part = f.result()
            pages.extend(part)
            report(len(part))
    finally:
        if executor:
            executor.shutdown(wait=True, cancel_futures=True)

    pages.sort(key=lambda p: p["page"])
    return {"page_count": total, "pages": pages, "ocr_pages": len(ocr_idx),
            "workers": workers, "pool": pool_kind}
