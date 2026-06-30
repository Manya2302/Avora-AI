from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
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

    def validate(self, attrs):
        if attrs['password'] != attrs.pop('confirm_password'):
            raise serializers.ValidationError({'password': 'Passwords do not match.'})
        return attrs

    def create(self, validated_data):
        company_name = validated_data.pop('company_name', '')
        industry     = validated_data.pop('industry', '')
        user = User.objects.create_user(**validated_data)
        UserProfile.objects.create(user=user, company_name=company_name, industry=industry)
        return user

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['email']     = user.email
        token['full_name'] = user.full_name
        token['role']      = user.role
        return token

class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model  = UserProfile
        fields = '__all__'
        read_only_fields = ['user', 'storage_used', 'created_at']

class UserSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(read_only=True)

    class Meta:
        model  = User
        fields = ['id', 'email', 'full_name', 'role', 'is_active',
                  'is_email_verified', 'created_at', 'profile']
        read_only_fields = ['id', 'email', 'role', 'created_at']

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
    otp_code = serializers.CharField(max_length=6, min_length=6)

class ResetPasswordSerializer(serializers.Serializer):
    email            = serializers.EmailField()
    otp_code         = serializers.CharField(max_length=6)
    new_password     = serializers.CharField(validators=[validate_password])
    confirm_password = serializers.CharField()

    def validate(self, attrs):
        if attrs['new_password'] != attrs['confirm_password']:
            raise serializers.ValidationError({'new_password': 'Passwords do not match.'})
        return attrs

class UserSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model  = UserSession
        fields = '__all__'
        read_only_fields = ['user', 'session_key', 'created_at', 'last_active_at']
