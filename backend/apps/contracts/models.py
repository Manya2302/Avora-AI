import uuid
from django.db import models
from django.contrib.auth import get_user_model
User = get_user_model()

class ContractAnalysis(models.Model):
    class RiskLevel(models.TextChoices):
        LOW      = "low",      "Low Risk"
        MEDIUM   = "medium",   "Medium Risk"
        HIGH     = "high",     "High Risk"
        CRITICAL = "critical", "Critical Risk"
    class Status(models.TextChoices):
        ACTIVE     = "active",    "Active"
        EXPIRING   = "expiring",  "Expiring Soon"
        EXPIRED    = "expired",   "Expired"
        DRAFT      = "draft",     "Draft"
        TERMINATED = "terminated","Terminated"
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document_id = models.UUIDField(unique=True, db_index=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="contract_analyses")
    title = models.CharField(max_length=500)
    party_a = models.CharField(max_length=255, blank=True)
    party_b = models.CharField(max_length=255, blank=True)
    contract_type = models.CharField(max_length=100, blank=True)
    effective_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    auto_renewal = models.BooleanField(default=False)
    notice_period_days = models.IntegerField(null=True, blank=True)
    contract_value = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=10, blank=True)
    risk_level = models.CharField(max_length=10, choices=RiskLevel.choices, default=RiskLevel.LOW)
    risk_score = models.FloatField(default=0.0)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.ACTIVE)
    ai_summary = models.TextField(blank=True)
    key_obligations = models.JSONField(default=list)
    key_dates = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        db_table = "contract_analyses"
        ordering = ["-created_at"]

class ContractClause(models.Model):
    class ClauseType(models.TextChoices):
        TERMINATION      = "termination",      "Termination"
        RENEWAL          = "renewal",          "Renewal"
        PAYMENT          = "payment",          "Payment Terms"
        LIABILITY        = "liability",        "Liability"
        CONFIDENTIALITY  = "confidentiality",  "Confidentiality"
        PENALTY          = "penalty",          "Penalty"
        FORCE_MAJEURE    = "force_majeure",    "Force Majeure"
        DISPUTE          = "dispute",          "Dispute Resolution"
        GOVERNING_LAW    = "governing_law",    "Governing Law"
        INTELLECTUAL_PROP= "intellectual_prop","Intellectual Property"
        NON_COMPETE      = "non_compete",      "Non-Compete"
        SLA              = "sla",              "SLA"
        WARRANTY         = "warranty",         "Warranty"
        OTHER            = "other",            "Other"
    class RiskFlag(models.TextChoices):
        GREEN  = "green",  "No Risk"
        YELLOW = "yellow", "Moderate Risk"
        RED    = "red",    "High Risk"
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    contract = models.ForeignKey(ContractAnalysis, on_delete=models.CASCADE, related_name="clauses")
    clause_type = models.CharField(max_length=30, choices=ClauseType.choices)
    title = models.CharField(max_length=255)
    raw_text = models.TextField()
    ai_summary = models.TextField(blank=True)
    risk_flag = models.CharField(max_length=10, choices=RiskFlag.choices, default=RiskFlag.GREEN)
    risk_reason = models.TextField(blank=True)
    is_standard = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        db_table = "contract_clauses"

class ContractRisk(models.Model):
    class Severity(models.TextChoices):
        INFO     = "info",    "Info"
        LOW      = "low",     "Low"
        MEDIUM   = "medium",  "Medium"
        HIGH     = "high",    "High"
        CRITICAL = "critical","Critical"
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    contract = models.ForeignKey(ContractAnalysis, on_delete=models.CASCADE, related_name="risks")
    title = models.CharField(max_length=255)
    description = models.TextField()
    severity = models.CharField(max_length=10, choices=Severity.choices)
    category = models.CharField(max_length=100)
    recommendation = models.TextField(blank=True)
    is_resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        db_table = "contract_risks"
        ordering = ["-severity"]

class ContractRenewal(models.Model):
    class Action(models.TextChoices):
        RENEW     = "renew",    "Renew"
        NEGOTIATE = "negotiate","Negotiate"
        TERMINATE = "terminate","Terminate"
        PENDING   = "pending",  "Pending"
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    contract = models.OneToOneField(ContractAnalysis, on_delete=models.CASCADE, related_name="renewal")
    renewal_due = models.DateField()
    notice_deadline = models.DateField(null=True, blank=True)
    days_until = models.IntegerField(default=0)
    action = models.CharField(max_length=15, choices=Action.choices, default=Action.PENDING)
    notes = models.TextField(blank=True)
    is_completed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        db_table = "contract_renewals"
        ordering = ["renewal_due"]
