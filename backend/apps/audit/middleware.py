"""Auto-log every authenticated API request to the audit trail."""
import json
from .models import AuditLog

ACTION_MAP = {
    'POST':   {'documents': 'upload', 'auth/login': 'login', 'auth/logout': 'logout'},
    'GET':    {'documents': 'view', 'ai/search': 'search'},
    'DELETE': {'documents': 'delete'},
}

class AuditLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        try:
            if request.user.is_authenticated and request.path.startswith('/api/'):
                action = self._resolve_action(request)
                if action:
                    x_fwd = request.META.get('HTTP_X_FORWARDED_FOR')
                    ip    = x_fwd.split(',')[0] if x_fwd else request.META.get('REMOTE_ADDR')
                    AuditLog.objects.create(
                        user=request.user, action=action,
                        resource=request.path, ip_address=ip,
                        user_agent=request.META.get('HTTP_USER_AGENT', '')[:500],
                    )
        except Exception:
            pass
        return response

    def _resolve_action(self, request):
        path   = request.path
        method = request.method
        mapping = ACTION_MAP.get(method, {})
        for keyword, action in mapping.items():
            if keyword in path:
                return action
        return None
