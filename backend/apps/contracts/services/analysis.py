"""Contract analysis — one implementation used by the API and the upload pipeline."""
import logging
from datetime import datetime

from django.utils import timezone

logger = logging.getLogger(__name__)


def _parse_date(s):
    if not s:
        return None
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(str(s), fmt).date()
        except (ValueError, TypeError):
            pass
    return None


def mark_running(document_id, owner):
    """Create/flag the contract row as RUNNING before work starts (instant)."""
    from apps.contracts.models import ContractAnalysis
    from apps.documents.models import Document
    doc = Document.objects.only("original_name").get(id=document_id, owner=owner, is_deleted=False)
    contract, _ = ContractAnalysis.objects.update_or_create(
        document_id=document_id,
        defaults={"owner": owner, "title": doc.original_name,
                  "analysis_status": ContractAnalysis.AnalysisStatus.RUNNING, "analysis_error": ""})
    return contract


def run_contract_analysis(document_id: str, owner_id: str) -> dict:
    """Extract terms, analyse clauses, detect risks, set up renewal tracking."""
    from django.contrib.auth import get_user_model
    from apps.ai.models import DocumentOCR
    from apps.contracts.models import ContractAnalysis
    from apps.documents.models import Document
    from .contract_extractor import extract_contract_data
    from .clause_analyzer import analyze_clauses
    from .risk_detector import detect_risks
    from .renewal_tracker import setup_renewal_tracking

    owner = get_user_model().objects.get(id=owner_id)
    try:
        doc = Document.objects.get(id=document_id, owner=owner, is_deleted=False)
        ocr = DocumentOCR.objects.filter(document_id=document_id).only("cleaned_text", "raw_text").first()
        text = (ocr.cleaned_text or ocr.raw_text) if ocr else ""
        if not text:
            raise ValueError("Document has no extracted text yet.")
        ext = extract_contract_data(text)
        parties = ext.get("parties", {}) or {}
        contract, _ = ContractAnalysis.objects.update_or_create(
            document_id=document_id,
            defaults={"owner": owner, "title": doc.original_name,
                      "party_a": parties.get("party_a", ""), "party_b": parties.get("party_b", ""),
                      "contract_type": ext.get("contract_type", ""),
                      "effective_date": _parse_date(ext.get("effective_date")),
                      "expiry_date": _parse_date(ext.get("expiry_date")),
                      "contract_value": ext.get("contract_value"), "currency": ext.get("currency", ""),
                      "notice_period_days": ext.get("notice_period"),
                      "auto_renewal": bool(ext.get("auto_renewal", False)),
                      "key_obligations": ext.get("key_obligations", []), "key_dates": ext.get("key_dates", [])})
        clauses = analyze_clauses(contract, text)
        risks = detect_risks(contract, text)
        renewal = setup_renewal_tracking(contract)
        ContractAnalysis.objects.filter(pk=contract.pk).update(
            analysis_status=ContractAnalysis.AnalysisStatus.READY, analysis_error="", analyzed_at=timezone.now())
        logger.info(f"[Contracts] analyzed {document_id}")
        return {"contract_id": str(contract.id), "clauses_found": len(clauses or []),
                "risks_found": len(risks or []), "renewal": renewal}
    except Exception as e:
        logger.exception(f"[Contracts] analysis failed for {document_id}")
        msg = str(e) if isinstance(e, ValueError) else "Analysis failed. Please retry."
        ContractAnalysis.objects.filter(document_id=document_id, owner=owner).update(
            analysis_status=ContractAnalysis.AnalysisStatus.FAILED, analysis_error=msg[:300])
        return {"error": msg}
