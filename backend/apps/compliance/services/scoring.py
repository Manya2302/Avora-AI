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

MAX_CHECKS_RETURNED = 500


def compute_compliance_score(owner, industry: str) -> dict:
    """Same response shape as before, in 4 queries (was ~9 plus two full iterations),
    with a bounded `checks` list, and the profile is written only when the score changes
    (it used to be written on every dashboard GET)."""
    from django.db.models import Count, Q
    from apps.compliance.models import ComplianceProfile, ComplianceCheckResult, ComplianceRisk
    from apps.documents.models import Document

    total_docs = Document.objects.filter(owner=owner, is_deleted=False, status="ai_ready").count()

    facts_qs = ComplianceCheckResult.objects.filter(owner=owner, is_ignored=False)
    agg = facts_qs.aggregate(
        total=Count("id"),
        missing=Count("id", filter=Q(status__icontains="Missing")),
        present=Count("id", filter=Q(status__icontains="Present")),
    )
    total_checks, missing_count = agg["total"], agg["missing"]

    if total_checks > 0:
        compliance_score = max(0, 100 - (missing_count * 10))
    else:
        compliance_score = 0 if total_docs > 0 else 100

    risk = ComplianceRisk.objects.filter(owner=owner, is_resolved=False).aggregate(
        critical=Count("id", filter=Q(severity="critical")),
        high=Count("id", filter=Q(severity="high")),
    )
    critical_risks, high_risks = risk["critical"], risk["high"]
    audit_readiness_pct = max(0, compliance_score - (critical_risks * 15) - (high_risks * 5))

    missing_list, checks = [], []
    if total_docs == 0:
        checks.append({"id": "0", "name": "Upload any document to begin", "status": "missing", "priority": "high",
                       "doc_type": "general", "score": 0, "location": "", "description": ""})
    facts = facts_qs.only("id", "requirement", "status", "doc_name", "location", "description") \
        .order_by("-created_at")[:MAX_CHECKS_RETURNED] if total_checks else []
    for fact in facts:
        is_missing = "missing" in (fact.status or "").lower()
        if is_missing:
            missing_list.append({"name": fact.requirement, "priority": "high", "doc_type": fact.doc_name})
        if total_docs:
            checks.append({
                "id": str(fact.id),
                "name": fact.requirement,
                "status": "missing" if is_missing else "compliant",
                "priority": "medium",
                "doc_type": fact.doc_name,
                "score": 0 if is_missing else 100,
                "location": fact.location,
                "description": fact.description,
            })

    if compliance_score >= 80 and total_checks > 0:
        checks.append({"name": "General Compliance Posture", "status": "compliant", "priority": "low",
                       "doc_type": "general", "score": 100})

    try:
        profile, created = ComplianceProfile.objects.get_or_create(owner=owner, defaults={"industry": industry})
        if created or profile.compliance_score != compliance_score or profile.audit_readiness_pct != audit_readiness_pct:
            ComplianceProfile.objects.filter(pk=profile.pk).update(
                compliance_score=compliance_score, audit_readiness_pct=audit_readiness_pct,
                last_scored_at=timezone.now())
    except Exception as e:
        logger.error(f"[Score] {e}")

    return {
        "score": compliance_score,
        "audit_readiness": audit_readiness_pct,
        "total_checks": total_checks if total_checks > 0 else 1,
        "compliant": agg["present"],
        "missing_count": missing_count,
        "critical_missing": critical_risks,
        "checks": checks,
        "missing": missing_list,
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
        return f"Remediate {len(critical)} critical documents immediately: {names}."
    return f"Good progress. Resolve {len(missing)} remaining AI findings to improve your score."
