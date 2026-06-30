"""Avora AI Phase 4 — AI Report Generator"""
import logging, requests
from django.conf import settings
from django.utils import timezone
from apps.copilot.models import AIReport
logger = logging.getLogger(__name__)

REPORT_PROMPTS = {
    "vendor_compliance": """Analyze the provided documents and generate a comprehensive Vendor Compliance Report with:
1. Executive Summary (2-3 sentences)
2. List of vendors identified
3. Compliance status per vendor
4. Missing or expired documents
5. Key risks identified
6. Recommendations (numbered list)
Cite source documents for each finding.""",

    "audit_evidence": """Review the provided documents and prepare an Audit Evidence Package with:
1. Executive Summary
2. Documents available for audit
3. Compliance status (pass/fail per requirement)
4. Gaps and missing evidence
5. Risk assessment
6. Recommendations for audit preparation
Cite each source document.""",

    "contract_summary": """Analyze the provided contracts and generate a Contract Summary Report with:
1. Executive Summary
2. Active contracts list with key terms
3. Contracts expiring within 90 days
4. Key obligations and deadlines
5. Identified risks (unlimited liability, auto-renewal, penalties)
6. Recommended actions""",

    "risk_assessment": """Review all provided documents and generate a Risk Assessment Report with:
1. Executive Summary — overall risk level (LOW/MEDIUM/HIGH/CRITICAL)
2. Financial risks
3. Legal and contractual risks
4. Compliance risks
5. Operational risks
6. Mitigation recommendations (priority ordered)""",

    "compliance_gap": """Analyze the provided documents and generate a Compliance Gap Analysis with:
1. Executive Summary
2. Required documents checklist (✓ present / ✗ missing)
3. Documents expiring soon
4. Critical gaps that block audit readiness
5. Priority action plan
6. Timeline recommendations""",
}


def generate_ai_report(owner, report_type: str, doc_ids: list, custom_prompt: str = "") -> dict:
    """Generate a full AI report from multiple documents."""
    from apps.ai.models import DocumentOCR
    from apps.documents.models import Document

    report = AIReport.objects.create(
        owner=owner,
        title=_report_title(report_type),
        report_type=report_type,
        status=AIReport.Status.GENERATING,
        document_ids=doc_ids,
        doc_count=len(doc_ids),
        prompt_used=custom_prompt or REPORT_PROMPTS.get(report_type, ""),
    )

    try:
        # Gather document content
        docs    = Document.objects.filter(id__in=doc_ids, owner=owner)
        context = _build_report_context(docs)
        prompt  = custom_prompt or REPORT_PROMPTS.get(report_type, "Analyze these documents and generate a comprehensive report.")
        full_prompt = f"{prompt}\n\nDOCUMENT CONTEXT:\n{context[:12000]}\n\nGenerate the report now:"

        answer = _call_ollama(full_prompt, max_tokens=1200)

        key_findings, recs = _extract_findings(answer)

        report.executive_summary  = _extract_summary(answer)
        report.full_content       = answer
        report.key_findings       = key_findings
        report.recommendations    = recs
        report.confidence_score   = 0.82 if context else 0.45
        report.status             = AIReport.Status.READY
        report.generated_at       = timezone.now()
        report.save()

        logger.info(f"[Report] Generated {report.id} for {owner.email}")
        return {"report_id": str(report.id), "status": "ready", "title": report.title,
                "executive_summary": report.executive_summary, "key_findings": key_findings,
                "recommendations": recs, "doc_count": len(doc_ids)}

    except Exception as e:
        report.status = AIReport.Status.FAILED; report.save()
        logger.error(f"[Report] Error: {e}")
        return {"report_id": str(report.id), "status": "failed", "error": str(e)}


def _build_report_context(docs) -> str:
    from apps.ai.models import DocumentOCR, DocumentSummary
    parts = []
    for doc in docs[:12]:
        try:
            summary = DocumentSummary.objects.get(document_id=doc.id)
            text    = summary.medium_summary or summary.short_summary
        except:
            try:
                ocr  = DocumentOCR.objects.get(document_id=doc.id, status="completed")
                text = (ocr.cleaned_text or ocr.raw_text)[:1000]
            except:
                text = ""
        parts.append(f"[{doc.original_name}]\n{text}")
    return "\n\n---\n\n".join(parts)


def _call_ollama(prompt: str, max_tokens: int = 1000) -> str:
    try:
        r = requests.post(
            f"{settings.OLLAMA_HOST}/api/generate",
            json={"model": getattr(settings,"OLLAMA_CHAT_MODEL","llama3"),
                  "prompt": prompt, "stream": False,
                  "options": {"num_predict": max_tokens, "temperature": 0.3}},
            timeout=150)
        r.raise_for_status()
        return r.json().get("response", "").strip()
    except Exception as e:
        logger.warning(f"[Report] Ollama: {e}")
        return f"Report generation requires Ollama AI model. Please ensure Ollama is running with llama3 model pulled.\n\nDocuments analyzed: {prompt.count('[') - prompt.count('[Source')} documents."


def _extract_summary(text: str) -> str:
    import re
    m = re.search(r"Executive Summary[:\s]+(.*?)(?:\n\n|\d+\.)", text, re.I | re.S)
    if m: return m.group(1).strip()[:500]
    sentences = text.split(".")
    return ". ".join(sentences[:3]).strip()[:500] if sentences else ""


def _extract_findings(text: str) -> tuple[list, list]:
    import re
    findings = []
    recs     = []
    for line in text.split("\n"):
        line = line.strip()
        if re.match(r"^[•\-\*]\s|^\d+\.\s", line):
            if any(w in line.lower() for w in ["recommend","action","should","must","ensure","review"]):
                recs.append(re.sub(r"^[•\-\*\d\.]\s*", "", line).strip())
            elif len(line) > 20:
                findings.append(re.sub(r"^[•\-\*\d\.]\s*", "", line).strip())
    return findings[:10], recs[:10]


def _report_title(report_type: str) -> str:
    titles = {
        "vendor_compliance": "Vendor Compliance Report",
        "audit_evidence":    "Audit Evidence Package",
        "contract_summary":  "Contract Summary Report",
        "risk_assessment":   "Risk Assessment Report",
        "compliance_gap":    "Compliance Gap Analysis",
        "financial_summary": "Financial Summary Report",
        "hr_review":         "HR Document Review",
    }
    from datetime import datetime
    return f"{titles.get(report_type, 'AI Report')} — {datetime.now().strftime('%b %Y')}"
