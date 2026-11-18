"""Avora AI — OCR Service (EasyOCR with graceful fallback)."""
import re, logging
logger = logging.getLogger(__name__)

_EASYOCR_SINGLETON = None


def _get_easyocr():
    """Return a cached EasyOCR instance."""
    global _EASYOCR_SINGLETON
    if _EASYOCR_SINGLETON is None:
        import easyocr
        # Disable verbose logging and use CPU if GPU not available
        _EASYOCR_SINGLETON = easyocr.Reader(['en'], gpu=False, verbose=False)
    return _EASYOCR_SINGLETON


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
        import fitz  # PyMuPDF
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        
        full_text = []
        confs = []
        total_pages = len(doc)
        
        for page in doc:
            page_text = page.get_text()
            
            # Check if text is gibberish or non-existent (likely scanned PDF)
            words = page_text.split()
            avg_word_len = sum(len(w) for w in words) / len(words) if words else 0
            
            if avg_word_len > 3.0 and len(words) > 10:
                full_text.append(page_text)
                confs.append(0.96)
            else:
                # Poor text quality, fallback to EasyOCR for this page
                pix = page.get_pixmap(dpi=150)
                img_bytes = pix.tobytes("png")
                page_res = _image_ocr(img_bytes)
                
                if page_res.get('raw_text'):
                    full_text.append(page_res['raw_text'])
                    confs.append(page_res.get('confidence', 0.8))
                elif page_text.strip():
                    full_text.append(page_text)
                    confs.append(0.5)
                    
        if full_text:
            text = '\n'.join(full_text)
            avg_conf = sum(confs) / len(confs) if confs else 0.8
            return {'raw_text': text, 'confidence': round(avg_conf, 3), 'engine': 'pymupdf+easyocr', 'page_count': total_pages}
            
    except Exception as e:
        logger.error(f"[Avora OCR] PyMuPDF error: {e}")
        
    # If fitz completely fails, we can't fall back to _image_ocr with PDF bytes.
    return {'raw_text': '', 'confidence': 0.0, 'engine': 'failed'}


def _image_ocr(file_bytes: bytes) -> dict:
    try:
        import numpy as np, cv2
        nparr = np.frombuffer(file_bytes, np.uint8)
        img   = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Could not decode image")

        ocr = _get_easyocr()
        
        # EasyOCR returns list of (bbox, text, prob)
        results = ocr.readtext(img)
        lines = [r[1] for r in results if r[1]]
        confs = [r[2] for r in results if r[2]]

        if lines:
            text     = '\n'.join(str(l) for l in lines)
            avg_conf = sum(confs) / len(confs) if confs else 0.8
            return {'raw_text': text, 'confidence': round(avg_conf, 3), 'engine': 'easyocr'}
    except Exception as e:
        logger.warning(f"[Avora OCR] EasyOCR error: {e}")

    return _tesseract_fallback(file_bytes)


def _tesseract_fallback(file_bytes: bytes) -> dict:
    try:
        import pytesseract, io
        from PIL import Image
        img  = Image.open(io.BytesIO(file_bytes))
        text = pytesseract.image_to_string(img)
        return {'raw_text': text, 'confidence': 0.75, 'engine': 'tesseract'}
    except Exception as e:
        if "tesseract is not installed" not in str(e).lower():
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
