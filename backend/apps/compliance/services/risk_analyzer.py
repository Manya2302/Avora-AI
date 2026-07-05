import os
import json
import logging
import requests
from django.conf import settings
from apps.compliance.models import ComplianceRisk

logger = logging.getLogger(__name__)

def analyze_compliance_risk(document_id: str, owner, text: str, doc_name: str):
    """
    Passes the document text through a local LLM or Groq to audit for compliance risks
    and missing standard form details.
    """
    logger.info(f"[Compliance] Starting intelligence scan for {document_id}")
    
    # Delete old risks for this document so we don't accumulate duplicates on edits
    ComplianceRisk.objects.filter(document_id=document_id).delete()
    
    prompt = f"""
You are an expert Compliance Auditor and Predictive Risk Analyst.
Analyze the following document for:
1. Compliance violations and missing standard clauses (e.g., ISO 27001, SOC 2, HIPAA, GDPR).
2. Missing fill-in-the-blank details or signatures.
3. Operational and Predictive Risks explicitly stated in the text (e.g., expired certificates, overdue security reviews, delayed breach notifications, increasing vendor risk scores, overdue penetration testing).

Output your findings exactly in the following JSON array format. Do not write any other text.
[
    {{
        "standard": "GDPR / SOC 2 / Operational / Predictive",
        "type": "Missing Clause / Operational Risk / Expired Certificate / Overdue Review",
        "severity": "critical / high / medium / low",
        "description": "Clear explanation of the risk, missing element, or negative trend found.",
        "suggested_fix": "What the user needs to do to mitigate this."
    }}
]

DOCUMENT CONTENT:
{text[:8000]}
"""

    host = os.getenv("OLLAMA_HOST", getattr(settings, "OLLAMA_HOST", "http://localhost:11434"))
    model = os.getenv("OLLAMA_CHAT_MODEL", "qwen2.5:7b")
    
    results_json = "[]"
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
        logger.info(f"[Compliance] Using local LLM for risk analysis: {e}")
        try:
            resp = requests.post(
                f"{host}/api/generate",
                json={"model": model, "prompt": prompt, "stream": False, "format": "json"},
                timeout=120
            )
            resp.raise_for_status()
            results_json = resp.json().get("response", "[]").strip()
        except Exception as local_e:
            logger.error(f"[Compliance] Local model failed: {local_e}")
            return

    try:
        # Strip markdown json blocks if any
        if "```json" in results_json:
            results_json = results_json.split("```json")[1].split("```")[0].strip()
        elif "```" in results_json:
            results_json = results_json.split("```")[1].split("```")[0].strip()
            
        data = json.loads(results_json)
        if isinstance(data, dict):
            risks = data.get("risks", data.get("findings", []))
        else:
            risks = data
            
        if not isinstance(risks, list):
            logger.warning("[Compliance] Unexpected JSON format")
            return
            
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
                suggested_fix=risk.get("suggested_fix", "")
            )
        logger.info(f"[Compliance] Logged {len(risks)} risks for {document_id}")
    except Exception as e:
        logger.error(f"[Compliance] JSON parse error: {e} - Content: {results_json[:200]}")
