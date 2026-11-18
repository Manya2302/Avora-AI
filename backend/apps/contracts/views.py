from django.db.models import Sum
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import generics, status
from datetime import date, timedelta
from .models import ContractAnalysis, ContractRisk, ContractRenewal
from .serializers import ContractListSerializer, ContractDetailSerializer, ContractRenewalSerializer

class ContractListView(generics.ListAPIView):
    serializer_class = ContractListSerializer
    def get_queryset(self):
        from django.db.models import Count, Q
        qs = ContractAnalysis.objects.filter(owner=self.request.user).annotate(
            open_risks=Count("risks", filter=Q(risks__is_resolved=False)))   # was 1 COUNT per row
        if r := self.request.query_params.get("risk"):    qs = qs.filter(risk_level=r)
        if s := self.request.query_params.get("status"):  qs = qs.filter(status=s)
        return qs.order_by("-created_at")

class ContractDetailView(generics.RetrieveAPIView):
    serializer_class = ContractDetailSerializer
    def get_queryset(self):
        return ContractAnalysis.objects.filter(owner=self.request.user)

class AnalyzeContractView(APIView):
    """POST /api/contracts/analyze/ {document_id}
    Returns 202 immediately; poll GET /api/contracts/<contract_id>/ until
    analysis_status is "ready" or "failed"."""
    def post(self, request):
        import uuid
        from apps.ai.models import DocumentOCR
        from apps.ai.services.dispatch import dispatch
        from .services.analysis import mark_running
        from .tasks import analyze_contract_task
        document_id = request.data.get("document_id")
        try:
            document_id = str(uuid.UUID(str(document_id)))
        except (ValueError, TypeError):
            return Response({"error": "document_id required."}, status=400)
        if not DocumentOCR.objects.filter(document_id=document_id).exclude(cleaned_text="", raw_text="").exists():
            return Response({"error": "Document not found or not processed."}, status=404)
        try:
            contract = mark_running(document_id, request.user)
        except Exception:
            return Response({"error": "Document not found or not processed."}, status=404)
        dispatch(analyze_contract_task, document_id, str(request.user.id))
        return Response({"contract_id": str(contract.id), "title": contract.title,
                         "analysis_status": contract.analysis_status,
                         "poll_url": f"/api/contracts/{contract.id}/",
                         "message": "Contract analysis started."}, status=202)

class ContractRenewalCalendarView(APIView):
    def get(self, request):
        from .services.renewal_tracker import get_upcoming_renewals
        from utils.exceptions import int_param
        days = int_param(request.query_params.get("days"), 90, 1, 365)
        return Response({"renewals": get_upcoming_renewals(request.user, days), "days_ahead": days})

class ContractRiskSummaryView(APIView):
    def get(self, request):
        """Same response as before in 3 queries (was ~20 COUNT/EXISTS queries)."""
        from django.db.models import Count, Q
        from apps.contracts.models import ContractRisk
        from apps.compliance.models import ComplianceRisk
        today = date.today()
        c = ContractAnalysis.objects.filter(owner=request.user).aggregate(
            total=Count("id"),
            expiring=Count("id", filter=Q(expiry_date__gte=today, expiry_date__lte=today + timedelta(90))),
            expired=Count("id", filter=Q(expiry_date__lt=today)),
            critical=Count("id", filter=Q(risk_level="critical")),
            auto_renewal=Count("id", filter=Q(auto_renewal=True)),
            value=Sum("contract_value"),
        )
        sev = {k: 0 for k in ("critical", "high", "medium", "low")}
        total_risks = 0
        for qs in (ContractRisk.objects.filter(contract__owner=request.user),
                   ComplianceRisk.objects.filter(owner=request.user)):
            for row in qs.values("severity").annotate(n=Count("id")):
                total_risks += row["n"]
                if row["severity"] in sev:
                    sev[row["severity"]] += row["n"]

        predictions = []
        if c["expiring"]:
            predictions.append({
                "type": "warning",
                "title": "Upcoming Renewals & Expirations",
                "message": f"AI predicts operational disruption: {c['expiring']} contract(s) expire or require renewal notices in <90 days."
            })
        if c["expired"]:
            predictions.append({
                "type": "critical",
                "title": "Compliance Audit Failure Likely",
                "message": f"AI detected {c['expired']} expired active contracts, representing immediate compliance and liability risks."
            })
        if c["critical"] > 2:
            predictions.append({
                "type": "warning",
                "title": "Systemic Risk Exposure",
                "message": f"High concentration of critical risks ({c['critical']} contracts). Recommend immediate policy review."
            })
        if not predictions:
            predictions.append({
                "type": "success",
                "title": "Stable Posture",
                "message": "AI forecasts low risk for the upcoming quarter based on current contract renewals and clause profiles."
            })

        return Response({
            "total":       c["total"],
            "total_risks": total_risks,
            "critical":    sev["critical"],
            "high":        sev["high"],
            "medium":      sev["medium"],
            "low":         sev["low"],
            "expiring_30": c["expiring"],  # key kept for frontend compatibility (window is 90 days)
            "expired":     c["expired"],
            "auto_renewal": c["auto_renewal"],
            "total_value": float(c["value"] or 0),
            "predictions": predictions,
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
        except Exception: return Response(status=404)
