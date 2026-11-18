from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import generics, status
from .models import ComplianceProfile, MissingDocument, ExpiryAlert, AuditPackage, ComplianceCopilotChat, ComplianceTimeline
from .serializers import MissingDocumentSerializer, ExpiryAlertSerializer, AuditPackageSerializer, CopilotChatSerializer, ComplianceTimelineSerializer

class ComplianceDashboardView(APIView):
    def get(self, request):
        from .services.scoring import compute_compliance_score
        try:
            profile  = ComplianceProfile.objects.get(owner=request.user)
            industry = profile.industry
        except Exception:
            industry = "other"
        score_data   = compute_compliance_score(request.user, industry)
        expiry_count = ExpiryAlert.objects.filter(owner=request.user, is_dismissed=False).count()
        missing_cnt  = MissingDocument.objects.filter(owner=request.user, is_resolved=False).count()
        timeline     = ComplianceTimeline.objects.filter(owner=request.user, is_completed=False).order_by("due_date")[:5]
        
        from .models import ComplianceRisk
        from .serializers import ComplianceRiskSerializer
        risks = ComplianceRisk.objects.filter(owner=request.user).order_by('-created_at')[:50]
        
        return Response({**score_data, "expiry_alerts": expiry_count, "missing_docs": missing_cnt,
                         "upcoming_events": ComplianceTimelineSerializer(timeline, many=True).data, 
                         "recent_risks": ComplianceRiskSerializer(risks, many=True).data,
                         "industry": industry})

class RunComplianceScanView(APIView):
    def post(self, request):
        from .services.scoring import compute_compliance_score
        from .services.expiry import scan_for_expiry_dates
        industry    = request.data.get("industry", "other")
        score_data  = compute_compliance_score(request.user, industry)
        expiry_list = scan_for_expiry_dates(request.user)
        return Response({**score_data, "new_expiry_alerts": len(expiry_list), "message": "Compliance scan complete."})

class MissingDocsView(generics.ListAPIView):
    serializer_class = MissingDocumentSerializer
    def get_queryset(self):
        return MissingDocument.objects.filter(owner=self.request.user, is_resolved=False)

class ExpiryAlertsView(generics.ListAPIView):
    serializer_class = ExpiryAlertSerializer
    def get_queryset(self):
        return ExpiryAlert.objects.filter(owner=self.request.user, is_dismissed=False).order_by("expiry_date")

class DismissExpiryAlertView(APIView):
    def patch(self, request, pk):
        try:
            a = ExpiryAlert.objects.get(pk=pk, owner=request.user)
            a.is_dismissed = True; a.save()
            return Response({"message": "Alert dismissed."})
        except Exception: return Response(status=404)

class GenerateAuditPackageView(APIView):
    def post(self, request):
        from .services.audit_package import generate_audit_package
        pkg = generate_audit_package(request.user, request.data.get("name"))
        return Response(pkg, status=201)

class AuditPackageListView(generics.ListAPIView):
    serializer_class = AuditPackageSerializer
    def get_queryset(self):
        return AuditPackage.objects.filter(owner=self.request.user)

class AuditPackageDownloadView(APIView):
    """GET /api/compliance/audit-packages/<id>/download/ — ZIP of the package's documents + manifest."""
    def get(self, request, pk):
        from django.http import FileResponse
        from apps.audit.models import AuditLog
        from .services.audit_export import build_audit_package_zip
        pkg = AuditPackage.objects.filter(pk=pk, owner=request.user).first()
        if pkg is None:
            return Response({"error": "Audit package not found."}, status=404)
        if pkg.status != AuditPackage.Status.READY:
            return Response({"error": "This package is not ready yet."}, status=409)
        fobj, filename, included = build_audit_package_zip(pkg, request.user)
        for d in included:
            AuditLog.log(request, "download", document_id=d["document_id"], resource=d["name"],
                         extra_data={"via": "audit_package", "package_id": str(pkg.id)})
        return FileResponse(fobj, as_attachment=True, filename=filename, content_type="application/zip")

class ComplianceCopilotView(APIView):
    def post(self, request):
        q = request.data.get("question", "").strip()
        if not q: return Response({"error": "Question required."}, status=400)
        from .services.copilot import answer_compliance_question
        return Response(answer_compliance_question(request.user, q))

class CopilotHistoryView(generics.ListAPIView):
    serializer_class = CopilotChatSerializer
    def get_queryset(self):
        return ComplianceCopilotChat.objects.filter(owner=self.request.user).order_by("created_at")[:50]

class ComplianceTimelineView(generics.ListAPIView):
    serializer_class = ComplianceTimelineSerializer
    def get_queryset(self):
        return ComplianceTimeline.objects.filter(owner=self.request.user, is_completed=False).order_by("due_date")

class RecordCorrectionView(APIView):
    def post(self, request):
        import logging
        from apps.documents.models import Document
        document_id = str(request.data.get("document_id", ""))[:64]
        # Only corrections on your own documents may feed the training data
        try:
            owned = Document.objects.filter(id=document_id, owner=request.user, is_deleted=False).exists()
        except Exception:
            owned = False
        if not owned:
            return Response({"error": "Document not found."}, status=404)
        try:
            from apps.ai.engine.training_pipeline import AvoraTrainingPipeline
            AvoraTrainingPipeline().record_correction(
                document_id=document_id,
                field=str(request.data.get("field", ""))[:100],
                ai_value=str(request.data.get("ai_value", ""))[:2000],
                human_value=str(request.data.get("human_value", ""))[:2000],
                doc_text_snippet=str(request.data.get("text_snippet", ""))[:4000],
                owner_id=str(request.user.id),
            )
        except Exception:
            logging.getLogger(__name__).exception("[Compliance] record_correction failed")
            return Response({"error": "Could not record correction."}, status=500)
        return Response({"message": "Correction recorded. Thank you for improving Avora AI!"})

class DismissRiskView(APIView):
    def patch(self, request, pk):
        from .models import ComplianceRisk
        try:
            r = ComplianceRisk.objects.get(pk=pk, owner=request.user)
            r.is_resolved = True; r.save()
            return Response({"message": "Risk dismissed."})
        except Exception: return Response(status=404)

class DismissFactView(APIView):
    def patch(self, request, pk):
        from .models import ComplianceCheckResult
        try:
            f = ComplianceCheckResult.objects.get(pk=pk, owner=request.user)
            f.is_ignored = True; f.save()
            return Response({"message": "Check ignored."})
        except Exception: return Response(status=404)
