from django.conf import settings
from qdrant_client import QdrantClient

_client = None

def get_client() -> QdrantClient:
    global _client
    if _client is None:
        import os
        if getattr(settings, 'USE_LOCAL_QDRANT', True):
            path = os.path.join(settings.BASE_DIR, "db_qdrant")
            _client = QdrantClient(path=path)
        else:
            _client = QdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)
    return _client
