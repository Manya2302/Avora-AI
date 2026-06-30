"""
SecureVault AI — Chunking Service
Layer 2: Split files into 10 MB chunks for encrypted upload.
Benefits: resumable uploads, parallel processing, corruption isolation.
"""
from typing import Generator
from django.conf import settings


def split_into_chunks(data: bytes, chunk_size: int = None) -> Generator[bytes, None, None]:
    """Yield fixed-size byte chunks."""
    chunk_size = chunk_size or getattr(settings, 'CHUNK_SIZE_BYTES', 10 * 1024 * 1024)
    for i in range(0, len(data), chunk_size):
        yield data[i:i + chunk_size]


def calculate_total_chunks(file_size: int, chunk_size: int = None) -> int:
    chunk_size = chunk_size or getattr(settings, 'CHUNK_SIZE_BYTES', 10 * 1024 * 1024)
    return -(-file_size // chunk_size)  # ceiling division
