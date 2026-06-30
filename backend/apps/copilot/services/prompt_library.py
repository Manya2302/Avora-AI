"""Avora AI Phase 4 — Prompt Library (Built-in Enterprise Prompts)"""
from apps.copilot.models import PromptTemplate

BUILTIN_PROMPTS = [
    {"title":"Audit Readiness Check","category":"audit","description":"Full audit readiness assessment with evidence gaps.",
     "prompt":"Are we fully ready for an external audit? Check compliance score, missing documents, expired certificates, and contract obligations. List critical gaps and provide a readiness score out of 100."},
    {"title":"Vendor Contract Review","category":"contract","description":"Analyze all vendor contracts for risks.",
     "prompt":"Review all vendor contracts and identify: 1) Contracts expiring in the next 90 days, 2) High-risk clauses, 3) Contracts with unlimited liability, 4) Auto-renewal clauses that need attention. Summarize findings."},
    {"title":"GST Compliance Check","category":"compliance","description":"Check GST filing completeness.",
     "prompt":"Check our GST compliance status: Which quarters have GST returns filed? Are there any missing filings? What is our GSTIN? List all GST-related documents with dates."},
    {"title":"Vendor Risk Summary","category":"vendor","description":"Risk assessment across all vendors.",
     "prompt":"Identify our top vendors from invoices and contracts. For each vendor: list active contracts, recent invoices, any compliance issues, and risk level. Highlight vendors with expired agreements or missing documents."},
    {"title":"HR Document Completeness","category":"hr","description":"Check employee record completeness.",
     "prompt":"Review HR documents. Which employee records are complete? Are there any missing offer letters, contracts, or compliance acknowledgments? List gaps by priority."},
    {"title":"Financial Invoice Analysis","category":"financial","description":"Analyze all invoices above threshold.",
     "prompt":"Find all invoices and payments above ₹1,00,000. List vendor name, amount, date, GST number, and payment status. Identify any invoices without corresponding contracts."},
    {"title":"Certificate Expiry Report","category":"compliance","description":"All expiring or expired certificates.",
     "prompt":"List all certificates, licenses, and registrations in the system. Which have expired? Which expire in the next 30/60/90 days? What is the renewal priority order?"},
    {"title":"ISO Audit Preparation","category":"audit","description":"Prepare evidence for ISO review.",
     "prompt":"Prepare an ISO audit evidence summary. List all: quality policies, procedure documents, compliance certificates, audit reports, corrective action records. Identify what is missing for ISO compliance."},
    {"title":"Contract Expiry Calendar","category":"contract","description":"All contracts with expiry timeline.",
     "prompt":"Show all contracts with their expiry dates. Sort by urgency. Which contracts expire this month? Next quarter? Identify contracts with auto-renewal clauses and their notice deadlines."},
    {"title":"Risk Assessment Summary","category":"risk","description":"Complete organizational risk profile.",
     "prompt":"Generate a comprehensive risk assessment. Include: 1) High-risk contracts with critical clauses, 2) Missing compliance documents, 3) Expired certificates, 4) Financial risks from invoices, 5) Overall risk score and recommendations."},
    {"title":"Policy Gap Analysis","category":"policy","description":"Identify missing organizational policies.",
     "prompt":"Review all policy documents. Which mandatory policies are present? Which are missing? Are any policies outdated (older than 2 years)? List recommended policies to add."},
    {"title":"Monthly Compliance Report","category":"compliance","description":"Monthly compliance status summary.",
     "prompt":"Generate a monthly compliance status report. Include: compliance score, new documents added, documents expiring soon, unresolved compliance gaps, and recommended actions for next month."},
]


def seed_builtin_prompts():
    """Create all built-in prompt templates if not already present."""
    created = 0
    for p in BUILTIN_PROMPTS:
        _, was_created = PromptTemplate.objects.get_or_create(
            title=p["title"], is_builtin=True,
            defaults={"category": p["category"], "description": p["description"],
                      "prompt": p["prompt"], "is_public": True})
        if was_created: created += 1
    return created


def get_templates_by_category(category: str = None) -> list:
    qs = PromptTemplate.objects.filter(is_builtin=True) | PromptTemplate.objects.filter(is_public=True)
    if category: qs = qs.filter(category=category)
    return list(qs.order_by("-use_count", "title")[:50].values(
        "id","title","description","prompt","category","use_count","is_builtin"))


def increment_use_count(template_id: str):
    PromptTemplate.objects.filter(id=template_id).update(
        use_count=models.F("use_count") + 1)


try:
    from django.db import models
except: pass
