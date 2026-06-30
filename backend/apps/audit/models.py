import uuid
from django.db import models
from django.contrib.auth import get_user_model
User = get_user_model()

class AuditLog(models.Model):
    class Action(models.TextChoices):
        LOGIN    = 'login',    'Login'
        LOGOUT   = 'logout',   'Logout'
        UPLOAD   = 'upload',   'Upload'
        DOWNLOAD = 'download', 'Download'
        DELETE   = 'delete',   'Delete'
        VIEW     = 'view',     'View'
        SEARCH   = 'search',   'Search'
        SHARE    = 'share',    'Share'
        SETTINGS = 'settings', 'Settings'

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user        = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    action      = models.CharField(max_length=20, choices=Action.choices)
    document_id = models.CharField(max_length=100, blank=True)
    resource    = models.CharField(max_length=500, blank=True)
    ip_address  = models.GenericIPAddressField(null=True, blank=True)
    user_agent  = models.TextField(blank=True)
    extra_data  = models.JSONField(default=dict)
    is_flagged  = models.BooleanField(default=False)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-created_at']
        indexes  = [
            models.Index(fields=['user', '-created_at']),
            models.Index(fields=['action']),
            models.Index(fields=['is_flagged']),
        ]

    @classmethod
    def log(cls, request, action, document_id='', resource='', extra_data=None, is_flagged=False):
        x_fwd = request.META.get('HTTP_X_FORWARDED_FOR')
        ip    = x_fwd.split(',')[0] if x_fwd else request.META.get('REMOTE_ADDR')
        cls.objects.create(
            user=request.user if request.user.is_authenticated else None,
            action=action,
            document_id=document_id,
            resource=resource,
            ip_address=ip,
            user_agent=request.META.get('HTTP_USER_AGENT', '')[:500],
            extra_data=extra_data or {},
            is_flagged=is_flagged,
        )
