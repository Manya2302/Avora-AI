import os
import json
import logging
import requests
from django.conf import settings
from apps.documents.models import DocumentVersion, DocumentChangeLog

logger = logging.getLogger(__name__)

def analyze_temporal_diff(changelog_id: str):
    """
    Analyzes the differences between two document versions and generates a temporal intelligence report.
    Updates the DocumentChangeLog with AI findings.
    """
    try:
        changelog = DocumentChangeLog.objects.select_related('from_version', 'to_version', 'document').get(id=changelog_id)
    except DocumentChangeLog.DoesNotExist:
        logger.error(f"[TemporalDiff] DocumentChangeLog {changelog_id} not found.")
        return

    from_text = changelog.from_version.raw_text
    to_text = changelog.to_version.raw_text

    if not from_text or not to_text:
        logger.warning(f"[TemporalDiff] Missing raw text for version diff {changelog_id}")
        return

    logger.info(f"[TemporalDiff] Starting temporal analysis for {changelog.document.original_name} (v{changelog.from_version.version_number} -> v{changelog.to_version.version_number})")

    prompt = f"""
You are an expert Legal and Compliance Auditor.
Compare the following two versions of a document. 
Identify the changes made, any risks introduced, and the compliance impact.

Version {changelog.from_version.version_number}:
{from_text[:4000]}

Version {changelog.to_version.version_number}:
{to_text[:4000]}

Output your findings exactly in the following JSON format. Do not write any other text.
{{
    "what_changed": "A summary of the exact textual and semantic changes.",
    "risk_introduced": "Any risks introduced by these changes.",
    "compliance_impact": "How these changes impact compliance with standards like GDPR, SOC 2, etc."
}}
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
        logger.info(f"[TemporalDiff] Using local LLM for diff analysis: {e}")
        try:
            resp = requests.post(
                f"{host}/api/generate",
                json={"model": model, "prompt": prompt, "stream": False, "format": "json"},
                timeout=120
            )
            resp.raise_for_status()
            results_json = resp.json().get("response", "{}").strip()
        except Exception as local_e:
            logger.error(f"[TemporalDiff] Local model failed: {local_e}")
            return

    try:
        if "```json" in results_json:
            results_json = results_json.split("```json")[1].split("```")[0].strip()
        elif "```" in results_json:
            results_json = results_json.split("```")[1].split("```")[0].strip()
            
        data = json.loads(results_json)
        
        changelog.ai_summary = data.get("what_changed", "No significant changes detected.")
        changelog.ai_risk = data.get("risk_introduced", "None")
        changelog.ai_compliance = data.get("compliance_impact", "None")
        changelog.save()
        
        logger.info(f"[TemporalDiff] Successfully analyzed changes for {changelog_id}")
    except Exception as e:
        logger.error(f"[TemporalDiff] JSON parse error: {e} - Content: {results_json[:200]}")
