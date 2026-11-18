from pathlib import Path
from datetime import timedelta
from decouple import config, Csv

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = config('SECRET_KEY', default='django-insecure-change-me-now')
ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost', cast=Csv())
# Only trust X-Forwarded-For behind a reverse proxy you control (see utils/net.py)
TRUST_X_FORWARDED_FOR = config('TRUST_X_FORWARDED_FOR', default=False, cast=bool)
NUM_PROXIES = config('NUM_PROXIES', default=1, cast=int)

DJANGO_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
]

THIRD_PARTY_APPS = [
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'django_filters',
    'django_celery_beat',
    'drf_yasg',
]

LOCAL_APPS = [
    'apps.users',
    'apps.documents',
    'apps.ai',
    'apps.audit',
    'apps.admin_panel',
    'apps.compliance',
    'apps.contracts',
    'apps.copilot',
    'apps.knowledge',
    'apps.organizations',
    'apps.integrations',
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'utils.middleware.SelectiveGZipMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'apps.audit.middleware.AuditLogMiddleware',
]

ROOT_URLCONF = 'securevault.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'securevault.wsgi.application'
AUTH_USER_MODEL = 'users.User'

# ── Database ──────────────────────────────────────────────────
import dj_database_url
DATABASES = {
    'default': dj_database_url.config(
        default=config('DATABASE_URL', default=f'sqlite:///{BASE_DIR / "db.sqlite3"}'),
        conn_max_age=config('DB_CONN_MAX_AGE', default=60, cast=int),   # reuse connections
        conn_health_checks=True,
    )
}
if DATABASES['default']['ENGINE'].endswith('sqlite3'):
    # Background AI threads + web requests write concurrently: wait for locks instead of
    # failing with "database is locked". WAL mode is enabled in utils/db.py.
    DATABASES['default']['CONN_MAX_AGE'] = 0
    DATABASES['default'].setdefault('OPTIONS', {})['timeout'] = 30

# ── Cache (rate limits, lockouts, ACLs, sessions, embeddings) ─
# Redis shares state across all web/worker processes; LocMem is per-process (dev only).
if config('USE_REDIS_CACHE', default=False, cast=bool):
    CACHES = {'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': config('CACHE_URL', default=config('REDIS_URL', default='redis://localhost:6379/1')),
        'TIMEOUT': 300,
        'KEY_PREFIX': 'avora',
    }}
else:
    CACHES = {'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'avora-default',
        'OPTIONS': {'MAX_ENTRIES': 50000},
    }}

AUTHENTICATION_BACKENDS = ['apps.users.authentication.CaseInsensitiveEmailBackend']

# ── Password Validators ───────────────────────────────────────
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 8}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Kolkata'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ── REST Framework ────────────────────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'apps.users.authentication.SessionAwareJWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_FILTER_BACKENDS': (
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '30/min',
        'user': '300/min',
        'login': '10/min',
        'register': '5/min',
        'token_refresh': '30/min',
        'password_reset': '5/min',
        'ai_heavy': '30/min',
    },
    'EXCEPTION_HANDLER': 'utils.exceptions.safe_exception_handler',
}
if not config('DEBUG', default=False, cast=bool):
    # The browsable API renderer is slow and leaks schema; JSON only outside dev
    REST_FRAMEWORK['DEFAULT_RENDERER_CLASSES'] = ('rest_framework.renderers.JSONRenderer',)

# ── JWT ───────────────────────────────────────────────────────
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=config('JWT_ACCESS_TOKEN_LIFETIME_MINUTES', default=60, cast=int)),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=config('JWT_REFRESH_TOKEN_LIFETIME_DAYS', default=7, cast=int)),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    'AUTH_HEADER_TYPES': ('Bearer',),
    'AUTH_TOKEN_CLASSES': ('rest_framework_simplejwt.tokens.AccessToken',),
}

# ── CORS ──────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = config('CORS_ALLOWED_ORIGINS', default='http://localhost:3000', cast=Csv())
CORS_ALLOW_CREDENTIALS = True

# ── Celery ────────────────────────────────────────────────────
CELERY_BROKER_URL = config('REDIS_URL', default='redis://localhost:6379/0')
CELERY_RESULT_BACKEND = config('REDIS_URL', default='redis://localhost:6379/0')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'Asia/Kolkata'
CELERY_TASK_ALWAYS_EAGER = config('CELERY_TASK_ALWAYS_EAGER', default=True, cast=bool)
CELERY_TASK_ACKS_LATE = True                 # a crashed worker re-delivers the task
CELERY_TASK_REJECT_ON_WORKER_LOST = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1        # long AI tasks: don't hoard work on one worker
CELERY_WORKER_MAX_TASKS_PER_CHILD = 200      # recycle workers to cap memory growth
CELERY_RESULT_EXPIRES = 3600
CELERY_TASK_SOFT_TIME_LIMIT = 60 * 60
CELERY_TASK_TIME_LIMIT = 65 * 60
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True

# ── MinIO ─────────────────────────────────────────────────────
MINIO_ENDPOINT = config('MINIO_ENDPOINT', default='localhost:9000')
MINIO_ACCESS_KEY = config('MINIO_ACCESS_KEY', default='minioadmin')
MINIO_SECRET_KEY = config('MINIO_SECRET_KEY', default='minioadmin123')
MINIO_SECURE = config('MINIO_SECURE', default=False, cast=bool)
MINIO_BUCKET_NAME = config('MINIO_BUCKET_NAME', default='securevault-documents')
USE_MOCK_STORAGE = config('USE_MOCK_STORAGE', default=True, cast=bool)

# ── Qdrant ────────────────────────────────────────────────────
QDRANT_HOST = config('QDRANT_HOST', default='localhost')
QDRANT_PORT = config('QDRANT_PORT', default=6333, cast=int)
QDRANT_COLLECTION = config('QDRANT_COLLECTION', default='securevault_documents')
QDRANT_VECTOR_SIZE = 1024  # Cohere embed-english-v3.0 size
QDRANT_URL = config('QDRANT_URL', default=None)
QDRANT_API_KEY = config('QDRANT_API_KEY', default=None)

# ── Ollama (Orivo AI) ─────────────────────────────────────────
OLLAMA_HOST = config('OLLAMA_HOST', default='http://localhost:11434')
OLLAMA_EMBED_MODEL = config('OLLAMA_EMBED_MODEL', default='nomic-embed-text')
OLLAMA_CHAT_MODEL = config('OLLAMA_CHAT_MODEL', default='llama3.2:1b')

# ── API Keys ──────────────────────────────────────────────────
GROQ_API_KEY = config('GROQ_API_KEY', default=None)
GEMINI_API_KEY = config('GEMINI_API_KEY', default=None)
COHERE_API_KEY = config('COHERE_API_KEY', default=None)

# ── AI ingestion & retrieval tuning ───────────────────────────
# Figure understanding (charts/graphs/images): auto | gemini | ollama | none
#   gemini sends figure images to Google; use "ollama" (VISION_OLLAMA_MODEL) to stay on-prem.
VISION_PROVIDER = config('VISION_PROVIDER', default='auto')
# Run the AI pipeline on an in-process background pool when CELERY_TASK_ALWAYS_EAGER=True,
# so uploads return immediately instead of blocking the HTTP request.
AI_BACKGROUND_IN_EAGER = config('AI_BACKGROUND_IN_EAGER', default=True, cast=bool)
# Above this many accessible documents the vector ACL falls back to owner-only filtering.
QDRANT_ACL_MAX_IDS = config('QDRANT_ACL_MAX_IDS', default=20000, cast=int)
# Tenancy: 'default' = everyone joins one shared organization (single company);
# 'isolated' = each signup gets its own organization (multi-tenant SaaS).
SIGNUP_ORGANIZATION_MODE = config('SIGNUP_ORGANIZATION_MODE', default='default')
# Other knobs read from the environment: AI_EXTRACT_WORKERS, OCR_ENGINE, OCR_DPI, FIGURE_OCR,
# EMBED_CONCURRENCY, VISION_CONCURRENCY, VISION_MAX_FIGURES, GEMINI_VISION_MODEL,
# VISION_OLLAMA_MODEL, AI_INPROCESS_WORKERS

# ── Encryption Config ─────────────────────────────────────────
RSA_KEY_SIZE = config('RSA_KEY_SIZE', default=4096, cast=int)
CHUNK_SIZE_BYTES = config('CHUNK_SIZE_MB', default=10, cast=int) * 1024 * 1024
ZSTD_COMPRESSION_LEVEL = config('ZSTD_COMPRESSION_LEVEL', default=9, cast=int)
MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024 * 1024  # 5 GB

# ── Allowed File Types ────────────────────────────────────────
ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.png', '.jpg', '.jpeg', '.txt']
