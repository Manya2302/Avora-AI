"""
SecureVault AI — Compression Service
Layer 1: ZSTD Level 9 compression before encryption.
Encrypted data cannot be efficiently compressed — so compress FIRST.
"""
import zstandard as zstd
from django.conf import settings


def compress(data: bytes) -> bytes:
    """ZSTD compress at configured level (default: 9)."""
    level = getattr(settings, 'ZSTD_COMPRESSION_LEVEL', 9)
    compressor = zstd.ZstdCompressor(level=level)
    return compressor.compress(data)


def decompress(data: bytes) -> bytes:
    """ZSTD decompress."""
    decompressor = zstd.ZstdDecompressor()
    return decompressor.decompress(data)


def compression_ratio(original_size: int, compressed_size: int) -> float:
    if original_size == 0:
        return 0.0
    return round((1 - compressed_size / original_size) * 100, 2)
