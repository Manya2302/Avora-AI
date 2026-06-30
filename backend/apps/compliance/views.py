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
        except:
            industry = "other"
        score_data   = compute_compliance_score(request.user, industry)
        expiry_count = ExpiryAlert.objects.filter(owner=request.user, is_dismissed=False).count()
        missing_cnt  = MissingDocument.objects.filter(owner=request.user, is_resolved=False).count()
        timeline     = ComplianceTimeline.objects.filter(owner=request.user, is_completed=False).order_by("due_date")[:5]
        return Response({**score_data, "expiry_alerts": expiry_count, "missing_docs": missing_cnt,
                         "upcoming_events": ComplianceTimelineSerializer(timeline, many=True).data, "industry": industry})

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
        except: return Response(status=404)

class GenerateAuditPackageView(APIView):
    def post(self, request):
        from .services.audit_package import generate_audit_package
        pkg = generate_audit_package(request.user, request.data.get("name"))
        return Response(pkg, status=201)

class AuditPackageListView(generics.ListAPIView):
    serializer_class = AuditPackageSerializer
    def get_queryset(self):
        return AuditPackage.objects.filter(owner=self.request.user)

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
        try:
            from apps.ai.engine.training_pipeline import AvoraTrainingPipeline
            AvoraTrainingPipeline().record_correction(
                document_id=request.data.get("document_id",""),
                field=request.data.get("field",""),
                ai_value=request.data.get("ai_value",""),
                human_value=request.data.get("human_value",""),
                doc_text_snippet=request.data.get("text_snippet",""),
                owner_id=str(request.user.id),
            )
        except Exception as e:
            pass
        return Response({"message": "Correction recorded. Thank you for improving Avora AI!"})
