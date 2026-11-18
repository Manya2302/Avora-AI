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
from .serializers import AdminUserSerializer, AdminDocumentSerializer

User = get_user_model()


ACTIVE_STAGES = ['queued', 'text_extraction', 'ocr', 'classification', 'embedding', 'storing']


class AdminDashboardView(APIView):
    permission_classes = [IsAdminRole]
    def get(self, request):
        from apps.users.models import UserSession
        from apps.ai.models import AIProcessingQueue, DocumentClassification
        from django.db.models import Q
        docs = Document.objects.filter(is_deleted=False).aggregate(n=Count('id'), size=Sum('encrypted_size'))
        q = AIProcessingQueue.objects.aggregate(
            done=Count('id', filter=Q(stage='completed')),
            failed=Count('id', filter=Q(stage='failed')),
            running=Count('id', filter=Q(stage__in=ACTIVE_STAGES)),
        )
        from datetime import timedelta
        from django.conf import settings as dj_settings
        from django.utils import timezone
        now = timezone.now()
        sizes = Document.objects.filter(is_deleted=False, original_size__gt=0, compressed_size__gt=0).aggregate(
            orig=Sum('original_size'), comp=Sum('compressed_size'))
        return Response({
            'total_users':        User.objects.filter(is_active=True).count(),
            'total_documents':    docs['n'],
            'active_sessions':    UserSession.objects.filter(is_active=True).count(),
            'security_alerts':    AuditLog.objects.filter(is_flagged=True).count(),
            'storage_bytes':      docs['size'] or 0,
            'ai_processed':       q['done'],
            'ai_failed':          q['failed'],
            'ai_processing':      q['running'],
            # growth + compression, from real rows (None/0 when there is nothing to report)
            'users_new_7d':       User.objects.filter(is_active=True, created_at__gte=now - timedelta(days=7)).count(),
            'documents_today':    Document.objects.filter(is_deleted=False, created_at__gte=timezone.localtime(now).replace(hour=0, minute=0, second=0, microsecond=0)).count(),
            'security_alerts_24h': AuditLog.objects.filter(is_flagged=True, created_at__gte=now - timedelta(hours=24)).count(),
            'original_bytes':     sizes['orig'] or 0,
            'compressed_bytes':   sizes['comp'] or 0,
            'compression_level':  getattr(dj_settings, 'ZSTD_COMPRESSION_LEVEL', 9),
        })


class AdminSystemHealthView(APIView):
    """GET /api/admin-panel/system-health/ — live, cheap reachability checks with short
    timeouts, run in parallel. Each row: {key, label, ok, status, ms}. ok=None means
    "not applicable / not configured" (shown neutrally, not as a failure)."""
    permission_classes = [IsAdminRole]
    TIMEOUT = 2.5

    def get(self, request):
        import time
        from concurrent.futures import ThreadPoolExecutor
        from django.conf import settings as s
        from django.db import connection

        T = self.TIMEOUT

        def timed(fn):
            t = time.perf_counter()
            try:
                ok, status = fn()
            except Exception:
                ok, status = False, 'Unreachable'
            return ok, status, round((time.perf_counter() - t) * 1000, 1)

        def database():
            with connection.cursor() as c:
                c.execute('SELECT 1')
            vendor = {'postgresql': 'PostgreSQL', 'sqlite': 'SQLite', 'mysql': 'MySQL'}.get(connection.vendor, connection.vendor)
            return True, f'Reachable ({vendor})'

        def qdrant():
            from qdrant_client import QdrantClient
            if getattr(s, 'QDRANT_URL', None) and getattr(s, 'QDRANT_API_KEY', None):
                c = QdrantClient(url=s.QDRANT_URL, api_key=s.QDRANT_API_KEY, timeout=T, check_compatibility=False)
            else:
                c = QdrantClient(host=s.QDRANT_HOST, port=s.QDRANT_PORT, timeout=T, check_compatibility=False)
            try:
                c.get_collections()
            finally:
                try: c.close()
                except Exception: pass
            return True, 'Reachable'

        def storage():
            if getattr(s, 'USE_MOCK_STORAGE', True):
                return None, 'Local mock storage (MinIO not in use)'
            import urllib3
            from minio import Minio
            http = urllib3.PoolManager(timeout=urllib3.Timeout(connect=T, read=T), retries=urllib3.Retry(total=0))
            c = Minio(s.MINIO_ENDPOINT, access_key=s.MINIO_ACCESS_KEY, secret_key=s.MINIO_SECRET_KEY,
                      secure=s.MINIO_SECURE, http_client=http)
            if c.bucket_exists(s.MINIO_BUCKET_NAME):
                return True, 'Reachable'
            return False, 'Bucket missing'

        def broker():
            if getattr(s, 'CELERY_TASK_ALWAYS_EAGER', False):
                return None, 'Tasks run in-process (no broker in use)'
            url = s.CELERY_BROKER_URL
            if url.startswith(('redis://', 'rediss://')):
                import redis
                redis.Redis.from_url(url, socket_connect_timeout=T, socket_timeout=T).ping()
                return True, 'Reachable'
            from kombu import Connection
            with Connection(url, connect_timeout=T) as conn:
                conn.ensure_connection(max_retries=1)
            return True, 'Reachable'

        def ai_provider():
            providers = [name for name, key in (('Groq', 'GROQ_API_KEY'), ('Cohere', 'COHERE_API_KEY'),
                                                 ('Gemini', 'GEMINI_API_KEY')) if getattr(s, key, None)]
            if providers:
                return True, 'Configured: ' + ', '.join(providers)
            # No cloud key — the local model (Ollama) is the only option; check it answers
            import requests
            host = getattr(s, 'OLLAMA_HOST', '') or ''
            if not host:
                return False, 'No AI provider configured'
            requests.get(host.rstrip('/') + '/api/tags', timeout=T).raise_for_status()
            return True, 'Local model (Ollama) reachable'

        checks = [
            ('database', 'Database', database),
            ('vector_store', 'Qdrant vector database', qdrant),
            ('storage', 'Object storage (MinIO)', storage),
            ('broker', 'Task queue (Celery broker)', broker),
            ('ai_provider', 'AI provider', ai_provider),
        ]

        def run(item):
            key, label, fn = item
            ok, status_text, ms = timed(fn)
            if key == 'ai_provider' and ok is False and status_text == 'Unreachable':
                status_text = 'No cloud key and local model unreachable'
            return {'key': key, 'label': label, 'ok': ok, 'status': status_text, 'ms': ms}

        from django.utils import timezone
        # DB check on the request thread (its own connection); network checks in parallel
        rows = [run(checks[0])]
        with ThreadPoolExecutor(max_workers=len(checks) - 1) as pool:
            rows += list(pool.map(run, checks[1:]))
        return Response({'checks': rows, 'checked_at': timezone.now()})


def _admin_user_queryset():
    """Users annotated with their live (non-deleted) document count and encrypted bytes."""
    live = Q(documents__is_deleted=False)
    return (User.objects.select_related('profile')
            .annotate(document_count=Count('documents', filter=live),
                      storage_bytes=Sum('documents__encrypted_size', filter=live))
            .order_by('-created_at'))


class AdminUserListView(generics.ListAPIView):
    """GET ?search=<name/email>&role=<admin|user|viewer>&is_active=<true|false>&page=N"""
    permission_classes = [IsAdminRole]
    serializer_class   = AdminUserSerializer
    search_fields      = ['email', 'full_name']
    filterset_fields   = ['role', 'is_active']

    def get_queryset(self):
        return _admin_user_queryset()


class AdminUserDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAdminRole]
    serializer_class   = AdminUserSerializer

    def get_queryset(self):
        return _admin_user_queryset()

    def perform_update(self, serializer):
        """PATCH role / is_active / full_name. Refuses to change your own role or deactivate
        yourself, and refuses to demote or deactivate the last active admin. Deactivation
        revokes the user's sessions; role and status changes are written to the audit log."""
        from rest_framework.exceptions import ValidationError
        from apps.users.models import UserSession
        from apps.users.security import revoke_sessions
        instance   = serializer.instance
        new_role   = serializer.validated_data.get('role', instance.role)
        new_active = serializer.validated_data.get('is_active', instance.is_active)
        role_changed   = new_role != instance.role
        active_changed = new_active != instance.is_active
        if instance.pk == self.request.user.pk and (role_changed or active_changed):
            raise ValidationError("You cannot change your own role or deactivate your own account.")
        if (instance.role == 'admin' and instance.is_active and (new_role != 'admin' or not new_active)
                and not User.objects.filter(role='admin', is_active=True).exclude(pk=instance.pk).exists()):
            raise ValidationError("Cannot demote or deactivate the last active admin.")
        serializer.save()
        if active_changed and not new_active:
            revoke_sessions(UserSession.objects.filter(user=instance))
        if role_changed or active_changed:
            changes = {}
            if role_changed:
                changes['role'] = new_role
            if active_changed:
                changes['is_active'] = new_active
            what = ('deactivate_user' if (active_changed and not new_active)
                    else 'reactivate_user' if active_changed else 'change_role')
            AuditLog.log(self.request, 'settings', resource=f"admin:{what}:{instance.pk}",
                         extra_data=changes, is_flagged=True)

    def perform_destroy(self, instance):
        """Deactivate instead of hard-delete: a hard delete cascaded away every document,
        audit-relevant record and compliance result of that user. Also refuses to remove
        yourself or the last active admin, revokes all sessions, and writes an audit entry."""
        from rest_framework.exceptions import ValidationError
        from apps.audit.models import AuditLog
        from apps.users.models import UserSession
        from apps.users.security import revoke_sessions
        if instance.pk == self.request.user.pk:
            raise ValidationError("You cannot deactivate your own account.")
        if instance.role == 'admin' and not User.objects.filter(role='admin', is_active=True).exclude(pk=instance.pk).exists():
            raise ValidationError("Cannot deactivate the last active admin.")
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
        revoke_sessions(UserSession.objects.filter(user=instance))
        AuditLog.log(self.request, 'settings', resource=f"admin:deactivate_user:{instance.pk}", is_flagged=True)


class AdminDocumentListView(generics.ListAPIView):
    permission_classes = [IsAdminRole]
    serializer_class   = AdminDocumentSerializer
    queryset           = Document.objects.filter(is_deleted=False).select_related('metadata','owner')
    # ?search=<file name / owner>&status=<..>&file_extension=<..>&owner=<user id>&page=N
    search_fields      = ['original_name', 'owner__email', 'owner__full_name']
    filterset_fields   = ['status', 'file_extension', 'owner']


class AdminAuditLogView(generics.ListAPIView):
    permission_classes = [IsAdminRole]
    serializer_class   = AuditLogSerializer
    queryset           = AuditLog.objects.select_related('user').all()
    # ?search=<resource / ip / user>&action=<..>&is_flagged=<true|false>&page=N
    search_fields      = ['resource', 'ip_address', 'user__email', 'user__full_name']
    filterset_fields   = ['is_flagged']

    def get_queryset(self):
        return _filter_action(super().get_queryset(), self.request)


def _filter_action(qs, request):
    """?action=<value>. A plain match (not a ChoiceFilter): some entries use actions outside
    AuditLog.Action, e.g. 'login_failed' written by apps.users.security."""
    action = (request.query_params.get('action') or '').strip()
    return qs.filter(action=action) if action else qs


class AdminSecurityAlertsView(generics.ListAPIView):
    permission_classes = [IsAdminRole]
    serializer_class   = AuditLogSerializer
    queryset           = AuditLog.objects.filter(is_flagged=True).select_related('user')
    search_fields      = ['resource', 'ip_address', 'user__email', 'user__full_name']

    def get_queryset(self):
        return _filter_action(super().get_queryset(), self.request)


class AdminStorageStatsView(APIView):
    permission_classes = [IsAdminRole]
    def get(self, request):
        qs = Document.objects.filter(is_deleted=False)
        t = qs.aggregate(enc=Sum('encrypted_size'), orig=Sum('original_size'), comp=Sum('compressed_size'), n=Count('id'))
        return Response({
            'total_encrypted_bytes':  t['enc'] or 0,
            'total_original_bytes':   t['orig'] or 0,
            'total_compressed_bytes': t['comp'] or 0,
            'total_documents':        t['n'],
            'by_extension':           list(qs.values('file_extension').annotate(count=Count('id'), size=Sum('encrypted_size')).order_by('-count')[:10]),
            'by_status':              list(qs.values('status').annotate(count=Count('id'), size=Sum('encrypted_size')).order_by('-count')),
            'by_owner':               list(qs.values('owner_id', 'owner__email', 'owner__full_name')
                                         .annotate(count=Count('id'), size=Sum('encrypted_size')).order_by('-size')[:10]),
        })


class AdminSettingsView(APIView):
    """GET /api/admin-panel/settings/ — read-only, non-secret runtime configuration.
    Never returns keys, passwords, hosts or URLs: AI providers are reported by name only."""
    permission_classes = [IsAdminRole]

    def get(self, request):
        from django.conf import settings as s
        jwt = getattr(s, 'SIMPLE_JWT', {}) or {}
        def minutes(td):
            return int(td.total_seconds() // 60) if td is not None else None
        cloud = [name for name, key in (('Groq', 'GROQ_API_KEY'), ('Cohere', 'COHERE_API_KEY'),
                                         ('Gemini', 'GEMINI_API_KEY')) if getattr(s, key, None)]
        return Response({
            'storage': {
                'use_mock_storage':      bool(getattr(s, 'USE_MOCK_STORAGE', True)),
                'compression_level':     getattr(s, 'ZSTD_COMPRESSION_LEVEL', None),
                'chunk_size_bytes':      getattr(s, 'CHUNK_SIZE_BYTES', None),
                'max_upload_size_bytes': getattr(s, 'MAX_UPLOAD_SIZE_BYTES', None),
                'allowed_extensions':    list(getattr(s, 'ALLOWED_EXTENSIONS', []) or []),
            },
            'encryption': {
                'rsa_key_size': getattr(s, 'RSA_KEY_SIZE', None),
            },
            'ai': {
                'cloud_providers':   cloud,
                'local_model_configured': bool(getattr(s, 'OLLAMA_HOST', '')),
                'local_chat_model':  getattr(s, 'OLLAMA_CHAT_MODEL', None),
                'local_embed_model': getattr(s, 'OLLAMA_EMBED_MODEL', None),
                'vision_provider':   getattr(s, 'VISION_PROVIDER', None),
            },
            'tasks': {
                'run_in_process':        bool(getattr(s, 'CELERY_TASK_ALWAYS_EAGER', False)),
                'ai_background_in_eager': bool(getattr(s, 'AI_BACKGROUND_IN_EAGER', False)),
            },
            'auth': {
                'access_token_minutes':  minutes(jwt.get('ACCESS_TOKEN_LIFETIME')),
                'refresh_token_minutes': minutes(jwt.get('REFRESH_TOKEN_LIFETIME')),
            },
            'tenancy': {
                'signup_organization_mode': getattr(s, 'SIGNUP_ORGANIZATION_MODE', None),
            },
            'debug': bool(getattr(s, 'DEBUG', False)),
        })


# ── Phase 2: AI Monitoring ────────────────────────────────────

class AdminAIMonitorView(APIView):
    """GET /api/admin-panel/ai/monitor/  — Full AI health dashboard."""
    permission_classes = [IsAdminRole]

    def get(self, request):
        from apps.ai.models import (AIProcessingQueue, DocumentClassification,
            DocumentOCR, DocumentEmbedding, SearchAnalytics, SearchHistory)

        from django.db.models import Q
        pq = AIProcessingQueue.objects.aggregate(
            total=Count('id'),
            completed=Count('id', filter=Q(stage='completed')),
            failed=Count('id', filter=Q(stage='failed')),
            processing=Count('id', filter=Q(stage__in=ACTIVE_STAGES + ['summary'])),
            avg=Avg('duration_ms', filter=Q(stage='completed')),
        )
        oq = DocumentOCR.objects.aggregate(
            total=Count('id'),
            completed=Count('id', filter=Q(status='completed')),
            failed=Count('id', filter=Q(status='failed')),
            avg=Avg('confidence_score', filter=Q(status='completed')),
        )
        return Response({
            'pipeline': {
                'total':      pq['total'],
                'completed':  pq['completed'],
                'failed':     pq['failed'],
                'processing': pq['processing'],
                'avg_duration_ms': pq['avg'] or 0,
            },
            'ocr': {
                'total':      oq['total'],
                'completed':  oq['completed'],
                'failed':     oq['failed'],
                'avg_confidence': oq['avg'] or 0,
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
        from apps.ai.services.dispatch import dispatch
        from django.db.models import F
        # Bounded batch + retry accounting: repeated clicks can't queue the same jobs forever
        ids = list(AIProcessingQueue.objects.filter(stage='failed', retry_count__lt=3)
                   .order_by('updated_at').values_list('document_id', flat=True)[:50])
        AIProcessingQueue.objects.filter(document_id__in=ids).update(
            stage='queued', retry_count=F('retry_count') + 1, error_message='')
        for doc_id in ids:
            dispatch(run_ai_pipeline, str(doc_id), '')
        return Response({'message': f'Retriggered {len(ids)} failed jobs.'})


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


class AdminComplianceOverviewView(APIView):
    """GET /api/admin-panel/compliance/ — platform-wide compliance roll-up (read-only, admin only).
    Compliance data is stored per user; this only aggregates what already exists."""
    permission_classes = [IsAdminRole]

    def get(self, request):
        from datetime import timedelta
        from django.utils import timezone
        from apps.compliance.models import (
            ComplianceProfile, MissingDocument, ExpiryAlert, ComplianceRisk, AuditPackage,
        )
        today = timezone.now().date()

        profiles = ComplianceProfile.objects.all()
        p = profiles.aggregate(n=Count('id'), score=Avg('compliance_score'), ready=Avg('audit_readiness_pct'))
        lowest = list(
            profiles.filter(last_scored_at__isnull=False)
            .order_by('compliance_score')
            .values('owner_id', 'owner__email', 'owner__full_name', 'industry', 'compliance_score', 'audit_readiness_pct', 'last_scored_at')[:10]
        )

        missing = MissingDocument.objects.filter(is_resolved=False)
        alerts = ExpiryAlert.objects.filter(is_dismissed=False)
        risks = ComplianceRisk.objects.filter(is_resolved=False)

        return Response({
            'profiles': {
                'count': p['n'],
                'avg_score': round(p['score'], 1) if p['score'] is not None else None,
                'avg_readiness': round(p['ready'], 1) if p['ready'] is not None else None,
                'by_industry': list(profiles.values('industry').annotate(count=Count('id'), avg_score=Avg('compliance_score')).order_by('-count')),
            },
            'lowest_scores': lowest,
            'missing_documents': {
                'open': missing.count(),
                'by_priority': list(missing.values('priority').annotate(count=Count('id')).order_by('priority')),
                'users_affected': missing.values('owner_id').distinct().count(),
            },
            'expiry': {
                'expired': alerts.filter(expiry_date__lt=today).count(),
                'next_30_days': alerts.filter(expiry_date__gte=today, expiry_date__lte=today + timedelta(days=30)).count(),
                'next_90_days': alerts.filter(expiry_date__gte=today, expiry_date__lte=today + timedelta(days=90)).count(),
            },
            'risks': {
                'open': risks.count(),
                'by_severity': list(risks.values('severity').annotate(count=Count('id'))),
            },
            'audit_packages': list(AuditPackage.objects.values('status').annotate(count=Count('id'))),
        })
