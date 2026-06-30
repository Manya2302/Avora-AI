"""Avora AI — Phase 2 Document Classification (enhanced)."""
import re, logging
from apps.ai.models import DocumentClassification
logger = logging.getLogger(__name__)

PATTERNS = {
    'invoice':           ['invoice','bill no','receipt','vendor','tax invoice','cgst','sgst','amount due'],
    'contract':          ['agreement','contract','party','terms and conditions','signed','whereas','obligations'],
    'tax_filing':        ['gst','gstr','tax return','income tax','tds','pan','annual return','itr'],
    'medical_record':    ['patient','diagnosis','prescription','treatment','doctor','hospital','clinical'],
    'bank_statement':    ['bank','account number','balance','debit','credit','statement','ifsc'],
    'legal_agreement':   ['court','legal','judgment','petition','affidavit','plaintiff','defendant'],
    'insurance_policy':  ['insurance','policy number','premium','coverage','claim','insured','beneficiary'],
    'audit_report':      ['audit','compliance','financial statements','auditor','opinion','findings'],
    'certificate':       ['certificate','certify','awarded','completion','achievement','valid until'],
    'purchase_order':    ['purchase order','po number','delivery','quantity','unit price','procurement'],
    'employee_record':   ['employee','salary','payroll','offer letter','resignation','joining date','hr'],
    'vendor_agreement':  ['vendor','supplier','procurement','delivery terms','payment terms','vendor code'],
    'business_license':  ['license','registration','cin','incorporation','ministry','mca','gstin'],
    'compliance_report': ['compliance','regulation','statutory','mandatory','penalty','authority','filing'],
}

CONFIDENTIALITY_RULES = {
    'restricted':   ['passport','aadhaar','pan card','medical report','patient record','salary slip','secret'],
    'confidential': ['financial audit','board resolution','merger','acquisition','strategic plan','trade secret'],
    'internal':     ['internal','company use','employee','policy','procedure'],
    'public':       ['press release','marketing','brochure','newsletter','public notice'],
}


def classify_document_v2(document_id: str, text: str) -> dict:
    text_lower = text.lower()
    category, confidence = _score_categories(text_lower)
    confidentiality = _detect_confidentiality(text_lower)
    risk_score      = _compute_risk(confidentiality, category)

    try:
        DocumentClassification.objects.update_or_create(
            document_id=document_id,
            defaults={
                'category':         category,
                'confidence_score': confidence,
                'confidentiality':  confidentiality,
                'risk_score':       risk_score,
                'ai_model_version': 'avora-v2',
            }
        )
    except Exception as e:
        logger.error(f"[Avora Classify] DB error: {e}")

    logger.info(f"[Avora Classify] {document_id} → {category} ({confidence:.0%})")
    return {'category': category, 'confidence': confidence, 'confidentiality': confidentiality, 'risk_score': risk_score}


def _score_categories(text: str) -> tuple[str, float]:
    scores = {}
    for cat, keywords in PATTERNS.items():
        scores[cat] = sum(1 for kw in keywords if kw in text) / len(keywords)
    best = max(scores, key=scores.get)
    best_score = scores[best]
    if best_score == 0:
        return 'other', 0.5
    normalised = min(0.55 + best_score * 2.5, 0.99)
    return best, round(normalised, 3)


def _detect_confidentiality(text: str) -> str:
    for level in ('restricted', 'confidential', 'internal'):
        if any(kw in text for kw in CONFIDENTIALITY_RULES[level]):
            return level
    if any(kw in text for kw in CONFIDENTIALITY_RULES['public']):
        return 'public'
    return 'internal'


def _compute_risk(confidentiality: str, category: str) -> float:
    base = {'restricted': 0.85, 'confidential': 0.65, 'internal': 0.40, 'public': 0.10}.get(confidentiality, 0.40)
    cat_modifier = {'medical_record': 0.10, 'legal_agreement': 0.05, 'audit_report': 0.05}.get(category, 0.0)
    return min(round(base + cat_modifier, 2), 1.0)
