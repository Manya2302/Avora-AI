"""Authentication classes/backends for Avora."""
from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication

from .security import session_is_active


class SessionAwareJWTAuthentication(JWTAuthentication):
    """JWT auth that also rejects tokens whose login session was revoked.
    Tokens issued before session binding (no `sid` claim) keep working until expiry."""

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        sid = validated_token.get("sid")
        if sid is not None and not session_is_active(sid, user.id):
            raise AuthenticationFailed("This session has been signed out.", code="session_revoked")
        return user


class CaseInsensitiveEmailBackend(ModelBackend):
    """`Alice@Corp.com` and `alice@corp.com` are the same account.
    Runs the password hasher even for unknown emails to keep timing uniform."""

    def authenticate(self, request, username=None, password=None, email=None, **kwargs):
        User = get_user_model()
        login = (email or username or kwargs.get(User.USERNAME_FIELD) or "").strip()
        if not login or password is None:
            return None
        user = User.objects.filter(email__iexact=login).order_by("-is_active", "created_at").first()
        if user is None:
            User().set_password(password)  # equalise timing
            return None
        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
