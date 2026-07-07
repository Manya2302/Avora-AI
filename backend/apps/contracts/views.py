from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import generics, status
from datetime import date, timedelta
from .models import ContractAnalysis, ContractRisk, ContractRenewal
from .serializers import ContractListSerializer, ContractDetailSerializer, ContractRenewalSerializer

class ContractListView(generics.ListAPIView):
    serializer_class = ContractListSerializer
    def get_queryset(self):
        qs = ContractAnalysis.objects.filter(owner=self.request.user)
        if r := self.request.query_params.get("risk"):    qs = qs.filter(risk_level=r)
        if s := self.request.query_params.get("status"):  qs = qs.filter(status=s)
        return qs.order_by("-created_at")

class ContractDetailView(generics.RetrieveAPIView):
    serializer_class = ContractDetailSerializer
    def get_queryset(self):
        return ContractAnalysis.objects.filter(owner=self.request.user)

class AnalyzeContractView(APIView):
    def post(self, request):
        document_id = request.data.get("document_id")
        if not document_id: return Response({"error": "document_id required."}, status=400)
        from apps.documents.models import Document
        from apps.ai.models import DocumentOCR
        try:
            doc  = Document.objects.get(id=document_id, owner=request.user)
            ocr  = DocumentOCR.objects.get(document_id=document_id)
            text = ocr.cleaned_text or ocr.raw_text
        except: return Response({"error": "Document not found or not processed."}, status=404)
        from .services.contract_extractor import extract_contract_data
        from .services.clause_analyzer import analyze_clauses
        from .services.risk_detector import detect_risks
        from .services.renewal_tracker import setup_renewal_tracking
        ext     = extract_contract_data(text)
        parties = ext.get("parties", {})
        def parse_date(s):
            if not s: return None
            from datetime import datetime
            for fmt in ("%d/%m/%Y","%d-%m-%Y","%Y-%m-%d","%m/%d/%Y"):
                try: return datetime.strptime(s,fmt).date()
                except: pass
        contract, _ = ContractAnalysis.objects.update_or_create(
            document_id=document_id,
            defaults={"owner":request.user,"title":doc.original_name,
                      "party_a":parties.get("party_a",""),"party_b":parties.get("party_b",""),
                      "contract_type":ext.get("contract_type",""),
                      "effective_date":parse_date(ext.get("effective_date")),
                      "expiry_date":parse_date(ext.get("expiry_date")),
                      "contract_value":ext.get("contract_value"),"currency":ext.get("currency",""),
                      "notice_period_days":ext.get("notice_period"),"auto_renewal":ext.get("auto_renewal",False),
                      "key_obligations":ext.get("key_obligations",[]),"key_dates":ext.get("key_dates",[])})
        clauses = analyze_clauses(contract, text)
        risks   = detect_risks(contract, text)
        renewal = setup_renewal_tracking(contract)
        contract.refresh_from_db()
        return Response({"contract_id":str(contract.id),"title":contract.title,
                         "risk_level":contract.risk_level,"risk_score":contract.risk_score,
                         "clauses_found":len(clauses),"risks_found":len(risks),
                         "renewal":renewal,"message":"Contract analysis complete."})

class ContractRenewalCalendarView(APIView):
    def get(self, request):
        from .services.renewal_tracker import get_upcoming_renewals
        days = int(request.query_params.get("days", 90))
        return Response({"renewals": get_upcoming_renewals(request.user, days), "days_ahead": days})

class ContractRiskSummaryView(APIView):
    def get(self, request):
        qs = ContractAnalysis.objects.filter(owner=request.user)
        
        # Predictive Intelligence Engine
        predictions = []
        
        expiring_upcoming = qs.filter(expiry_date__lte=date.today()+timedelta(90), expiry_date__gte=date.today())
        expired = qs.filter(expiry_date__lt=date.today())
        critical_risks = qs.filter(risk_level="critical")
        
        if expiring_upcoming.exists():
            predictions.append({
                "type": "warning", 
                "title": "Upcoming Renewals & Expirations",
                "message": f"AI predicts operational disruption: {expiring_upcoming.count()} contract(s) expire or require renewal notices in <90 days."
            })
            
        if expired.exists():
            predictions.append({
                "type": "critical",
                "title": "Compliance Audit Failure Likely",
                "message": f"AI detected {expired.count()} expired active contracts, representing immediate compliance and liability risks."
            })
            
        if critical_risks.count() > 2:
            predictions.append({
                "type": "warning",
                "title": "Systemic Risk Exposure",
                "message": f"High concentration of critical risks ({critical_risks.count()} contracts). Recommend immediate policy review."
            })
            
        if not predictions:
            predictions.append({
                "type": "success",
                "title": "Stable Posture",
                "message": "AI forecasts low risk for the upcoming quarter based on current contract renewals and clause profiles."
            })

        from apps.contracts.models import ContractRisk
        from apps.compliance.models import ComplianceRisk
        # Count actual individual risks across all contracts and compliance scans for the user
        all_contract_risks = ContractRisk.objects.filter(contract__owner=request.user)
        all_compliance_risks = ComplianceRisk.objects.filter(owner=request.user)
        
        def count_sev(sev):
            return all_contract_risks.filter(severity=sev).count() + all_compliance_risks.filter(severity=sev).count()
        
        return Response({
            "total":       qs.count(),
            "total_risks": all_contract_risks.count() + all_compliance_risks.count(),
            "critical":    count_sev("critical"),
            "high":        count_sev("high"),
            "medium":      count_sev("medium"),
            "low":         count_sev("low"),
            "expiring_30": expiring_upcoming.count(), # keeping the key name for frontend compatibility but logic is 90 days
            "expired":     expired.count(),
            "auto_renewal":qs.filter(auto_renewal=True).count(),
            "total_value": sum(float(c.contract_value) for c in qs if c.contract_value),
            "predictions": predictions
        })

class UpdateRenewalActionView(APIView):
    def patch(self, request, pk):
        try:
            r = ContractRenewal.objects.get(pk=pk, contract__owner=request.user)
            r.action = request.data.get("action", r.action)
            r.notes  = request.data.get("notes", r.notes)
            if request.data.get("completed"): r.is_completed = True
            r.save()
            return Response(ContractRenewalSerializer(r).data)
        except: return Response(status=404)
