"""
Avora AI — Enhanced Metadata Extraction
Extracts structured fields from document text using regex + Ollama.
"""
import re, logging
from django.conf import settings
from apps.ai.models import DocumentMetadataAI, DocumentTag
logger = logging.getLogger(__name__)

CURRENCY_SYMBOLS = r'(?:₹|Rs\.?|INR|USD|\$|€|£|AED)'


def extract_metadata(document_id: str, text: str, category: str = '') -> dict:
    """Full metadata extraction pipeline."""
    text_lower = text.lower()
    meta = {
        'vendor':       _extract_vendor(text),
        'client':       _extract_client(text),
        'organization': _extract_org(text),
        'department':   _extract_department(text_lower),
        'document_date':_extract_date(text),
        'year':         _extract_year(text),
        'expiry_date':  _extract_expiry(text),
        'amount':       _extract_amount(text),
        'currency':     _extract_currency(text),
        'country':      _extract_country(text_lower),
        'keywords':     _extract_keywords(text_lower),
        'entities':     _extract_entities(text),
    }

    # Save
    try:
        DocumentMetadataAI.objects.update_or_create(document_id=document_id, defaults=meta)
        _save_tags(document_id, meta, category)
    except Exception as e:
        logger.error(f"[Avora Metadata] DB error: {e}")

    return meta


def _extract_vendor(text: str) -> str:
    m = re.search(r'(?:vendor|supplier|from)[:\s]+([A-Z][^\n,]{3,60})', text, re.I)
    return m.group(1).strip() if m else ''


def _extract_client(text: str) -> str:
    m = re.search(r'(?:client|bill to|customer)[:\s]+([A-Z][^\n,]{3,60})', text, re.I)
    return m.group(1).strip() if m else ''


def _extract_org(text: str) -> str:
    m = re.search(r'\b([A-Z][a-zA-Z]+ (?:Pvt|Ltd|Inc|Corp|LLP|LLC|Co)\.?)\b', text)
    return m.group(1) if m else ''


def _extract_department(text: str) -> str:
    depts = ['finance','legal','hr','human resources','accounts','marketing','operations','it','compliance','procurement']
    for d in depts:
        if d in text:
            return d.title()
    return ''


def _extract_date(text: str) -> str | None:
    m = re.search(r'\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b', text)
    return m.group(1) if m else None


def _extract_year(text: str) -> str:
    m = re.search(r'\b(20\d{2})\b', text)
    return m.group(1) if m else ''


def _extract_expiry(text: str) -> str | None:
    m = re.search(r'(?:expiry|expiration|valid until|expires)[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})', text, re.I)
    return m.group(1) if m else None


def _extract_amount(text: str):
    m = re.search(rf'{CURRENCY_SYMBOLS}\s*([\d,]+(?:\.\d{{2}})?)', text)
    if m:
        try:
            return float(m.group(1).replace(',', ''))
        except ValueError:
            pass
    return None


def _extract_currency(text: str) -> str:
    if re.search(r'₹|Rs\.?|INR', text): return 'INR'
    if re.search(r'\$|USD',      text): return 'USD'
    if re.search(r'€|EUR',       text): return 'EUR'
    if re.search(r'£|GBP',       text): return 'GBP'
    return ''


def _extract_country(text: str) -> str:
    countries = {'india': 'India', 'united states': 'USA', 'usa': 'USA', 'uk': 'UK',
                 'united kingdom': 'UK', 'germany': 'Germany', 'uae': 'UAE'}
    for key, val in countries.items():
        if key in text:
            return val
    return ''


def _extract_keywords(text: str) -> list:
    STOP = {'the','a','an','in','of','and','or','to','for','on','at','by','with','from','is','are','was','were','be','been','this','that','these','those','as','its','it'}
    words = re.findall(r'\b[a-z]{4,}\b', text)
    freq  = {}
    for w in words:
        if w not in STOP:
            freq[w] = freq.get(w, 0) + 1
    return [w for w, _ in sorted(freq.items(), key=lambda x: -x[1])[:12]]


def _extract_entities(text: str) -> dict:
    orgs     = re.findall(r'\b([A-Z][a-zA-Z]+ (?:Pvt|Ltd|Inc|Corp|LLP|LLC|Co)\.?)\b', text)
    persons  = re.findall(r'\b(Mr\.|Mrs\.|Ms\.|Dr\.) ([A-Z][a-z]+ [A-Z][a-z]+)\b', text)
    gstin    = re.findall(r'\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b', text)
    return {
        'organizations': list(set(orgs))[:5],
        'persons':       [f"{p[0]} {p[1]}" for p in persons][:5],
        'gstin':         gstin[:2],
    }


def _save_tags(document_id: str, meta: dict, category: str):
    tags = set()
    if category:         tags.add(category.replace('_', ' ').title())
    if meta.get('year'): tags.add(meta['year'])
    if meta.get('currency'): tags.add(meta['currency'])
    if meta.get('country'):  tags.add(meta['country'])
    if meta.get('department'): tags.add(meta['department'])
    for kw in meta.get('keywords', [])[:5]:
        tags.add(kw.capitalize())
    for tag in tags:
        try:
            DocumentTag.objects.get_or_create(document_id=document_id, tag=tag[:100])
        except Exception:
            pass
