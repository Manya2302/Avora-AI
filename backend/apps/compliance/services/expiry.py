import re, logging
from datetime import date
logger = logging.getLogger(__name__)

PATTERNS = [
    r"(?:valid until|validity|expires?|expiry date|valid through)[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
    r"(?:renewal date|renew before)[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
]
RELEVANT = ["certificate","insurance_policy","business_license","contract","vendor_agreement"]

def scan_for_expiry_dates(owner) -> list:
    from apps.documents.models import Document
    from apps.ai.models import DocumentOCR, DocumentClassification
    from apps.compliance.models import ExpiryAlert
    docs    = Document.objects.filter(owner=owner, is_deleted=False, status="ai_ready")
    created = []
    for doc in docs:
        try:
            cls = DocumentClassification.objects.get(document_id=doc.id)
            if cls.category not in RELEVANT: continue
            ocr = DocumentOCR.objects.get(document_id=doc.id, status="completed")
        except: continue
        expiry = _extract(ocr.cleaned_text or ocr.raw_text)
        if not expiry: continue
        today     = date.today()
        days_left = (expiry - today).days
        if days_left > 90: continue
        at = ("expired" if days_left < 0 else "expiring_30" if days_left<=30 else "expiring_60" if days_left<=60 else "expiring_90")
        a, new = ExpiryAlert.objects.update_or_create(
            owner=owner, document_id=doc.id,
            defaults={"doc_name":doc.original_name,"doc_type":cls.category,
                      "expiry_date":expiry,"alert_type":at,"days_until":days_left})
        if new: created.append({"document":doc.original_name,"days":days_left})
    return created

def _extract(text):
    from datetime import datetime
    for pat in PATTERNS:
        m = re.search(pat, text, re.I)
        if m:
            raw = m.group(1)
            for fmt in ("%d/%m/%Y","%d-%m-%Y","%Y-%m-%d","%m/%d/%Y"):
                try: return datetime.strptime(raw,fmt).date()
                except: pass
    return None
