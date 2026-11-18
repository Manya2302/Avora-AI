from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework import status, generics, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView, TokenBlacklistView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from utils.net import get_client_ip
from . import security
from .models import PasswordResetOTP, UserSession, UserProfile
from .serializers import (
    RegisterSerializer, CustomTokenObtainPairSerializer, UserSerializer,
    UserProfileSerializer, ChangePasswordSerializer, ForgotPasswordSerializer,
    VerifyOTPSerializer, ResetPasswordSerializer, UserSessionSerializer,
    SessionAwareTokenRefreshSerializer,
)

User = get_user_model()

class RegisterView(generics.CreateAPIView):
    """POST /api/auth/register/"""
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'register'
    throttle_classes = [ScopedRateThrottle]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            user = serializer.save()
            refresh = CustomTokenObtainPairSerializer.get_token(user)
            session = UserSession.objects.create(
                user=user, session_key=str(refresh['jti']), ip_address=get_client_ip(request),
                user_agent=request.META.get('HTTP_USER_AGENT', '')[:500])
            refresh['sid'] = session.id
        return Response({
            'message': 'Account created successfully.',
            'user': UserSerializer(user).data,
            'tokens': {'refresh': str(refresh), 'access': str(refresh.access_token)},
        }, status=status.HTTP_201_CREATED)

class LoginView(TokenObtainPairView):
    """POST /api/auth/login/  — lockout-protected, issues session-bound tokens."""
    serializer_class = CustomTokenObtainPairSerializer
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'login'
    throttle_classes = [ScopedRateThrottle]


class SessionTokenRefreshView(TokenRefreshView):
    """POST /api/auth/token/refresh/ — refused after the session is revoked."""
    serializer_class = SessionAwareTokenRefreshSerializer
    throttle_scope = 'token_refresh'
    throttle_classes = [ScopedRateThrottle]


class LogoutView(TokenBlacklistView):
    """POST /api/auth/logout/ {refresh} — blacklists the refresh token AND ends the session,
    so the still-unexpired access token stops working too."""
    def post(self, request, *args, **kwargs):
        sid = None
        try:
            sid = RefreshToken(request.data.get('refresh', '')).get('sid')
        except TokenError:
            pass
        response = super().post(request, *args, **kwargs)
        if sid is not None:
            security.revoke_sessions(UserSession.objects.filter(id=sid))
        return response


class ForgotPasswordView(APIView):
    """POST /api/auth/forgot-password/"""
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'password_reset'
    throttle_classes = [ScopedRateThrottle]

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']
        generic = Response({'message': 'If this email exists, an OTP has been sent.'})
        if not security.otp_request_allowed(email):
            return generic  # silent: don't reveal throttling per address
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user is None:
            return generic  # don't reveal email existence
        code = security.generate_otp()
        PasswordResetOTP.objects.filter(user=user, is_used=False).update(is_used=True)  # one live code
        PasswordResetOTP.objects.create(
            user=user, otp_code=security.hash_otp(user.id, code),
            expires_at=timezone.now() + timedelta(minutes=security.OTP_TTL_MINUTES))
        security.clear_otp_failures(user.id)
        security.send_otp_email(user.email, code)
        return generic


class VerifyOTPView(APIView):
    """POST /api/auth/verify-otp/"""
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'password_reset'
    throttle_classes = [ScopedRateThrottle]

    def post(self, request):
        s = VerifyOTPSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = User.objects.filter(email__iexact=s.validated_data['email']).first()
        if user and security.find_valid_otp(user, s.validated_data['otp_code']):
            return Response({'message': 'OTP verified.', 'valid': True})
        return Response({'message': 'Invalid or expired OTP.', 'valid': False},
                        status=status.HTTP_400_BAD_REQUEST)


class ResetPasswordView(APIView):
    """POST /api/auth/reset-password/"""
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'password_reset'
    throttle_classes = [ScopedRateThrottle]

    def post(self, request):
        s = ResetPasswordSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = User.objects.filter(email__iexact=s.validated_data['email']).first()
        otp = security.find_valid_otp(user, s.validated_data['otp_code']) if user else None
        if otp is None:
            return Response({'message': 'Invalid or expired OTP.'}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            user.set_password(s.validated_data['new_password'])
            user.save(update_fields=['password', 'updated_at'])
            PasswordResetOTP.objects.filter(user=user, is_used=False).update(is_used=True)
        security.clear_otp_failures(user.id)
        security.clear_login_failures(user.email)
        security.revoke_sessions(UserSession.objects.filter(user=user))  # sign out everywhere
        return Response({'message': 'Password reset successful.'})

class MeView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/users/me/"""
    serializer_class = UserSerializer

    def get_object(self):
        return User.objects.select_related('profile').get(pk=self.request.user.pk)

class ChangePasswordView(APIView):
    """POST /api/users/change-password/"""

    def post(self, request):
        s = ChangePasswordSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        if not request.user.check_password(s.validated_data['current_password']):
            return Response({'current_password': 'Incorrect password.'},
                            status=status.HTTP_400_BAD_REQUEST)
        request.user.set_password(s.validated_data['new_password'])
        request.user.save(update_fields=['password', 'updated_at'])
        current_sid = request.auth.get('sid') if request.auth is not None else None
        security.revoke_sessions(UserSession.objects.filter(user=request.user).exclude(id=current_sid))
        return Response({'message': 'Password updated. Other sessions revoked.'})

class ProfileView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/users/profile/"""
    serializer_class = UserProfileSerializer

    def get_object(self):
        profile, _ = UserProfile.objects.get_or_create(user=self.request.user)
        return profile

class SessionListView(generics.ListAPIView):
    """GET /api/users/sessions/"""
    serializer_class = UserSessionSerializer

    def get_queryset(self):
        return UserSession.objects.filter(user=self.request.user, is_active=True).order_by('-last_active_at')

class RevokeSessionView(APIView):
    """DELETE /api/users/sessions/<pk>/"""

    def delete(self, request, pk):
        try:
            UserSession.objects.get(pk=pk, user=request.user)
        except UserSession.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        security.revoke_sessions(UserSession.objects.filter(pk=pk, user=request.user))
        return Response({'message': 'Session revoked.'})

class RevokeAllSessionsView(APIView):
    """DELETE /api/users/sessions/revoke-all/  (?keep_current=1 keeps the caller's own session)"""

    def delete(self, request):
        qs = UserSession.objects.filter(user=request.user)
        keep_current = str(request.query_params.get('keep_current', '')).lower() in ('1', 'true', 'yes')
        current_sid = request.auth.get('sid') if request.auth is not None else None
        if keep_current and current_sid is not None:
            qs = qs.exclude(id=current_sid)
        revoked = security.revoke_sessions(qs)
        return Response({'message': 'Sessions revoked.', 'revoked': revoked})


class AccountSummaryView(APIView):
    """GET /api/users/me/summary/ — real account figures for the profile page."""

    def get(self, request):
        from django.db.models import Count, Q, Sum
        from apps.documents.models import Document
        agg = Document.objects.filter(owner=request.user, is_deleted=False).aggregate(
            total=Count('id'),
            encrypted=Count('id', filter=Q(status__in=[Document.Status.ENCRYPTED, Document.Status.AI_READY])),
            storage=Sum('original_size'),
        )
        current_sid = request.auth.get('sid') if request.auth is not None else None
        # Most recent sign-in other than the one in use right now (falls back to the current one).
        sessions = UserSession.objects.filter(user=request.user).order_by('-created_at')
        last = sessions.exclude(id=current_sid).first() if current_sid is not None else None
        last = last or sessions.first()
        return Response({
            'document_count':  agg['total'] or 0,
            'encrypted_count': agg['encrypted'] or 0,
            'storage_bytes':   agg['storage'] or 0,
            'member_since':    request.user.created_at,
            'last_sign_in': None if last is None else {
                'at': last.created_at,
                'ip_address': last.ip_address,
                'location': last.location,
                'user_agent': last.user_agent,
                'is_current': last.id == current_sid,
            },
        })


class PreferencesView(APIView):
    """GET/PATCH /api/users/me/preferences/ — saved settings, merged with defaults."""

    def _profile(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        return profile

    def get(self, request):
        from .serializers import resolve_preferences
        return Response(resolve_preferences(self._profile(request).preferences))

    def patch(self, request):
        from .serializers import PreferencesSerializer, resolve_preferences
        s = PreferencesSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            profile = UserProfile.objects.select_for_update().get(pk=self._profile(request).pk)
            merged = resolve_preferences(profile.preferences)
            merged.update(s.validated_data)
            profile.preferences = merged
            profile.save(update_fields=['preferences'])
        return Response(merged)
