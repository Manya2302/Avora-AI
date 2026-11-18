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
    # 3 queries for any number of documents (was 2 lookups per document)
    docs = {d.id: d for d in Document.objects.filter(owner=owner, is_deleted=False, status="ai_ready")
            .only("id", "original_name")}
    cats = dict(DocumentClassification.objects.filter(document_id__in=list(docs), category__in=list(RELEVANT))
                .values_list("document_id", "category"))
    created = []
    today = date.today()
    for ocr in DocumentOCR.objects.filter(document_id__in=list(cats), status="completed")             .only("document_id", "cleaned_text", "raw_text").iterator():
        doc = docs.get(ocr.document_id)
        if doc is None:
            continue
        expiry = _extract(ocr.cleaned_text or ocr.raw_text or "")
        if not expiry: continue
        days_left = (expiry - today).days
        if days_left > 90: continue
        at = ("expired" if days_left < 0 else "expiring_30" if days_left<=30 else "expiring_60" if days_left<=60 else "expiring_90")
        a, new = ExpiryAlert.objects.update_or_create(
            owner=owner, document_id=doc.id,
            defaults={"doc_name":doc.original_name,"doc_type":cats[doc.id],
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
                except Exception: pass
    return None
