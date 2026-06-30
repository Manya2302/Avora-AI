"""Admin Panel — Phase 2 enhanced with AI monitoring endpoints."""
from django.contrib.auth import get_user_model
from django.db.models import Count, Sum, Avg, Q
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.users.serializers import UserSerializer
from apps.documents.models import Document
from apps.audit.models import AuditLog
from apps.audit.serializers import AuditLogSerializer
from .permissions import IsAdminRole

User = get_user_model()


class AdminDashboardView(APIView):
    permission_classes = [IsAdminRole]
    def get(self, request):
        from apps.users.models import UserSession
        from apps.ai.models import AIProcessingQueue, DocumentClassification
        return Response({
            'total_users':        User.objects.filter(is_active=True).count(),
            'total_documents':    Document.objects.filter(is_deleted=False).count(),
            'active_sessions':    UserSession.objects.filter(is_active=True).count(),
            'security_alerts':    AuditLog.objects.filter(is_flagged=True).count(),
            'storage_bytes':      Document.objects.filter(is_deleted=False).aggregate(t=Sum('encrypted_size'))['t'] or 0,
            'ai_processed':       AIProcessingQueue.objects.filter(stage='completed').count(),
            'ai_failed':          AIProcessingQueue.objects.filter(stage='failed').count(),
            'ai_processing':      AIProcessingQueue.objects.filter(stage__in=['queued','ocr','classification','embedding']).count(),
        })


class AdminUserListView(generics.ListAPIView):
    permission_classes = [IsAdminRole]
    serializer_class   = UserSerializer
    queryset           = User.objects.select_related('profile').order_by('-created_at')


class AdminUserDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAdminRole]
    serializer_class   = UserSerializer
    queryset           = User.objects.all()


class AdminDocumentListView(generics.ListAPIView):
    permission_classes = [IsAdminRole]
    from apps.documents.serializers import DocumentListSerializer
    serializer_class   = DocumentListSerializer
    queryset           = Document.objects.filter(is_deleted=False).select_related('metadata','owner')


class AdminAuditLogView(generics.ListAPIView):
    permission_classes = [IsAdminRole]
    serializer_class   = AuditLogSerializer
    queryset           = AuditLog.objects.select_related('user').all()


class AdminSecurityAlertsView(generics.ListAPIView):
    permission_classes = [IsAdminRole]
    serializer_class   = AuditLogSerializer
    queryset           = AuditLog.objects.filter(is_flagged=True).select_related('user')


class AdminStorageStatsView(APIView):
    permission_classes = [IsAdminRole]
    def get(self, request):
        qs = Document.objects.filter(is_deleted=False)
        return Response({
            'total_encrypted_bytes':  qs.aggregate(t=Sum('encrypted_size'))['t']  or 0,
            'total_original_bytes':   qs.aggregate(t=Sum('original_size'))['t']   or 0,
            'total_compressed_bytes': qs.aggregate(t=Sum('compressed_size'))['t'] or 0,
            'total_documents':        qs.count(),
            'by_extension':           list(qs.values('file_extension').annotate(count=Count('id'), size=Sum('encrypted_size')).order_by('-count')[:10]),
        })


# ── Phase 2: AI Monitoring ────────────────────────────────────

class AdminAIMonitorView(APIView):
    """GET /api/admin-panel/ai/monitor/  — Full AI health dashboard."""
    permission_classes = [IsAdminRole]

    def get(self, request):
        from apps.ai.models import (AIProcessingQueue, DocumentClassification,
            DocumentOCR, DocumentEmbedding, SearchAnalytics, SearchHistory)

        queue_qs = AIProcessingQueue.objects.all()
        return Response({
            'pipeline': {
                'total':      queue_qs.count(),
                'completed':  queue_qs.filter(stage='completed').count(),
                'failed':     queue_qs.filter(stage='failed').count(),
                'processing': queue_qs.filter(stage__in=['queued','ocr','classification','embedding','summary']).count(),
                'avg_duration_ms': queue_qs.filter(stage='completed').aggregate(a=Avg('duration_ms'))['a'] or 0,
            },
            'ocr': {
                'total':      DocumentOCR.objects.count(),
                'completed':  DocumentOCR.objects.filter(status='completed').count(),
                'failed':     DocumentOCR.objects.filter(status='failed').count(),
                'avg_confidence': DocumentOCR.objects.filter(status='completed').aggregate(a=Avg('confidence_score'))['a'] or 0,
            },
            'classification': {
                'total':       DocumentClassification.objects.count(),
                'by_category': list(DocumentClassification.objects.values('category').annotate(count=Count('id')).order_by('-count')[:10]),
                'by_confidentiality': list(DocumentClassification.objects.values('confidentiality').annotate(count=Count('id'))),
                'avg_confidence': DocumentClassification.objects.aggregate(a=Avg('confidence_score'))['a'] or 0,
            },
            'embeddings': {
                'total':   DocumentEmbedding.objects.count(),
                'by_model': list(DocumentEmbedding.objects.values('model_name').annotate(count=Count('id'))),
            },
            'search': {
                'total_searches': SearchHistory.objects.count(),
                'unique_queries': SearchAnalytics.objects.count(),
                'popular':        list(SearchAnalytics.objects.order_by('-search_count').values('query','search_count')[:10]),
            },
        })


class AdminAIOCRQueueView(generics.ListAPIView):
    """GET /api/admin-panel/ai/ocr-queue/"""
    permission_classes = [IsAdminRole]
    from apps.ai.serializers import DocumentOCRSerializer
    serializer_class   = DocumentOCRSerializer
    def get_queryset(self):
        from apps.ai.models import DocumentOCR
        status_filter = self.request.query_params.get('status')
        qs = DocumentOCR.objects.all().order_by('-created_at')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs


class AdminAIFailedQueueView(generics.ListAPIView):
    """GET /api/admin-panel/ai/failed/"""
    permission_classes = [IsAdminRole]
    from apps.ai.serializers import AIQueueSerializer
    serializer_class   = AIQueueSerializer
    def get_queryset(self):
        from apps.ai.models import AIProcessingQueue
        return AIProcessingQueue.objects.filter(stage='failed').order_by('-updated_at')


class AdminRetriggerFailedView(APIView):
    """POST /api/admin-panel/ai/retrigger-failed/"""
    permission_classes = [IsAdminRole]
    def post(self, request):
        from apps.ai.models import AIProcessingQueue
        from apps.ai.tasks import run_ai_pipeline
        failed = AIProcessingQueue.objects.filter(stage='failed', retry_count__lt=3)
        count  = failed.count()
        for q in failed:
            run_ai_pipeline.delay(str(q.document_id), '')
        return Response({'message': f'Retriggered {count} failed jobs.'})


class AdminSearchAnalyticsView(generics.ListAPIView):
    """GET /api/admin-panel/ai/search-analytics/"""
    permission_classes = [IsAdminRole]
    from apps.ai.serializers import SearchAnalyticsSerializer
    serializer_class   = SearchAnalyticsSerializer
    def get_queryset(self):
        from apps.ai.models import SearchAnalytics
        return SearchAnalytics.objects.order_by('-search_count')[:50]


class AdminClassificationMetricsView(APIView):
    """GET /api/admin-panel/ai/classification-metrics/"""
    permission_classes = [IsAdminRole]
    def get(self, request):
        from apps.ai.models import DocumentClassification
        return Response({
            'by_category': list(DocumentClassification.objects.values('category')
                .annotate(count=Count('id'), avg_conf=Avg('confidence_score')).order_by('-count')),
            'by_confidentiality': list(DocumentClassification.objects.values('confidentiality')
                .annotate(count=Count('id'))),
            'high_risk': DocumentClassification.objects.filter(risk_score__gte=0.7).count(),
        })


# ── Phase 4: AI Governance ────────────────────────────────────

class AdminAIGovernanceView(APIView):
    """GET /api/admin-panel/ai-governance/ — Copilot usage + governance metrics."""
    permission_classes = [IsAdminRole]

    def get(self, request):
        from apps.copilot.models import CopilotConversation, CopilotMessage, AIReport, ReasoningLog
        from django.db.models import Avg, Count

        msgs = CopilotMessage.objects.filter(role="assistant")
        flagged = ReasoningLog.objects.exclude(hallucination_flags=[])

        return Response({
            "total_conversations": CopilotConversation.objects.count(),
            "total_queries":        msgs.count(),
            "avg_confidence":       round((msgs.aggregate(a=Avg("confidence_score"))["a"] or 0) * 100, 1),
            "avg_latency_ms":       round(msgs.aggregate(a=Avg("latency_ms"))["a"] or 0),
            "reports_generated":    AIReport.objects.filter(status="ready").count(),
            "hallucination_flags":  flagged.count(),
            "by_mode":              list(CopilotConversation.objects.values("mode").annotate(count=Count("id"))),
            "low_confidence_count": msgs.filter(confidence_score__lt=0.5).count(),
        })


class AdminPromptManagementView(generics.ListAPIView):
    """GET /api/admin-panel/prompts/"""
    permission_classes = [IsAdminRole]
    from apps.copilot.serializers import PromptTemplateSerializer
    serializer_class = PromptTemplateSerializer
    def get_queryset(self):
        from apps.copilot.models import PromptTemplate
        return PromptTemplate.objects.all().order_by("-use_count")


class AdminKnowledgeStatsView(APIView):
    """GET /api/admin-panel/knowledge-stats/"""
    permission_classes = [IsAdminRole]
    def get(self, request):
        from apps.knowledge.models import KnowledgeNode, KnowledgeRelationship
        from django.db.models import Count
        return Response({
            "total_nodes": KnowledgeNode.objects.count(),
            "total_relationships": KnowledgeRelationship.objects.count(),
            "by_type": list(KnowledgeNode.objects.values("node_type").annotate(count=Count("id")).order_by("-count")),
        })


class AdminFlaggedResponsesView(generics.ListAPIView):
    """GET /api/admin-panel/flagged-responses/ — Hallucination/low-confidence review queue."""
    permission_classes = [IsAdminRole]
    from apps.copilot.serializers import CopilotMessageSerializer
    serializer_class = CopilotMessageSerializer
    def get_queryset(self):
        from apps.copilot.models import CopilotMessage
        return CopilotMessage.objects.filter(role="assistant", confidence_score__lt=0.5).order_by("-created_at")[:50]
