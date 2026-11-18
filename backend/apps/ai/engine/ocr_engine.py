"""
Avora AI — Fast OCR Engine
━━━━━━━━━━━━━━━━━━━━━━━━━━
Django-free on purpose: it runs inside worker *processes* spawned by
page_extractor, so it must import nothing that needs django.setup().

Engine priority (first one that is installed wins, the rest are fallbacks):
  1. RapidOCR (ONNX Runtime)  — 3-5x faster than EasyOCR on CPU, same PP-OCR models
  2. EasyOCR (PyTorch)        — already in the venv
  3. Tesseract                — if the binary is installed

Each worker process keeps ONE model instance (loaded lazily, reused for
every page it handles), so model-load cost is paid once per process, not
once per page.
"""
from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

_ENGINE = None          # (name, callable)
_ENGINE_FAILED = set()  # engines that failed to load in this process


def _load_rapidocr():
    try:
        from rapidocr import RapidOCR          # rapidocr >= 2.x (supports Python 3.13)
        eng = RapidOCR()

        def run(img):
            out = eng(img)
            txts = list(getattr(out, "txts", None) or [])
            scores = [float(s) for s in (getattr(out, "scores", None) or [])]
            return txts, scores
        return run
    except ImportError:
        from rapidocr_onnxruntime import RapidOCR  # legacy 1.x package
        eng = RapidOCR()

        def run(img):
            result, _ = eng(img)
            if not result:
                return [], []
            return [r[1] for r in result], [float(r[2]) for r in result]
        return run


def _load_easyocr():
    import warnings
    import torch
    import easyocr
    warnings.filterwarnings("ignore", category=UserWarning, module="torch")
    # One intra-op thread per process: parallelism comes from the process pool.
    import multiprocessing as mp
    # In a pool child: 1 thread (parallelism comes from processes). In the main
    # process (single long-lived OCR model): use the cores.
    default_threads = 1 if mp.current_process().name != "MainProcess" else max(1, (os.cpu_count() or 2) - 1)
    torch.set_num_threads(int(os.getenv("OCR_TORCH_THREADS", default_threads)))
    reader = easyocr.Reader(["en"], gpu=torch.cuda.is_available(), verbose=False)
    import threading
    lock = threading.Lock()  # EasyOCR's Reader is not thread-safe (thread-pool fallback mode)

    def run(img):
        with lock:
            res = reader.readtext(img, paragraph=False)
        return [r[1] for r in res if r[1]], [float(r[2]) for r in res if r[1]]
    return run


def _load_tesseract():
    import pytesseract
    pytesseract.get_tesseract_version()  # raises if binary missing

    def run(img):
        data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
        words, confs = [], []
        for w, c in zip(data["text"], data["conf"]):
            try:
                c = float(c)
            except (TypeError, ValueError):
                continue
            if w.strip() and c > 0:
                words.append(w)
                confs.append(c / 100.0)
        return ([" ".join(words)] if words else []), confs
    return run


_LOADERS = [("rapidocr", _load_rapidocr), ("easyocr", _load_easyocr), ("tesseract", _load_tesseract)]


def get_engine():
    """Return (name, run_fn) for the best OCR engine available in this process."""
    global _ENGINE
    if _ENGINE is not None:
        return _ENGINE
    preferred = os.getenv("OCR_ENGINE", "").lower()
    loaders = sorted(_LOADERS, key=lambda x: 0 if x[0] == preferred else 1)
    for name, loader in loaders:
        if name in _ENGINE_FAILED:
            continue
        try:
            _ENGINE = (name, loader())
            logger.info(f"[OCR] engine loaded: {name} (pid={os.getpid()})")
            return _ENGINE
        except Exception as e:
            _ENGINE_FAILED.add(name)
            logger.debug(f"[OCR] {name} unavailable: {e}")
    _ENGINE = ("none", lambda img: ([], []))
    logger.warning("[OCR] No OCR engine available — scanned pages will be empty.")
    return _ENGINE


def _prepare(img_bytes: bytes):
    """Decode + light preprocessing. Deliberately cheap: no denoise, no deskew
    on every page (those cost seconds per page). Modern detectors handle mild skew."""
    import numpy as np
    import cv2
    arr = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("cannot decode image")
    h, w = img.shape[:2]
    # Upscale tiny images (phone crops, thumbnails); downscale huge scans (>3500px)
    longest = max(h, w)
    if longest < 1000:
        scale = 1600 / longest
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    elif longest > 3500:
        scale = 3000 / longest
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    return img


def ocr_image_bytes(img_bytes: bytes) -> dict:
    """OCR one image. Returns {text, confidence, engine}. Never raises."""
    try:
        img = _prepare(img_bytes)
    except Exception as e:
        return {"text": "", "confidence": 0.0, "engine": "decode_failed", "error": str(e)}

    name, run = get_engine()
    try:
        lines, confs = run(img)
    except Exception as e:
        logger.warning(f"[OCR] {name} failed on image: {e}")
        lines, confs = [], []

    text = "\n".join(str(l) for l in lines if str(l).strip())
    conf = (sum(confs) / len(confs)) if confs else 0.0
    return {"text": text, "confidence": round(conf, 3), "engine": name}
