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
    from apps.compliance.models import ComplianceProfile, ComplianceRisk
    from apps.ai.models import DocumentClassification
    from apps.documents.models import Document

    user_docs = Document.objects.filter(owner=owner, is_deleted=False, status="ai_ready")
    total_docs = user_docs.count()
    
    # Fetch all dynamic AI risks
    all_risks = ComplianceRisk.objects.filter(owner=owner)
    
    critical_risks = all_risks.filter(severity="critical").count()
    high_risks = all_risks.filter(severity="high").count()
    medium_risks = all_risks.filter(severity="medium").count()
    low_risks = all_risks.filter(severity="low").count()
    
    total_risks = all_risks.count()

    # Dynamic Scoring Logic
    # Start at 100, subtract points for each risk
    penalty = (critical_risks * 15) + (high_risks * 10) + (medium_risks * 5) + (low_risks * 2)
    compliance_score = max(0, 100 - penalty)
    
    # Audit Readiness: 100% minus critical risks penalty (heavy)
    audit_readiness_pct = max(0, 100 - (critical_risks * 25) - (high_risks * 5))
    
    # Missing docs can be represented as documents that have critical risks
    docs_with_critical_risks = Document.objects.filter(id__in=all_risks.filter(severity="critical").values_list('document_id', flat=True))
    missing_list = []
    for doc in docs_with_critical_risks:
        missing_list.append({
            "name": doc.original_name,
            "priority": "critical",
            "doc_type": "requires_remediation"
        })
        
    docs_with_high_risks = Document.objects.filter(id__in=all_risks.filter(severity="high").values_list('document_id', flat=True)).exclude(id__in=docs_with_critical_risks.values_list('id', flat=True))
    for doc in docs_with_high_risks:
        missing_list.append({
            "name": doc.original_name,
            "priority": "high",
            "doc_type": "requires_attention"
        })

    # Dummy checks list for UI backwards compatibility but using dynamic data
    checks = []
    if total_docs == 0:
        checks.append({"name": "Upload any document to begin", "status": "missing", "priority": "high", "doc_type": "general", "score": 0})
    else:
        for risk in all_risks:
            checks.append({
                "name": risk.compliance_standard + " - " + risk.risk_type,
                "status": "needs_review",
                "priority": risk.severity,
                "doc_type": "ai_finding",
                "score": 0
            })
            
    # Add a pseudo "Compliant" check if score is high
    if compliance_score >= 80:
        checks.append({"name": "General Compliance Posture", "status": "compliant", "priority": "low", "doc_type": "general", "score": 100})

    try:
        profile, _ = ComplianceProfile.objects.get_or_create(owner=owner, defaults={"industry":industry})
        profile.compliance_score    = compliance_score
        profile.audit_readiness_pct = audit_readiness_pct
        profile.last_scored_at      = timezone.now()
        profile.save()
    except Exception as e:
        logger.error(f"[Score] {e}")

    return {
        "score": compliance_score, 
        "audit_readiness": audit_readiness_pct,
        "total_checks": total_risks if total_risks > 0 else 1, 
        "compliant": 1 if compliance_score >= 80 else 0,
        "missing_count": len(missing_list), 
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
