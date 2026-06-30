import logging
from django.utils import timezone
logger = logging.getLogger(__name__)

def generate_audit_package(owner, name=None) -> dict:
    from apps.compliance.models import AuditPackage, ComplianceProfile
    from apps.documents.models import Document
    from .scoring import compute_compliance_score
    try:
        profile  = ComplianceProfile.objects.get(owner=owner)
        industry = profile.industry
    except: industry = "other"
    score_data = compute_compliance_score(owner, industry)
    docs       = Document.objects.filter(owner=owner, is_deleted=False, status="ai_ready")
    doc_ids    = [str(d.id) for d in docs]
    from datetime import datetime
    pkg_name = name or f"Audit Package — {datetime.now().strftime('%b %Y')}"
    package  = AuditPackage.objects.create(
        owner=owner, name=pkg_name, status=AuditPackage.Status.GENERATING,
        doc_count=len(doc_ids), document_ids=doc_ids,
        readiness_score=score_data["audit_readiness"],
        gaps=[m["name"] for m in score_data["missing"]],
    )
    package.status = AuditPackage.Status.READY
    package.generated_at = timezone.now()
    package.save()
    return {"package_id":str(package.id),"name":package.name,"status":package.status,
            "doc_count":package.doc_count,"readiness_score":package.readiness_score,
            "gaps":package.gaps,"generated_at":package.generated_at.isoformat()}
