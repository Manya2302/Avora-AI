import uuid
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager

class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)
        extra_fields.setdefault('role', User.Role.ADMIN)
        return self.create_user(email, password, **extra_fields)

class User(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        ADMIN      = 'admin', 'Admin'
        USER       = 'user', 'User'
        VIEWER     = 'viewer', 'Viewer'

    id            = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email         = models.EmailField(unique=True)
    full_name     = models.CharField(max_length=255)
    role          = models.CharField(max_length=20, choices=Role.choices, default=Role.USER)
    is_active     = models.BooleanField(default=True)
    is_staff      = models.BooleanField(default=False)
    is_email_verified = models.BooleanField(default=False)
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    USERNAME_FIELD  = 'email'
    REQUIRED_FIELDS = ['full_name']
    objects = UserManager()

    class Meta:
        db_table = 'users'
        ordering = ['-created_at']

    def __str__(self):
        return self.email

class UserProfile(models.Model):
    class Industry(models.TextChoices):
        LAW_FIRM    = 'law_firm', 'Law Firm'
        CA_FIRM     = 'ca_firm', 'CA / Accounting Firm'
        HEALTHCARE  = 'healthcare', 'Healthcare'
        CONSULTING  = 'consulting', 'Consulting'
        STARTUP     = 'startup', 'Startup'
        OTHER       = 'other', 'Other'

    user         = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    company_name = models.CharField(max_length=255, blank=True)
    industry     = models.CharField(max_length=30, choices=Industry.choices, blank=True)
    phone        = models.CharField(max_length=20, blank=True)
    city         = models.CharField(max_length=100, blank=True)
    state        = models.CharField(max_length=100, blank=True)
    address      = models.TextField(blank=True)
    job_title    = models.CharField(max_length=100, blank=True)
    bio          = models.TextField(blank=True)
    avatar_url   = models.URLField(blank=True)
    storage_used = models.BigIntegerField(default=0)  # bytes
    plan         = models.CharField(max_length=20, default='free')
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'user_profiles'

class PasswordResetOTP(models.Model):
    user       = models.ForeignKey(User, on_delete=models.CASCADE, related_name='otp_requests')
    otp_code   = models.CharField(max_length=6)
    is_used    = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        db_table = 'password_reset_otps'

class UserSession(models.Model):
    user           = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sessions')
    session_key    = models.CharField(max_length=255, unique=True)
    ip_address     = models.GenericIPAddressField()
    user_agent     = models.TextField(blank=True)
    device_name    = models.CharField(max_length=200, blank=True)
    location       = models.CharField(max_length=200, blank=True)
    is_active      = models.BooleanField(default=True)
    created_at     = models.DateTimeField(auto_now_add=True)
    last_active_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'user_sessions'
        ordering = ['-last_active_at']
