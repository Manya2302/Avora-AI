from rest_framework import serializers
from .models import ContractAnalysis, ContractClause, ContractRisk, ContractRenewal
from datetime import date

class ContractClauseSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContractClause
        fields = "__all__"

class ContractRiskSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContractRisk
        fields = "__all__"

class ContractRenewalSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContractRenewal
        fields = "__all__"

class ContractListSerializer(serializers.ModelSerializer):
    risk_count     = serializers.SerializerMethodField()
    days_to_expiry = serializers.SerializerMethodField()
    def get_risk_count(self, o):
        return ContractRisk.objects.filter(contract=o, is_resolved=False).count()
    def get_days_to_expiry(self, o):
        return (o.expiry_date - date.today()).days if o.expiry_date else None
    class Meta:
        model  = ContractAnalysis
        fields = ["id","document_id","title","party_a","party_b","contract_type",
                  "effective_date","expiry_date","risk_level","risk_score","status",
                  "contract_value","currency","risk_count","days_to_expiry","created_at"]

class ContractDetailSerializer(serializers.ModelSerializer):
    clauses = ContractClauseSerializer(many=True, read_only=True)
    risks   = ContractRiskSerializer(many=True, read_only=True)
    renewal = ContractRenewalSerializer(read_only=True)
    class Meta:
        model  = ContractAnalysis
        fields = "__all__"
