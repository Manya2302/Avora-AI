"""Avora AI Phase 4 — Copilot Models"""
import uuid
from django.db import models
from django.contrib.auth import get_user_model
User = get_user_model()


class CopilotConversation(models.Model):
    """A multi-turn conversation with the Avora Enterprise Copilot."""
    class Mode(models.TextChoices):
        DOCUMENT   = "document",   "Document Assistant"
        COMPLIANCE = "compliance", "Compliance Assistant"
        AUDIT      = "audit",      "Audit Assistant"
        KNOWLEDGE  = "knowledge",  "Knowledge Assistant"
        RISK       = "risk",       "Risk Assistant"

    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner        = models.ForeignKey(User, on_delete=models.CASCADE, related_name="copilot_conversations")
    title        = models.CharField(max_length=500, blank=True)
    mode         = models.CharField(max_length=20, choices=Mode.choices, default=Mode.DOCUMENT)
    message_count= models.IntegerField(default=0)
    is_pinned    = models.BooleanField(default=False)
    is_archived  = models.BooleanField(default=False)
    summary      = models.TextField(blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "copilot_conversations"
        ordering = ["-updated_at"]


class CopilotMessage(models.Model):
    """One message turn in a Copilot conversation."""
    class Role(models.TextChoices):
        USER      = "user",      "User"
        ASSISTANT = "assistant", "Assistant"
        SYSTEM    = "system",    "System"

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation    = models.ForeignKey(CopilotConversation, on_delete=models.CASCADE, related_name="messages")
    role            = models.CharField(max_length=10, choices=Role.choices)
    content         = models.TextField()
    thinking        = models.TextField(blank=True)   # internal reasoning chain
    confidence_score= models.FloatField(null=True, blank=True)   # 0–1
    sources_count   = models.IntegerField(default=0)
    tokens_used     = models.IntegerField(default=0)
    latency_ms      = models.IntegerField(default=0)
    is_error        = models.BooleanField(default=False)
    created_at      = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "copilot_messages"
        ordering = ["created_at"]


class DocumentReference(models.Model):
    """Documents cited in a Copilot response."""
    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message      = models.ForeignKey(CopilotMessage, on_delete=models.CASCADE, related_name="references")
    document_id  = models.UUIDField(db_index=True)
    document_name= models.CharField(max_length=500)
    relevance    = models.FloatField(default=0.0)   # 0–1
    page_hint    = models.CharField(max_length=50, blank=True)
    excerpt      = models.TextField(blank=True)     # relevant passage
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "document_references"
        ordering = ["-relevance"]


class PromptTemplate(models.Model):
    """Built-in and custom enterprise prompt templates."""
    class Category(models.TextChoices):
        AUDIT       = "audit",      "Audit Review"
        CONTRACT    = "contract",   "Contract Review"
        VENDOR      = "vendor",     "Vendor Analysis"
        POLICY      = "policy",     "Policy Review"
        RISK        = "risk",       "Risk Assessment"
        COMPLIANCE  = "compliance", "Compliance Check"
        FINANCIAL   = "financial",  "Financial Review"
        HR          = "hr",         "HR Review"
        CUSTOM      = "custom",     "Custom"

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner       = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    title       = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    prompt      = models.TextField()
    category    = models.CharField(max_length=20, choices=Category.choices, default=Category.CUSTOM)
    is_builtin  = models.BooleanField(default=False)
    is_public   = models.BooleanField(default=False)
    use_count   = models.IntegerField(default=0)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "prompt_templates"
        ordering = ["-use_count", "title"]


class AIReport(models.Model):
    """AI-generated reports from multi-document analysis."""
    class ReportType(models.TextChoices):
        VENDOR_COMPLIANCE  = "vendor_compliance",  "Vendor Compliance Report"
        AUDIT_EVIDENCE     = "audit_evidence",     "Audit Evidence Package"
        CONTRACT_SUMMARY   = "contract_summary",   "Contract Summary"
        RISK_ASSESSMENT    = "risk_assessment",    "Risk Assessment"
        HR_REVIEW          = "hr_review",          "HR Document Review"
        FINANCIAL_SUMMARY  = "financial_summary",  "Financial Summary"
        COMPLIANCE_GAP     = "compliance_gap",     "Compliance Gap Analysis"
        CUSTOM             = "custom",             "Custom Report"

    class Status(models.TextChoices):
        GENERATING = "generating", "Generating"
        READY      = "ready",      "Ready"
        FAILED     = "failed",     "Failed"

    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner        = models.ForeignKey(User, on_delete=models.CASCADE, related_name="ai_reports")
    title        = models.CharField(max_length=500)
    report_type  = models.CharField(max_length=30, choices=ReportType.choices, default=ReportType.CUSTOM)
    status       = models.CharField(max_length=15, choices=Status.choices, default=Status.GENERATING)
    prompt_used  = models.TextField(blank=True)
    executive_summary = models.TextField(blank=True)
    full_content = models.TextField(blank=True)
    doc_count    = models.IntegerField(default=0)
    document_ids = models.JSONField(default=list)
    key_findings = models.JSONField(default=list)
    recommendations = models.JSONField(default=list)
    confidence_score = models.FloatField(default=0.0)
    export_url   = models.CharField(max_length=500, blank=True)
    generated_at = models.DateTimeField(null=True, blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "ai_reports"
        ordering = ["-created_at"]


class ReasoningLog(models.Model):
    """Internal reasoning chain for each AI response — for audit + explainability."""
    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message      = models.OneToOneField(CopilotMessage, on_delete=models.CASCADE, related_name="reasoning")
    query_analysis = models.TextField(blank=True)
    retrieval_query= models.TextField(blank=True)
    docs_retrieved = models.IntegerField(default=0)
    context_tokens = models.IntegerField(default=0)
    prompt_tokens  = models.IntegerField(default=0)
    completion_tokens = models.IntegerField(default=0)
    hallucination_flags = models.JSONField(default=list)
    guardrails_triggered = models.JSONField(default=list)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "reasoning_logs"


class AIRecommendation(models.Model):
    """Proactive AI recommendations surfaced in dashboard."""
    class Priority(models.TextChoices):
        CRITICAL = "critical", "Critical"
        HIGH     = "high",     "High"
        MEDIUM   = "medium",   "Medium"
        LOW      = "low",      "Low"

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner       = models.ForeignKey(User, on_delete=models.CASCADE, related_name="ai_recommendations")
    title       = models.CharField(max_length=255)
    description = models.TextField()
    action      = models.TextField(blank=True)
    priority    = models.CharField(max_length=10, choices=Priority.choices, default=Priority.MEDIUM)
    category    = models.CharField(max_length=50, blank=True)
    document_ids= models.JSONField(default=list)
    is_dismissed= models.BooleanField(default=False)
    is_actioned = models.BooleanField(default=False)
    expires_at  = models.DateTimeField(null=True, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "ai_recommendations"
        ordering = ["priority", "-created_at"]
