import random
import string
from datetime import timedelta
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework import status, generics, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from .models import PasswordResetOTP, UserSession, UserProfile
from .serializers import (
    RegisterSerializer, CustomTokenObtainPairSerializer, UserSerializer,
    UserProfileSerializer, ChangePasswordSerializer, ForgotPasswordSerializer,
    VerifyOTPSerializer, ResetPasswordSerializer, UserSessionSerializer,
)

User = get_user_model()

class RegisterView(generics.CreateAPIView):
    """POST /api/auth/register/"""
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        return Response({
            'message': 'Account created successfully.',
            'user': UserSerializer(user).data,
            'tokens': {'refresh': str(refresh), 'access': str(refresh.access_token)},
        }, status=status.HTTP_201_CREATED)

class LoginView(TokenObtainPairView):
    """POST /api/auth/login/"""
    serializer_class = CustomTokenObtainPairSerializer
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            user = User.objects.get(email=request.data['email'])
            UserSession.objects.create(
                user=user,
                session_key=response.data.get('access', '')[:255],
                ip_address=self._get_ip(request),
                user_agent=request.META.get('HTTP_USER_AGENT', '')[:500],
            )
        return response

    def _get_ip(self, request):
        x_forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
        return x_forwarded.split(',')[0] if x_forwarded else request.META.get('REMOTE_ADDR', '0.0.0.0')

class ForgotPasswordView(APIView):
    """POST /api/auth/forgot-password/"""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']
        try:
            user = User.objects.get(email=email)
            otp = ''.join(random.choices(string.digits, k=6))
            PasswordResetOTP.objects.create(
                user=user, otp_code=otp,
                expires_at=timezone.now() + timedelta(minutes=10)
            )
            # TODO: send via email (console for dev)
            print(f"[DEV OTP] {email}: {otp}")
        except User.DoesNotExist:
            pass  # Silent — don't reveal email existence
        return Response({'message': 'If this email exists, an OTP has been sent.'})

class VerifyOTPView(APIView):
    """POST /api/auth/verify-otp/"""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        s = VerifyOTPSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            user = User.objects.get(email=s.validated_data['email'])
            otp  = PasswordResetOTP.objects.filter(
                user=user, otp_code=s.validated_data['otp_code'],
                is_used=False, expires_at__gt=timezone.now()
            ).latest('created_at')
            return Response({'message': 'OTP verified.', 'valid': True})
        except (User.DoesNotExist, PasswordResetOTP.DoesNotExist):
            return Response({'message': 'Invalid or expired OTP.', 'valid': False},
                            status=status.HTTP_400_BAD_REQUEST)

class ResetPasswordView(APIView):
    """POST /api/auth/reset-password/"""
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        s = ResetPasswordSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            user = User.objects.get(email=s.validated_data['email'])
            otp  = PasswordResetOTP.objects.filter(
                user=user, otp_code=s.validated_data['otp_code'],
                is_used=False, expires_at__gt=timezone.now()
            ).latest('created_at')
            user.set_password(s.validated_data['new_password'])
            user.save()
            otp.is_used = True
            otp.save()
            UserSession.objects.filter(user=user).update(is_active=False)
            return Response({'message': 'Password reset successful.'})
        except (User.DoesNotExist, PasswordResetOTP.DoesNotExist):
            return Response({'message': 'Invalid or expired OTP.'},
                            status=status.HTTP_400_BAD_REQUEST)

class MeView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/users/me/"""
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user

class ChangePasswordView(APIView):
    """POST /api/users/change-password/"""

    def post(self, request):
        s = ChangePasswordSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        if not request.user.check_password(s.validated_data['current_password']):
            return Response({'current_password': 'Incorrect password.'},
                            status=status.HTTP_400_BAD_REQUEST)
        request.user.set_password(s.validated_data['new_password'])
        request.user.save()
        UserSession.objects.filter(user=request.user).exclude(
            session_key=request.auth.token if request.auth else ''
        ).update(is_active=False)
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
        return UserSession.objects.filter(user=self.request.user, is_active=True)

class RevokeSessionView(APIView):
    """DELETE /api/users/sessions/<pk>/"""

    def delete(self, request, pk):
        try:
            session = UserSession.objects.get(pk=pk, user=request.user)
            session.is_active = False
            session.save()
            return Response({'message': 'Session revoked.'})
        except UserSession.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

class RevokeAllSessionsView(APIView):
    """DELETE /api/users/sessions/revoke-all/"""

    def delete(self, request):
        UserSession.objects.filter(user=request.user).update(is_active=False)
        return Response({'message': 'All sessions revoked.'})
