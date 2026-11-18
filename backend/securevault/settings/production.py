from .base import *  # noqa: F401,F403
from django.core.exceptions import ImproperlyConfigured

DEBUG = False

# ── Refuse to boot with unsafe secrets ────────────────────────
# SECRET_KEY signs JWTs and OAuth state and derives the integration-credential keys:
# a default/short key in production means forgeable tokens and decryptable secrets.
if SECRET_KEY.startswith('django-insecure') or len(SECRET_KEY) < 50:
    raise ImproperlyConfigured("Set a strong SECRET_KEY (>= 50 random chars) for production.")
if not ALLOWED_HOSTS or '*' in ALLOWED_HOSTS:
    raise ImproperlyConfigured("Set ALLOWED_HOSTS explicitly for production (no '*').")

# ── Transport security ────────────────────────────────────────
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')   # behind nginx / LB terminating TLS
SECURE_SSL_REDIRECT = config('SECURE_SSL_REDIRECT', default=True, cast=bool)
SECURE_REDIRECT_EXEMPT = [r'^api/health/?$']
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'
SECURE_CROSS_ORIGIN_OPENER_POLICY = 'same-origin'
X_FRAME_OPTIONS = 'DENY'
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_SECURE = True
CSRF_TRUSTED_ORIGINS = config('CSRF_TRUSTED_ORIGINS', default='', cast=Csv())
DATA_UPLOAD_MAX_MEMORY_SIZE = 12 * 1024 * 1024          # 10 MB chunks + multipart overhead
FILE_UPLOAD_MAX_MEMORY_SIZE = 12 * 1024 * 1024

# ── Background processing: a real Celery worker in production ─
CELERY_TASK_ALWAYS_EAGER = config('CELERY_TASK_ALWAYS_EAGER', default=False, cast=bool)

# ── Email ─────────────────────────────────────────────────────
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = config('EMAIL_HOST', default='smtp.gmail.com')
EMAIL_PORT = config('EMAIL_PORT', default=587, cast=int)
EMAIL_USE_TLS = True
EMAIL_HOST_USER = config('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default='')
DEFAULT_FROM_EMAIL = config('DEFAULT_FROM_EMAIL', default=EMAIL_HOST_USER or 'no-reply@localhost')

# ── Logging: structured to stdout, errors never swallowed ─────
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {'std': {'format': '%(asctime)s %(levelname)s %(name)s %(message)s'}},
    'handlers': {'console': {'class': 'logging.StreamHandler', 'formatter': 'std'}},
    'root': {'handlers': ['console'], 'level': config('LOG_LEVEL', default='INFO')},
    'loggers': {
        'django.request': {'handlers': ['console'], 'level': 'WARNING', 'propagate': False},
        'django.security': {'handlers': ['console'], 'level': 'WARNING', 'propagate': False},
    },
}
