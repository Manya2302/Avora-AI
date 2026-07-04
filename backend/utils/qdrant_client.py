from django.conf import settings
from qdrant_client import QdrantClient

_client = None

def get_client() -> QdrantClient:
    global _client
    if _client is None:
        if getattr(settings, 'QDRANT_URL', None) and getattr(settings, 'QDRANT_API_KEY', None):
            _client = QdrantClient(url=settings.QDRANT_URL, api_key=settings.QDRANT_API_KEY, timeout=60)
        else:
            _client = QdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)
    return _client
