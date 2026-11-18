"""
Avora AI — Document Processor (v2: page-level, parallel, multimodal)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Public API is unchanged: AvoraDocumentProcessor().process(bytes, mime, name)
returns an ExtractionResult with raw_text / clean_text / page_count / …

New in v2 (consumed by apps.ai.services.ingestion):
  result.pages    → per-page structure: text blocks (font size/bold), tables (markdown)
  result.figures  → charts / graphs / images cropped as PNG with caption + inner text
  result.stats    → timings, OCR page count, worker pool used

What changed and why it is faster:
  • PDFs are parsed ONCE with PyMuPDF (was: pdfplumber + PyMuPDF + PyPDF2 = 3 full parses;
    pdfplumber alone is ~20-50x slower than PyMuPDF on 100+ page files).
  • OCR runs only on pages without a usable text layer, ALL of them (was: first 2 pages
    only, at 72 DPI — scanned page 3+ was silently lost), across a process pool.
  • DOCX keeps heading styles and tables; XLSX keeps rows/headers as tables
    (was: every cell joined with spaces, destroying structure).
"""
import io, os, re, time, logging, tempfile
from dataclasses import dataclass, field
logger = logging.getLogger(__name__)


@dataclass
class ExtractionResult:
    raw_text: str = ""
    clean_text: str = ""
    confidence: float = 0.0
    page_count: int = 0
    word_count: int = 0
    engine_used: str = ""
    quality_score: float = 0.0
    language: str = "en"
    tables: list = field(default_factory=list)
    key_value_pairs: dict = field(default_factory=dict)
    warnings: list = field(default_factory=list)
    pages: list = field(default_factory=list)
    figures: list = field(default_factory=list)
    stats: dict = field(default_factory=dict)


def _pages_to_text(pages: list) -> str:
    out = []
    for p in pages:
        parts = [b["text"] for b in p.get("blocks", [])]
        parts += [t["markdown"] for t in p.get("tables", [])]
        if parts:
            out.append("\n".join(parts))
    return "\n\n".join(out)


def _finalize(r: ExtractionResult) -> ExtractionResult:
    r.word_count = len(r.raw_text.split())
    r.clean_text = TextCleaner.clean(r.raw_text)
    r.key_value_pairs = KeyValueExtractor.extract(r.clean_text)
    r.quality_score = QualityScorer.score(r.clean_text, r.confidence)
    r.tables = [t["markdown"] for p in r.pages for t in p.get("tables", [])]
    return r


class AvoraDocumentProcessor:

    def __init__(self, extract_figures: bool = True, progress_cb=None):
        self.extract_figures = extract_figures
        self.progress_cb = progress_cb

    def process(self, file_bytes: bytes, mime_type: str, filename: str = "") -> ExtractionResult:
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        mime_type = mime_type or ""
        if not file_bytes:
            return ExtractionResult(warnings=["Empty file"])
        try:
            if mime_type == "application/pdf" or ext == "pdf":
                return self._pdf(file_bytes)
            if ext in ("docx", "doc") or "wordprocessingml" in mime_type or mime_type == "application/msword":
                return self._docx(file_bytes)
            if ext in ("xlsx", "xlsm", "xls") or "spreadsheetml" in mime_type:
                return self._excel(file_bytes)
            if mime_type.startswith("image/") or ext in ("png", "jpg", "jpeg", "tiff", "tif", "bmp", "webp"):
                return self._image(file_bytes, filename)
        except Exception as e:
            logger.exception(f"[DocProcessor] {ext or mime_type} extraction failed: {e}")
        text = file_bytes.decode("utf-8", errors="replace")
        r = ExtractionResult(raw_text=text, confidence=1.0, engine_used="plaintext",
                             pages=[{"page": 1, "blocks": [{"type": "text", "text": l, "size": 0, "bold": False, "chars": len(l)}
                                                           for l in text.split("\n") if l.strip()], "tables": []}])
        return _finalize(r)

    # ── PDF ───────────────────────────────────────────────────────────
    def _pdf(self, fb: bytes) -> ExtractionResult:
        from .page_extractor import extract_pdf, ExtractOptions
        from .vision import vision_enabled
        t0 = time.time()
        vlm = vision_enabled()
        opts = ExtractOptions(
            extract_figures=self.extract_figures,
            scanned_page_as_figure=self.extract_figures and vlm,
            figure_ocr=self.extract_figures and not vlm and os.getenv("FIGURE_OCR", "0") == "1",
            ocr_dpi=int(os.getenv("OCR_DPI", "0")),  # 0 = auto per engine
        )
        # Workers open the file by path: no 100 MB pickling per worker
        fd, path = tempfile.mkstemp(suffix=".pdf", prefix="avora_")
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(fb)
            out = extract_pdf(path, opts, progress_cb=self.progress_cb)
        finally:
            try:
                os.remove(path)
            except OSError:
                pass

        pages = out["pages"]
        figures = [f for p in pages for f in p.pop("figures", [])]
        # Logos/headers repeat on many pages with the same xref → not content
        from collections import Counter
        xref_pages = Counter(f["xref"] for f in figures if f.get("xref"))
        figures = [f for f in figures if not (f.get("xref") and xref_pages[f["xref"]] >= 3)]

        ocr_confs = [p["ocr_conf"] for p in pages if p.get("ocr_used") and p.get("ocr_conf") is not None]
        digital = out["page_count"] - out["ocr_pages"]
        conf = ((digital * 0.97) + sum(ocr_confs)) / max(digital + len(ocr_confs), 1)
        engines = sorted({p["engine"] for p in pages if p.get("engine")})

        r = ExtractionResult(raw_text=_pages_to_text(pages), page_count=out["page_count"],
                             confidence=round(conf, 3), engine_used="+".join(engines)[:50] or "pymupdf",
                             pages=pages, figures=figures)
        r.stats = {"extract_ms": int((time.time() - t0) * 1000), "ocr_pages": out["ocr_pages"],
                   "workers": out["workers"], "pool": out["pool"], "figures": len(figures)}
        failed = [p["page"] for p in pages if p.get("engine") == "failed"]
        if failed:
            r.warnings.append(f"Pages failed to extract: {failed[:20]}")
        logger.info(f"[DocProcessor] PDF {r.page_count}p in {r.stats['extract_ms']}ms "
                    f"(ocr={out['ocr_pages']}, figs={len(figures)}, pool={out['pool']}x{out['workers']})")
        return _finalize(r)

    # ── Images (photo of a document, screenshot, or a chart image) ───
    def _image(self, fb: bytes, filename: str) -> ExtractionResult:
        from .ocr_engine import ocr_image_bytes
        from .vision import vision_enabled
        ocr = ocr_image_bytes(fb)
        text = ocr.get("text", "")
        pages = [{"page": 1, "blocks": [{"type": "text", "text": l, "size": 0, "bold": False, "chars": len(l)}
                                        for l in text.split("\n") if l.strip()], "tables": [], "ocr_used": True}]
        figures = []
        if self.extract_figures and vision_enabled():
            png = fb
            try:  # normalise to PNG for the VLM
                from PIL import Image
                im = Image.open(io.BytesIO(fb)).convert("RGB")
                im.thumbnail((2400, 2400))
                buf = io.BytesIO(); im.save(buf, "PNG"); png = buf.getvalue()
            except Exception:
                pass
            figures.append({"page": 1, "kind": "image_file", "xref": 0, "bbox": None,
                            "caption": filename, "inner_text": text[:1200], "image_png": png})
        r = ExtractionResult(raw_text=text, page_count=1, confidence=ocr.get("confidence", 0.0),
                             engine_used=ocr.get("engine", "ocr"), pages=pages, figures=figures)
        return _finalize(r)

    # ── DOCX ──────────────────────────────────────────────────────────
    def _docx(self, fb: bytes) -> ExtractionResult:
        try:
            from docx import Document as D
            doc = D(io.BytesIO(fb))
        except Exception as e:
            logger.info(f"[DocProcessor] python-docx failed, legacy .doc extractor: {e}")
            return self._doc_fallback(fb)

        blocks, tables = [], []
        # Walk body in document order so tables stay next to their paragraphs
        from docx.table import Table
        from docx.text.paragraph import Paragraph
        for child in doc.element.body.iterchildren():
            tag = child.tag.rsplit("}", 1)[-1]
            if tag == "p":
                p = Paragraph(child, doc)
                t = p.text.strip()
                if not t:
                    continue
                style = (p.style.name if p.style is not None else "") or ""
                level = 0
                m = re.match(r"(heading|title)\s*(\d*)", style, re.I)
                if m:
                    level = int(m.group(2) or 1)
                blocks.append({"type": "text", "text": t, "chars": len(t),
                               "size": {1: 20, 2: 16, 3: 14}.get(level, 12 if level == 0 else 13),
                               "bold": level > 0 or all(r.bold for r in p.runs if r.text.strip())})
            elif tag == "tbl":
                tb = Table(child, doc)
                rows = []
                for row in tb.rows:
                    cells = []
                    for c in row.cells:
                        v = c.text.replace("\n", " ").strip()
                        if not cells or cells[-1] != v:   # merged cells repeat — dedupe
                            cells.append(v)
                    rows.append(cells)
                if len(rows) >= 2:
                    w = max(len(r) for r in rows)
                    rows = [r + [""] * (w - len(r)) for r in rows]
                    md = ["| " + " | ".join(rows[0]) + " |", "|" + "---|" * w] + ["| " + " | ".join(r) + " |" for r in rows[1:]]
                    tables.append({"markdown": "\n".join(md)})
        # Embedded pictures (charts pasted as images)
        figures = []
        if self.extract_figures:
            from .vision import vision_enabled
            if vision_enabled():
                for rel in doc.part.rels.values():
                    if "image" in rel.reltype:
                        try:
                            blob = rel.target_part.blob
                            if len(blob) > 15_000:          # skip icons / bullets
                                figures.append({"page": 1, "kind": "embedded_image", "xref": 0, "bbox": None,
                                                "caption": "", "inner_text": "", "image_png": blob})
                        except Exception:
                            pass
        pages = [{"page": 1, "blocks": blocks, "tables": tables}]
        r = ExtractionResult(raw_text=_pages_to_text(pages), page_count=1, confidence=0.99,
                             engine_used="python-docx", pages=pages, figures=figures[:40])
        for p in r.pages:     # DOCX has no physical pages; avoid fake "page 1" citations
            p["page"] = 0
        for f in r.figures:
            f["page"] = 0
        return _finalize(r)

    def _doc_fallback(self, fb):
        text_parts = re.findall(r"[\x20-\x7E -￿]{4,}", fb.decode("utf-8", errors="ignore"))
        text = "\n".join(p.strip() for p in text_parts if len(p.strip()) > 8 and any(c.isalpha() for c in p))
        r = ExtractionResult(raw_text=text, confidence=0.5, engine_used="doc_binary_extractor",
                             pages=[{"page": 0, "blocks": [{"type": "text", "text": l, "size": 0, "bold": False, "chars": len(l)}
                                                           for l in text.split("\n")], "tables": []}])
        return _finalize(r)

    # ── Excel ─────────────────────────────────────────────────────────
    def _excel(self, fb: bytes) -> ExtractionResult:
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(fb), data_only=True, read_only=True)
        pages = []
        for si, ws in enumerate(wb.worksheets, start=1):
            rows = []
            for row in ws.iter_rows(values_only=True):
                vals = ["" if v is None else str(v).replace("\n", " ").strip() for v in row]
                if any(vals):
                    rows.append(vals)
                if len(rows) > 20000:
                    break
            if not rows:
                continue
            w = max(len(r) for r in rows)
            # trim fully-empty trailing columns
            while w > 1 and all((len(r) < w or not r[w - 1]) for r in rows):
                w -= 1
            rows = [(r + [""] * w)[:w] for r in rows]
            md = ["| " + " | ".join(rows[0]) + " |", "|" + "---|" * w] + ["| " + " | ".join(r) + " |" for r in rows[1:]]
            pages.append({"page": si,
                          "blocks": [{"type": "text", "text": f"Sheet: {ws.title}", "size": 20, "bold": True, "chars": 10}],
                          "tables": [{"markdown": "\n".join(md)}]})
        r = ExtractionResult(raw_text=_pages_to_text(pages), page_count=len(pages), confidence=0.99,
                             engine_used="openpyxl", pages=pages)
        return _finalize(r)


class ImagePreprocessor:
    @staticmethod
    def enhance(img):
        try:
            import cv2
            import numpy as np
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            
            # --- Deskew (Rotation Alignment) ---
            # Threshold to find text regions
            thresh = cv2.bitwise_not(cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1])
            coords = np.column_stack(np.where(thresh > 0))
            if len(coords) > 0:
                angle = cv2.minAreaRect(coords)[-1]
                # Fix angle for cv2.minAreaRect behavior
                if angle < -45:
                    angle = -(90 + angle)
                else:
                    angle = -angle
                
                # Only rotate if the skew is significant
                if abs(angle) > 0.5:
                    (h, w) = img.shape[:2]
                    center = (w // 2, h // 2)
                    M = cv2.getRotationMatrix2D(center, angle, 1.0)
                    img = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
                    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            # -----------------------------------

            # Adaptive thresholding is usually enough for OCR.
            # Removed fastNlMeansDenoising because it causes 10-30 second hangs per page.
            t = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
            
            h, w = t.shape[:2]
            if w < 1000: 
                t = cv2.resize(t, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
            
            # Convert back to 3-channel BGR so downstream tools (like cvtColor(BGR2RGB)) don't crash
            return cv2.cvtColor(t, cv2.COLOR_GRAY2BGR)
        except Exception as e: 
            logger.debug(f"[ImagePreprocessor] Error: {e}")
            return img


class TextCleaner:
    @staticmethod
    def clean(text: str) -> str:
        if not text: return ""
        text = re.sub(r"\r\n|\r","\n",text)
        text = re.sub(r"\n{3,}","\n\n",text)
        text = re.sub(r" {2,}"," ",text)
        text = re.sub(r"[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]"," ",text)
        return "\n".join(l.strip() for l in text.split("\n") if len(l.strip())>1).strip()


class QualityScorer:
    @staticmethod
    def score(text: str, conf: float) -> float:
        if not text.strip(): return 0.0
        words = text.split()
        if not words: return 0.0
        alpha = sum(1 for w in words if re.match(r"^[a-zA-Z]",w)) / len(words)
        length= min(len(words)/200, 1.0)
        garb  = len(re.findall(r"[^a-zA-Z0-9\s.,;:!?₹$%&()\-\'\"/]",text)) / max(len(text),1)
        return round(alpha*0.3 + length*0.2 + conf*0.3 + (1-min(garb*5,1))*0.2, 3)


class KeyValueExtractor:
    PATTERNS = [
        (r"(?:invoice|bill)\s*(?:no|number|#)[:\s]+([A-Z0-9\-/]+)","invoice_number"),
        (r"(?:gstin|gst number)[:\s]+(\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d])","gstin"),
        (r"(?:pan)[:\s]+([A-Z]{5}\d{4}[A-Z])","pan"),
        (r"(?:date|dated)[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})","date"),
        (r"(?:total|amount|grand total)[:\s]+(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{2})?)","total_amount"),
        (r"(?:due date|payment due)[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})","due_date"),
        (r"(?:vendor|supplier|from)[:\s]+([A-Z][^\n]{5,60})","vendor"),
    ]
    @staticmethod
    def extract(text: str) -> dict:
        result = {}
        for pat, key in KeyValueExtractor.PATTERNS:
            m = re.search(pat, text, re.I)
            if m: result[key] = m.group(1).strip()
        return result
