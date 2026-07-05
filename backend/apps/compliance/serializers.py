from rest_framework import serializers
from .models import ComplianceProfile, MissingDocument, ExpiryAlert, AuditPackage, ComplianceCopilotChat, ComplianceTimeline, ComplianceRisk

class ComplianceProfileSerializer(serializers.ModelSerializer):
    grade = serializers.SerializerMethodField()
    def get_grade(self, o):
        s = o.compliance_score
        return "A" if s>=90 else "B" if s>=75 else "C" if s>=60 else "D" if s>=40 else "F"
    class Meta:
        model = ComplianceProfile
        fields = "__all__"
        read_only_fields = ["owner","compliance_score","audit_readiness_pct","last_scored_at"]

class MissingDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = MissingDocument
        fields = "__all__"
        read_only_fields = ["owner","created_at"]

class ExpiryAlertSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpiryAlert
        fields = "__all__"
        read_only_fields = ["owner","created_at"]

class AuditPackageSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditPackage
        fields = "__all__"
        read_only_fields = ["owner","created_at","generated_at"]

class CopilotChatSerializer(serializers.ModelSerializer):
    class Meta:
        model = ComplianceCopilotChat
        fields = "__all__"
        read_only_fields = ["owner","created_at"]

class ComplianceTimelineSerializer(serializers.ModelSerializer):
    class Meta:
        model = ComplianceTimeline
        fields = "__all__"
        fields = "__all__"
        read_only_fields = ["owner","created_at"]

class ComplianceRiskSerializer(serializers.ModelSerializer):
    class Meta:
        model = ComplianceRisk
        fields = "__all__"
        read_only_fields = ["owner","created_at"]
