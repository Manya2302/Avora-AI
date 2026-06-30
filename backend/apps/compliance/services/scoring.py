import logging
from django.utils import timezone
logger = logging.getLogger(__name__)

INDUSTRY_REQUIREMENTS = {
    "law_firm":   [
        {"name":"GST Registration","doc_type":"certificate","priority":"critical"},
        {"name":"Bar Council Registration","doc_type":"certificate","priority":"critical"},
        {"name":"GST Returns (Quarterly)","doc_type":"tax_filing","priority":"critical"},
        {"name":"Income Tax Return","doc_type":"tax_filing","priority":"critical"},
        {"name":"Professional Indemnity Insurance","doc_type":"insurance_policy","priority":"high"},
        {"name":"Client Agreements","doc_type":"contract","priority":"high"},
        {"name":"Audit Report","doc_type":"audit_report","priority":"high"},
    ],
    "ca_firm":    [
        {"name":"ICAI Registration","doc_type":"certificate","priority":"critical"},
        {"name":"GST Registration","doc_type":"certificate","priority":"critical"},
        {"name":"GST Returns","doc_type":"tax_filing","priority":"critical"},
        {"name":"TDS Returns","doc_type":"tax_filing","priority":"critical"},
        {"name":"Income Tax Return","doc_type":"tax_filing","priority":"critical"},
        {"name":"Peer Review Certificate","doc_type":"certificate","priority":"high"},
        {"name":"Professional Indemnity Insurance","doc_type":"insurance_policy","priority":"high"},
    ],
    "healthcare": [
        {"name":"Clinical Establishment Certificate","doc_type":"certificate","priority":"critical"},
        {"name":"Drug License","doc_type":"business_license","priority":"critical"},
        {"name":"Fire Safety Certificate","doc_type":"certificate","priority":"critical"},
        {"name":"Professional Liability Insurance","doc_type":"insurance_policy","priority":"critical"},
        {"name":"GST Returns","doc_type":"tax_filing","priority":"high"},
        {"name":"Biomedical Waste License","doc_type":"business_license","priority":"critical"},
    ],
    "consulting": [
        {"name":"Company Registration","doc_type":"certificate","priority":"critical"},
        {"name":"GST Registration","doc_type":"certificate","priority":"critical"},
        {"name":"GST Returns","doc_type":"tax_filing","priority":"critical"},
        {"name":"Income Tax Return","doc_type":"tax_filing","priority":"critical"},
        {"name":"Client Service Agreements","doc_type":"contract","priority":"high"},
        {"name":"Annual Audit Report","doc_type":"audit_report","priority":"high"},
    ],
    "startup":    [
        {"name":"Incorporation Certificate","doc_type":"certificate","priority":"critical"},
        {"name":"Shareholder Agreement","doc_type":"contract","priority":"critical"},
        {"name":"GST Registration","doc_type":"certificate","priority":"high"},
        {"name":"GST Returns","doc_type":"tax_filing","priority":"high"},
        {"name":"Income Tax Return","doc_type":"tax_filing","priority":"high"},
        {"name":"Employee Offer Letters","doc_type":"employee_record","priority":"medium"},
    ],
    "other":      [
        {"name":"Business Registration","doc_type":"certificate","priority":"critical"},
        {"name":"GST Returns","doc_type":"tax_filing","priority":"high"},
        {"name":"Income Tax Return","doc_type":"tax_filing","priority":"high"},
        {"name":"Annual Audit Report","doc_type":"audit_report","priority":"medium"},
    ],
}
PRIORITY_WEIGHTS = {"critical":40,"high":25,"medium":15,"low":5}
STATUS_SCORES    = {"compliant":100,"expiring_soon":65,"needs_review":50,"expired":10,"missing":0}

def compute_compliance_score(owner, industry: str) -> dict:
    from apps.compliance.models import ComplianceProfile, MissingDocument
    from apps.ai.models import DocumentClassification
    from apps.documents.models import Document

    reqs = INDUSTRY_REQUIREMENTS.get(industry, INDUSTRY_REQUIREMENTS["other"])
    user_docs = Document.objects.filter(owner=owner, is_deleted=False, status="ai_ready")
    classified = {str(c.document_id): c.category for c in
                  DocumentClassification.objects.filter(document_id__in=user_docs.values_list("id",flat=True))}

    total_weight = earned_weight = 0
    missing_list = []
    checks = []

    for req in reqs:
        weight   = PRIORITY_WEIGHTS.get(req["priority"], 10)
        total_weight += weight
        matched  = any(cat == req["doc_type"] for cat in classified.values())
        status   = "compliant" if matched else "missing"
        score_pct= STATUS_SCORES[status]
        earned_weight += weight * (score_pct / 100)
        checks.append({"name":req["name"],"status":status,"priority":req["priority"],
                       "doc_type":req["doc_type"],"score":score_pct})
        if not matched:
            missing_list.append({"name":req["name"],"priority":req["priority"],"doc_type":req["doc_type"]})

    compliance_score    = round((earned_weight / total_weight) * 100, 1) if total_weight else 0
    critical_missing    = len([m for m in missing_list if m["priority"]=="critical"])
    total_critical      = len([r for r in reqs if r["priority"]=="critical"])
    audit_readiness_pct = round((1 - critical_missing / max(1,total_critical)) * 100, 1)

    try:
        profile, _ = ComplianceProfile.objects.get_or_create(owner=owner, defaults={"industry":industry})
        profile.compliance_score    = compliance_score
        profile.audit_readiness_pct = audit_readiness_pct
        profile.last_scored_at      = timezone.now()
        profile.save()
        # Sync missing documents
        MissingDocument.objects.filter(owner=owner, is_resolved=False).delete()
        for m in missing_list:
            MissingDocument.objects.create(owner=owner, name=m["name"],
                priority=m["priority"], doc_type=m["doc_type"],
                description=f"Required {m['doc_type'].replace('_',' ')} not found in vault.",
                suggested_action=f"Upload your {m['name']} to improve compliance score.")
    except Exception as e:
        logger.error(f"[Score] {e}")

    return {
        "score": compliance_score, "audit_readiness": audit_readiness_pct,
        "total_checks": len(reqs), "compliant": len([c for c in checks if c["status"]=="compliant"]),
        "missing_count": len(missing_list), "critical_missing": critical_missing,
        "checks": checks, "missing": missing_list,
        "grade": _grade(compliance_score),
        "recommendation": _recommend(compliance_score, missing_list),
    }

def _grade(s):
    return "A" if s>=90 else "B" if s>=75 else "C" if s>=60 else "D" if s>=40 else "F"

def _recommend(score, missing):
    if score >= 90: return "Excellent compliance posture. Maintain current document hygiene."
    critical = [m for m in missing if m["priority"]=="critical"]
    if critical:
        names = ", ".join(m["name"] for m in critical[:3])
        return f"Upload {len(critical)} critical documents immediately: {names}."
    return f"Good progress. Upload {len(missing)} remaining documents to improve your score."
