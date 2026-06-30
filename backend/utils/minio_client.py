from django.conf import settings
from minio import Minio

_client = None

def get_client():
    global _client
    if _client is None:
        if getattr(settings, 'USE_MOCK_STORAGE', True):
            from utils.minio_mock import MockMinio
            _client = MockMinio()
        else:
            _client = Minio(
                settings.MINIO_ENDPOINT,
                access_key=settings.MINIO_ACCESS_KEY,
                secret_key=settings.MINIO_SECRET_KEY,
                secure=settings.MINIO_SECURE,
            )
    return _client
