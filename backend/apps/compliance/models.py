import uuid
from django.db import models
from django.contrib.auth import get_user_model
User = get_user_model()

class ComplianceProfile(models.Model):
    class Industry(models.TextChoices):
        LAW_FIRM   = "law_firm",   "Law Firm"
        CA_FIRM    = "ca_firm",    "CA / Accounting"
        HEALTHCARE = "healthcare", "Healthcare"
        CONSULTING = "consulting", "Consulting"
        STARTUP    = "startup",    "Startup"
        OTHER      = "other",      "Other"
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.OneToOneField(User, on_delete=models.CASCADE, related_name="compliance_profile")
    industry = models.CharField(max_length=30, choices=Industry.choices, default=Industry.OTHER)
    compliance_score = models.FloatField(default=0.0)
    audit_readiness_pct = models.FloatField(default=0.0)
    last_scored_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        db_table = "compliance_profiles"

class MissingDocument(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="missing_docs")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    suggested_action = models.TextField(blank=True)
    priority = models.CharField(max_length=10, default="high")
    doc_type = models.CharField(max_length=50, blank=True)
    is_resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        db_table = "missing_documents"
        ordering = ["priority", "-created_at"]

class ExpiryAlert(models.Model):
    class AlertType(models.TextChoices):
        EXPIRED     = "expired",     "Expired"
        EXPIRING_30 = "expiring_30", "Expires in 30 days"
        EXPIRING_60 = "expiring_60", "Expires in 60 days"
        EXPIRING_90 = "expiring_90", "Expires in 90 days"
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="expiry_alerts")
    document_id = models.UUIDField(db_index=True)
    doc_name = models.CharField(max_length=500)
    doc_type = models.CharField(max_length=100)
    expiry_date = models.DateField()
    alert_type = models.CharField(max_length=20, choices=AlertType.choices)
    days_until = models.IntegerField(default=0)
    is_dismissed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        db_table = "expiry_alerts"
        ordering = ["expiry_date"]

class AuditPackage(models.Model):
    class Status(models.TextChoices):
        GENERATING = "generating", "Generating"
        READY      = "ready",      "Ready"
        FAILED     = "failed",     "Failed"
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="audit_packages")
    name = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.GENERATING)
    doc_count = models.IntegerField(default=0)
    document_ids = models.JSONField(default=list)
    readiness_score = models.FloatField(default=0.0)
    gaps = models.JSONField(default=list)
    generated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        db_table = "audit_packages"
        ordering = ["-created_at"]

class ComplianceCopilotChat(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="copilot_chats")
    role = models.CharField(max_length=10)
    message = models.TextField()
    context = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        db_table = "compliance_copilot_chats"
        ordering = ["created_at"]

class ComplianceTimeline(models.Model):
    class EventType(models.TextChoices):
        FILING_DUE     = "filing_due",    "Filing Due"
        RENEWAL_DUE    = "renewal_due",   "Renewal Due"
        AUDIT_DATE     = "audit_date",    "Audit Date"
        LICENSE_EXPIRY = "license_expiry","License Expiry"
        TAX_DUE        = "tax_due",       "Tax Due"
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="compliance_timeline")
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    event_type = models.CharField(max_length=20, choices=EventType.choices)
    due_date = models.DateField()
    document_id = models.UUIDField(null=True, blank=True)
    is_completed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        db_table = "compliance_timeline"
        ordering = ["due_date"]

class ComplianceRisk(models.Model):
    class RiskLevel(models.TextChoices):
        CRITICAL = "critical", "Critical"
        HIGH     = "high",     "High"
        MEDIUM   = "medium",   "Medium"
        LOW      = "low",      "Low"
        
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="compliance_risks")
    document_id = models.UUIDField(db_index=True)
    doc_name = models.CharField(max_length=500)
    
    compliance_standard = models.CharField(max_length=100, help_text="e.g., GDPR, SOC 2, ISO 27001, General")
    risk_type = models.CharField(max_length=100, help_text="e.g., Missing Clause, Data Violation, Missing Signature")
    severity = models.CharField(max_length=20, choices=RiskLevel.choices, default=RiskLevel.MEDIUM)
    
    description = models.TextField()
    suggested_fix = models.TextField()
    location = models.CharField(max_length=500, blank=True, help_text="Where the problem is located in the text")
    
    is_resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = "compliance_risks"
        ordering = ["-created_at"]

class ComplianceCheckResult(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="compliance_check_results")
    document_id = models.UUIDField(db_index=True)
    doc_name = models.CharField(max_length=500)
    
    requirement = models.CharField(max_length=255, help_text="e.g., GDPR, HIPAA, Encryption Clause")
    status = models.CharField(max_length=50, help_text="Present or Missing")
    description = models.TextField()
    location = models.CharField(max_length=500, blank=True, help_text="Where in the document this should be or was found")
    
    is_ignored = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = "compliance_check_results"
        ordering = ["-created_at"]
