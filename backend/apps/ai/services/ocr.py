"""Avora AI — Phase 2 OCR Service (PaddleOCR with Tesseract fallback)."""
import re, logging
logger = logging.getLogger(__name__)


def extract_text_from_bytes(file_bytes: bytes, mime_type: str = '') -> dict:
    """Main OCR entry point. Returns {text, confidence, engine}."""
    try:
        if mime_type == 'application/pdf':
            return _pdf_extract(file_bytes)
        elif mime_type.startswith('image/'):
            return _image_ocr(file_bytes)
        else:
            return _generic_extract(file_bytes)
    except Exception as e:
        logger.error(f"[Avora OCR] Error: {e}")
        return {'raw_text': '', 'confidence': 0.0, 'engine': 'failed'}


def _pdf_extract(file_bytes: bytes) -> dict:
    try:
        import pdfplumber, io
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            pages   = [p.extract_text() or '' for p in pdf.pages]
            text    = '\n'.join(pages)
            if text.strip():
                return {'raw_text': text, 'confidence': 0.96, 'engine': 'pdfplumber', 'page_count': len(pdf.pages)}
    except ImportError:
        pass
    return _image_ocr(file_bytes)


def _image_ocr(file_bytes: bytes) -> dict:
    try:
        from paddleocr import PaddleOCR
        import numpy as np, cv2
        nparr  = np.frombuffer(file_bytes, np.uint8)
        img    = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        ocr    = PaddleOCR(use_angle_cls=True, lang='en', show_log=False)
        result = ocr.ocr(img, cls=True)
        if result and result[0]:
            lines      = [line[1][0] for line in result[0] if line]
            confidences= [line[1][1] for line in result[0] if line]
            text       = '\n'.join(lines)
            avg_conf   = sum(confidences) / len(confidences) if confidences else 0.0
            return {'raw_text': text, 'confidence': round(avg_conf, 3), 'engine': 'paddleocr'}
    except ImportError:
        logger.warning("[Avora OCR] PaddleOCR not installed — using Tesseract fallback")
        return _tesseract_fallback(file_bytes)
    except Exception as e:
        logger.error(f"[Avora OCR] PaddleOCR error: {e}")
        return _tesseract_fallback(file_bytes)


def _tesseract_fallback(file_bytes: bytes) -> dict:
    try:
        import pytesseract, io
        from PIL import Image
        img  = Image.open(io.BytesIO(file_bytes))
        text = pytesseract.image_to_string(img)
        return {'raw_text': text, 'confidence': 0.75, 'engine': 'tesseract'}
    except Exception as e:
        logger.error(f"[Avora OCR] Tesseract error: {e}")
        return {'raw_text': '', 'confidence': 0.0, 'engine': 'failed'}


def _generic_extract(file_bytes: bytes) -> dict:
    try:
        text = file_bytes.decode('utf-8', errors='ignore')
        return {'raw_text': text, 'confidence': 1.0, 'engine': 'plaintext'}
    except Exception:
        return {'raw_text': '', 'confidence': 0.0, 'engine': 'failed'}


def clean_text(raw: str) -> str:
    """Normalise OCR output — remove noise, fix whitespace."""
    text = re.sub(r'\n{3,}', '\n\n', raw)
    text = re.sub(r' {2,}', ' ', text)
    text = re.sub(r'[^\x00-\x7F]+', ' ', text)  # strip non-ASCII noise
    return text.strip()
