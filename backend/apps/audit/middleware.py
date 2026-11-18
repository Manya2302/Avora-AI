"""Auto-log meaningful authenticated API actions to the audit trail."""
import re

from utils.net import get_client_ip
from .models import AuditLog

_UUID = r"[0-9a-fA-F-]{36}"
# (method, regex on path, action). Only real user actions are audited — list pages and
# status polling used to create one DB row per poll, bloating the table and adding a
# write to every read request.
RULES = [
    ("POST",   re.compile(r"^/api/documents/upload/initiate/?$"), "upload"),
    ("GET",    re.compile(rf"^/api/documents/{_UUID}/download/?$"), "download"),
    ("GET",    re.compile(rf"^/api/documents/{_UUID}/?$"), "view"),
    # DELETE /api/documents/<id>/ is logged explicitly by DocumentViewSet.destroy
    ("POST",   re.compile(r"^/api/ai/search/?$"), "search"),
    ("POST",   re.compile(r"^/api/auth/logout/?$"), "logout"),
    ("POST",   re.compile(r"^/api/users/change-password/?$"), "settings"),
    ("DELETE", re.compile(r"^/api/users/sessions/"), "settings"),
    ("POST",   re.compile(rf"^/api/org/visibility/{_UUID}/?$"), "share"),
    ("PUT",    re.compile(rf"^/api/org/visibility/{_UUID}/?$"), "share"),
    ("PATCH",  re.compile(rf"^/api/org/visibility/{_UUID}/?$"), "share"),
]


class AuditLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        try:
            if response.status_code < 400 and request.path.startswith("/api/"):
                user = getattr(request, "user", None)
                if user is not None and user.is_authenticated:
                    action = self._resolve_action(request)
                    if action:
                        m = re.search(_UUID, request.path)
                        AuditLog.objects.create(
                            user=user, action=action, resource=request.path[:500],
                            document_id=m.group(0) if m and "/documents/" in request.path else "",
                            ip_address=get_client_ip(request),
                            user_agent=request.META.get("HTTP_USER_AGENT", "")[:500],
                        )
        except Exception:
            pass  # auditing must never break the request
        return response

    @staticmethod
    def _resolve_action(request):
        for method, rx, action in RULES:
            if request.method == method and rx.match(request.path):
                return action
        return None
