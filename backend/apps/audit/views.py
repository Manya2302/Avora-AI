from rest_framework import generics, filters
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
