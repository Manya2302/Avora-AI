import os
import json
import logging
import requests
from django.conf import settings
from apps.compliance.models import ComplianceRisk, ComplianceCheckResult

logger = logging.getLogger(__name__)

def analyze_compliance_risk(document_id: str, owner, text: str, doc_name: str):
    """
    Passes the document text through a local LLM or Groq to audit for compliance risks
    and missing standard form details, strictly separating Facts from Impact.
    """
    logger.info(f"[Compliance] Starting two-engine scan for {document_id}")
    
    # Delete old results so we don't accumulate duplicates on edits
    ComplianceRisk.objects.filter(document_id=document_id).delete()
    ComplianceCheckResult.objects.filter(document_id=document_id).delete()
    
    from apps.documents.models import DocumentMetadata
    industry_edition = "generic"
    try:
        meta = DocumentMetadata.objects.filter(document_id=document_id).first()
        if meta:
            industry_edition = meta.extra.get('industry_edition', 'generic')
    except Exception:
        pass
        
    industry_context = ""
    if industry_edition == "healthcare":
        industry_context = "- Healthcare Focus: Prioritize HIPAA compliance, PHI (Protected Health Information) risks, and medical document intelligence."
    elif industry_edition == "legal":
        industry_context = "- Legal Focus: Prioritize contract clauses, legal risk scoring, liability terms, and signature requirements."
    elif industry_edition == "finance":
        industry_context = "- Finance Focus: Prioritize AML (Anti-Money Laundering), KYC, regulatory reporting, and financial fraud risks."
    elif industry_edition == "manufacturing":
        industry_context = "- Manufacturing Focus: Prioritize SOP validations, ISO compliance, and supply chain audit trails."
    elif industry_edition == "government":
        industry_context = "- Government Focus: Prioritize records management, security clearance levels, and strict audit trails."

    prompt = f"""
You are an advanced Enterprise AI Governance Engine.
Your task is to analyze the document and explicitly separate your findings into two distinct categories.
Focus heavily on this industry context:
{industry_context}

1. COMPLIANCE FACTS ("What is missing or present?")
- Does this document meet required standards today?
- Check for standard clauses (e.g. GDPR, HIPAA, SOC 2, Encryption, Signatures, Retention) and industry-specific clauses.
- Output whether each requirement is "Present" or "Missing" based on the text.

2. BUSINESS RISKS ("What happens because it is missing?")
- Given the current document, what could go wrong?
- Translate the missing compliance facts into business impact.
- Also detect predictive risks: Contract expiring soon, Vendor risk increasing, Audit failure probability.

Output ONLY a raw JSON object with exactly two arrays. Do not write any other text.
{{
  "compliance_facts": [
    {{
      "requirement": "e.g., HIPAA Clause, Encryption, Signature",
      "status": "Present" or "Missing",
      "description": "Brief explanation of what was found or missing.",
      "location": "Quote the exact text snippet where it was found, or specify exactly where it should be inserted if missing."
    }}
  ],
  "business_risks": [
    {{
      "standard": "The expected standard (e.g., HIPAA, GDPR, Predictive)",
      "type": "Missing Control / Operational Risk / Predictive Risk",
      "severity": "critical / high / medium / low",
      "description": "Clear explanation of the business risk and impact.",
      "location": "Quote the problematic text snippet that triggers this risk, or state 'Entire Document'.",
      "suggested_fix": "Exact step-by-step instructions on how to solve this issue and mitigate the risk."
    }}
  ]
}}

DOCUMENT CONTENT:
{text[:8000]}
"""

    host = os.getenv("OLLAMA_HOST", getattr(settings, "OLLAMA_HOST", "http://localhost:11434"))
    model = os.getenv("OLLAMA_CHAT_MODEL", "qwen2.5:7b")
    
    results_json = "{}"
    try:
        groq_key = getattr(settings, "GROQ_API_KEY", os.getenv("GROQ_API_KEY"))
        from utils.circuit_breaker import groq_cb
        if groq_key and groq_cb.is_healthy():
            resp = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "system", "content": prompt}],
                    "temperature": 0.1,
                },
                timeout=20
            )
            if resp.status_code == 200:
                results_json = resp.json()['choices'][0]['message']['content'].strip()
                groq_cb.record_success()
            else:
                groq_cb.record_failure()
                raise Exception("Groq failed")
        else:
            raise Exception("Using local model")
    except Exception as e:
        logger.info(f"[Compliance] Using local LLM for two-engine analysis: {e}")
        try:
            resp = requests.post(
                f"{host}/api/generate",
                json={"model": model, "prompt": prompt, "stream": False, "format": "json"},
                timeout=120
            )
            resp.raise_for_status()
            results_json = resp.json().get("response", "{}").strip()
        except Exception as local_e:
            logger.error(f"[Compliance] Local model failed: {local_e}")
            return

    try:
        if "```json" in results_json:
            results_json = results_json.split("```json")[1].split("```")[0].strip()
        elif "```" in results_json:
            results_json = results_json.split("```")[1].split("```")[0].strip()
            
        data = json.loads(results_json)
        
        # 1. Save Compliance Facts
        facts = data.get("compliance_facts", [])
        for f in facts:
            ComplianceCheckResult.objects.create(
                owner=owner,
                document_id=document_id,
                doc_name=doc_name,
                requirement=f.get("requirement", "Check")[:255],
                status=f.get("status", "Missing")[:50],
                description=f.get("description", ""),
                location=f.get("location", "")[:500]
            )
            
        # 2. Save Business Risks
        risks = data.get("business_risks", [])
        for risk in risks:
            if not risk.get("description"): continue
            
            sev_str = str(risk.get("severity", "medium")).lower()
            if "critical" in sev_str: sev = ComplianceRisk.RiskLevel.CRITICAL
            elif "high" in sev_str: sev = ComplianceRisk.RiskLevel.HIGH
            elif "low" in sev_str: sev = ComplianceRisk.RiskLevel.LOW
            else: sev = ComplianceRisk.RiskLevel.MEDIUM

            ComplianceRisk.objects.create(
                owner=owner,
                document_id=document_id,
                doc_name=doc_name,
                compliance_standard=risk.get("standard", "General")[:100],
                risk_type=risk.get("type", "Risk")[:100],
                severity=sev,
                description=risk.get("description", ""),
                suggested_fix=risk.get("suggested_fix", ""),
                location=risk.get("location", "")[:500]
            )
            
        logger.info(f"[Compliance] Logged {len(facts)} facts and {len(risks)} risks for {document_id}")
    except Exception as e:
        logger.error(f"[Compliance] JSON parse error: {e} - Content: {results_json[:200]}")
