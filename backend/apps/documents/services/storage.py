"""
SecureVault AI — MinIO Storage Service
Layer 6: Metadata Isolation — files stored as UUID keys, never real filenames.
"""
import uuid
from io import BytesIO
from django.conf import settings
from minio import Minio
from minio.error import S3Error


def get_minio_client():
    from django.conf import settings
    if getattr(settings, 'USE_MOCK_STORAGE', True):
        from utils.minio_mock import MockMinio
        return MockMinio()
    from minio import Minio
    return Minio(
        settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_SECURE,
    )


def ensure_bucket_exists(bucket_name: str = None):
    client = get_minio_client()
    bucket = bucket_name or settings.MINIO_BUCKET_NAME
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)
    return bucket


def generate_storage_key(extension: str = '') -> str:
    """Generate obfuscated storage key — no meaningful name."""
    return f"{uuid.uuid4().hex}{extension}.enc"


def upload_chunk(storage_key: str, data: bytes, bucket: str = None) -> bool:
    """Upload an encrypted chunk to MinIO."""
    client = get_minio_client()
    bucket = bucket or settings.MINIO_BUCKET_NAME
    ensure_bucket_exists(bucket)
    client.put_object(
        bucket_name=bucket,
        object_name=storage_key,
        data=BytesIO(data),
        length=len(data),
        content_type='application/octet-stream',
    )
    return True


def download_chunk(storage_key: str, bucket: str = None) -> bytes:
    """Download an encrypted chunk from MinIO."""
    client = get_minio_client()
    bucket = bucket or settings.MINIO_BUCKET_NAME
    response = client.get_object(bucket, storage_key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def delete_object(storage_key: str, bucket: str = None):
    client = get_minio_client()
    bucket = bucket or settings.MINIO_BUCKET_NAME
    client.remove_object(bucket, storage_key)
