import csv
from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework import generics, filters
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from .models import AuditLog
from .serializers import AuditLogSerializer

class AuditLogListView(generics.ListAPIView):
    """GET /api/audit/logs/  — user's own audit trail."""
    serializer_class = AuditLogSerializer
    filter_backends  = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['action', 'is_flagged']
    ordering_fields  = ['created_at']

    def get_queryset(self):
        return AuditLog.objects.filter(user=self.request.user)


class _Echo:
    def write(self, value):
        return value


def _csv_safe(value):
    """Neutralise spreadsheet formula injection (=, +, -, @, tab, CR at the start of a cell)."""
    s = '' if value is None else str(value)
    return "'" + s if s[:1] in ('=', '+', '-', '@', '\t', '\r') else s


class AuditLogExportView(APIView):
    """GET /api/audit/logs/export/?action=<action> — the same scoped trail as a CSV download."""

    def get(self, request):
        qs = AuditLog.objects.filter(user=request.user).select_related('user').order_by('-created_at')
        action = request.query_params.get('action')
        if action:
            qs = qs.filter(action=action)
        flagged = request.query_params.get('is_flagged')
        if flagged in ('true', 'false'):
            qs = qs.filter(is_flagged=(flagged == 'true'))

        writer = csv.writer(_Echo())

        def rows():
            yield writer.writerow(['created_at', 'user_name', 'user_email', 'action', 'resource',
                                   'document_id', 'ip_address', 'is_flagged'])
            for log in qs.iterator(chunk_size=1000):
                u = log.user
                yield writer.writerow([_csv_safe(v) for v in (
                    log.created_at.isoformat(),
                    getattr(u, 'full_name', '') if u else '',
                    getattr(u, 'email', '') if u else '',
                    log.action, log.resource, log.document_id, log.ip_address or '',
                    'yes' if log.is_flagged else 'no',
                )])

        stamp = timezone.now().strftime('%Y%m%d-%H%M%S')
        resp = StreamingHttpResponse(rows(), content_type='text/csv; charset=utf-8')
        resp['Content-Disposition'] = f'attachment; filename="audit-log-{action if action in AuditLog.Action.values else "all"}-{stamp}.csv"'
        return resp
