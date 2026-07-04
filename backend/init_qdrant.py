import os
import django
import sys

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'securevault.settings.base')
django.setup()

from django.conf import settings
from utils.qdrant_client import get_client
from qdrant_client.models import VectorParams, Distance

def init():
    client = get_client()
    collection = settings.QDRANT_COLLECTION

    try:
        client.get_collection(collection)
        print(f"Collection {collection} already exists in Qdrant Cloud.")
    except Exception as e:
        print(f"Collection doesn't exist, creating it... {e}")
        client.create_collection(
            collection_name=collection,
            vectors_config=VectorParams(size=settings.QDRANT_VECTOR_SIZE, distance=Distance.COSINE),
        )
        print(f"Created collection {collection} with vector size {settings.QDRANT_VECTOR_SIZE}")

if __name__ == '__main__':
    init()
