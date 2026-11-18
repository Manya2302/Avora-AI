from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import (TokenObtainPairSerializer, TokenObtainSerializer,
                                                  TokenRefreshSerializer)
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework.exceptions import AuthenticationFailed
from utils.net import get_client_ip
from . import security
from .models import UserProfile, PasswordResetOTP, UserSession

User = get_user_model()

class RegisterSerializer(serializers.ModelSerializer):
    password         = serializers.CharField(write_only=True, validators=[validate_password])
    confirm_password = serializers.CharField(write_only=True)
    company_name     = serializers.CharField(required=False, allow_blank=True)
    industry         = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ['email', 'full_name', 'password', 'confirm_password', 'company_name', 'industry']

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return value

    def validate(self, attrs):
        if attrs['password'] != attrs.pop('confirm_password'):
            raise serializers.ValidationError({'password': 'Passwords do not match.'})
        return attrs

    def create(self, validated_data):
        company_name = validated_data.pop('company_name', '')
        industry     = validated_data.pop('industry', '')
        user = User.objects.create_user(**validated_data)
        UserProfile.objects.create(user=user, company_name=company_name, industry=industry)
        from apps.organizations.tenancy import ensure_membership
        ensure_membership(user, company_name=company_name)   # tenant per SIGNUP_ORGANIZATION_MODE
        return user

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['email']     = user.email
        token['full_name'] = user.full_name
        token['role']      = user.role
        return token

    def validate(self, attrs):
        """Authenticate with brute-force lockout, then issue tokens bound to a new UserSession."""
        from .models import UserSession
        request = self.context.get('request')
        email = attrs.get(self.username_field, '')
        ip = get_client_ip(request)
        security.check_login_allowed(email, ip)
        try:
            TokenObtainSerializer.validate(self, attrs)   # authenticates → self.user
        except AuthenticationFailed:
            security.register_login_failure(
                email, ip, (request.META.get('HTTP_USER_AGENT', '') if request else ''))
            raise
        security.clear_login_failures(email)

        refresh = self.get_token(self.user)
        user_agent = (request.META.get('HTTP_USER_AGENT', '') if request else '')[:500]
        profile = UserProfile.objects.filter(user=self.user).only('preferences').first()
        if (profile and resolve_preferences(profile.preferences)['login_notif']
                and not UserSession.objects.filter(user=self.user, ip_address=ip, user_agent=user_agent).exists()):
            security.send_new_signin_email(self.user.email, ip, user_agent)
        session = UserSession.objects.create(
            user=self.user, session_key=str(refresh['jti']), ip_address=ip,
            user_agent=user_agent)
        refresh['sid'] = session.id
        from django.conf import settings
        if settings.SIMPLE_JWT.get('UPDATE_LAST_LOGIN'):
            from django.contrib.auth.models import update_last_login
            update_last_login(None, self.user)
        return {'refresh': str(refresh), 'access': str(refresh.access_token)}


class SessionAwareTokenRefreshSerializer(TokenRefreshSerializer):
    """Refresh is refused once the login session was revoked (logout / revoke / password change)."""

    def validate(self, attrs):
        token = RefreshToken(attrs['refresh'])  # raises TokenError → 401 if invalid/expired/blacklisted
        sid, uid = token.get('sid'), token.get('user_id')
        if sid is not None and not security.session_is_active(sid, uid):
            raise InvalidToken('This session has been signed out.')
        return super().validate(attrs)

class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model  = UserProfile
        fields = '__all__'
        # plan / storage are billing-controlled — never user-writable
        # preferences are written only through /users/me/preferences/ (validated keys)
        read_only_fields = ['user', 'storage_used', 'plan', 'created_at', 'preferences']


# Every user preference with its default. Only these keys are stored; values must be booleans.
PREFERENCE_DEFAULTS = {
    'login_notif':     False,   # email on sign-in from a new device / IP (enforced at login)
    'upload_complete': True,    # email when a document finishes processing
    'audit_digest':    False,   # weekly activity summary email
}


def resolve_preferences(stored) -> dict:
    stored = stored if isinstance(stored, dict) else {}
    return {k: bool(stored.get(k, d)) for k, d in PREFERENCE_DEFAULTS.items()}


class PreferencesSerializer(serializers.Serializer):
    """Partial update: any subset of PREFERENCE_DEFAULTS keys, boolean values; unknown keys rejected."""

    def to_internal_value(self, data):
        if not isinstance(data, dict):
            raise serializers.ValidationError({'non_field_errors': 'Expected an object.'})
        unknown = sorted(set(data) - set(PREFERENCE_DEFAULTS))
        if unknown:
            raise serializers.ValidationError({k: 'Unknown setting.' for k in unknown})
        bad = [k for k, v in data.items() if not isinstance(v, bool)]
        if bad:
            raise serializers.ValidationError({k: 'Must be true or false.' for k in bad})
        return dict(data)

class UserSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(read_only=True)

    class Meta:
        model  = User
        fields = ['id', 'email', 'full_name', 'role', 'is_active',
                  'is_email_verified', 'created_at', 'profile']
        read_only_fields = ['id', 'email', 'role', 'is_active', 'is_email_verified', 'created_at']

class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(required=True)
    new_password     = serializers.CharField(required=True, validators=[validate_password])
    confirm_password = serializers.CharField(required=True)

    def validate(self, attrs):
        if attrs['new_password'] != attrs['confirm_password']:
            raise serializers.ValidationError({'new_password': 'Passwords do not match.'})
        return attrs

class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()

class VerifyOTPSerializer(serializers.Serializer):
    email    = serializers.EmailField()
    otp_code = serializers.RegexField(r'^\d{6}$')

class ResetPasswordSerializer(serializers.Serializer):
    email            = serializers.EmailField()
    otp_code         = serializers.RegexField(r'^\d{6}$')
    new_password     = serializers.CharField(validators=[validate_password])
    confirm_password = serializers.CharField()

    def validate(self, attrs):
        if attrs['new_password'] != attrs['confirm_password']:
            raise serializers.ValidationError({'new_password': 'Passwords do not match.'})
        return attrs

class UserSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model  = UserSession
        # session_key is an internal identifier — not exposed
        fields = ['id', 'ip_address', 'user_agent', 'device_name', 'location', 'is_active',
                  'created_at', 'last_active_at', 'is_current']
        read_only_fields = fields

    is_current = serializers.SerializerMethodField()

    def get_is_current(self, obj):
        request = self.context.get('request')
        auth = getattr(request, 'auth', None) if request else None
        return bool(auth is not None and auth.get('sid') == obj.id)
