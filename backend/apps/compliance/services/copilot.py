import logging, requests
from django.conf import settings
logger = logging.getLogger(__name__)

SYS = """You are Avora Compliance Copilot — an expert AI for Indian business compliance.
You have access to the user current compliance data. Be concise, professional, and actionable."""

def answer_compliance_question(owner, question: str) -> dict:
    from apps.compliance.models import ComplianceProfile, ExpiryAlert, MissingDocument, ComplianceCopilotChat
    from apps.contracts.models import ContractAnalysis
    try:
        p = ComplianceProfile.objects.get(owner=owner)
        score, audit_r, industry = p.compliance_score, p.audit_readiness_pct, p.industry
    except: score, audit_r, industry = 0, 0, "other"
    missing  = MissingDocument.objects.filter(owner=owner, is_resolved=False).count()
    expiring = ExpiryAlert.objects.filter(owner=owner, is_dismissed=False).exclude(alert_type="expired").count()
    high_risk= ContractAnalysis.objects.filter(owner=owner, risk_level__in=["high","critical"]).count()
    ctx = f"Score:{score}/100 Grade:{_grade(score)} Audit Readiness:{audit_r}% Missing docs:{missing} Expiring certs:{expiring} High-risk contracts:{high_risk} Industry:{industry}"
    prompt = f"{SYS}\n\nContext: {ctx}\n\nQuestion: {question}\nAnswer:"
    answer = _ollama(prompt)
    try:
        ComplianceCopilotChat.objects.create(owner=owner, role="user", message=question)
        ComplianceCopilotChat.objects.create(owner=owner, role="assistant", message=answer,
            context={"score":score,"audit_readiness":audit_r,"missing":missing})
    except: pass
    return {"answer": answer, "context": {"score":score,"audit_readiness":audit_r,"missing":missing,"expiring":expiring,"high_risk_contracts":high_risk}}

def _ollama(prompt):
    try:
        r = requests.post(f"{settings.OLLAMA_HOST}/api/generate",
            json={"model":getattr(settings,"OLLAMA_CHAT_MODEL","llama3"),"prompt":prompt,"stream":False,
                  "options":{"num_predict":500,"temperature":0.4}}, timeout=90)
        r.raise_for_status()
        return r.json().get("response","").strip()
    except Exception as e:
        logger.warning(f"[Copilot] {e}")
        return "Based on your compliance data, please ensure all critical documents are uploaded. I recommend starting with tax filings and certificates."

def _grade(s): return "A" if s>=90 else "B" if s>=75 else "C" if s>=60 else "D" if s>=40 else "F"
