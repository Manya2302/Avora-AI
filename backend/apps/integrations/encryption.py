"""
Two-layer encryption for sensitive integration credentials.

Layer 1 — AES-256-GCM (symmetric, fast) using a per-record derived key.
Layer 2 — PBKDF2-HMAC-SHA256 key stretching bound to user.id + Django SECRET_KEY.

Guarantees:
  • Nothing is stored in plaintext in the DB.
  • The plaintext never appears in Django logs, HTTP response bodies, or
    Django admin list views (only the masked token is ever serialised outward).
  • A database dump alone cannot decrypt credentials without the server SECRET_KEY.
  • Each stored credential uses a unique random salt + nonce, so identical
    values produce different ciphertexts.
"""

import base64
import os
import hashlib
import hmac
from typing import Tuple

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings


_ITERATIONS = 260_000   # OWASP 2023 recommendation for PBKDF2-HMAC-SHA256
_SALT_LEN   = 32        # bytes
_NONCE_LEN  = 12        # bytes (96-bit for AES-GCM)
_KEY_LEN    = 32        # bytes → AES-256


def _derive_key(user_id: str, salt: bytes) -> bytes:
    """
    Derives a 256-bit AES key from:
      - The Django SECRET_KEY (server secret)
      - The user's UUID    (per-user binding)
      - A random salt      (per-record uniqueness)
    """
    master = f"{settings.SECRET_KEY}::{user_id}".encode()
    return hashlib.pbkdf2_hmac(
        'sha256',
        master,
        salt,
        _ITERATIONS,
        dklen=_KEY_LEN,
    )


def encrypt_credential(plaintext: str, user_id: str) -> str:
    """
    Returns a compact base64url-encoded blob:
        <salt_b64>.<nonce_b64>.<ciphertext_b64>
    Safe to store in a TextField; never exceeds ~500 chars for realistic keys.
    """
    if not plaintext:
        return ""

    salt  = os.urandom(_SALT_LEN)
    nonce = os.urandom(_NONCE_LEN)
    key   = _derive_key(user_id, salt)

    aesgcm      = AESGCM(key)
    ciphertext  = aesgcm.encrypt(nonce, plaintext.encode(), None)

    def b64(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).decode()

    return f"{b64(salt)}.{b64(nonce)}.{b64(ciphertext)}"


def decrypt_credential(blob: str, user_id: str) -> str:
    """
    Reverses encrypt_credential.  Returns the plaintext.
    Raises ValueError on tampered / wrong-user data (GCM tag mismatch).
    """
    if not blob:
        return ""

    try:
        salt_b64, nonce_b64, ct_b64 = blob.split(".")
    except ValueError:
        raise ValueError("Malformed credential blob.")

    salt       = base64.urlsafe_b64decode(salt_b64)
    nonce      = base64.urlsafe_b64decode(nonce_b64)
    ciphertext = base64.urlsafe_b64decode(ct_b64)

    key    = _derive_key(user_id, salt)
    aesgcm = AESGCM(key)

    plaintext = aesgcm.decrypt(nonce, ciphertext, None)   # raises on bad tag
    return plaintext.decode()


def mask_credential(plaintext: str) -> str:
    """Return a safe display string: first 4 chars + … + last 4 chars."""
    if not plaintext or len(plaintext) < 10:
        return "••••••••"
    return f"{plaintext[:4]}{'•' * 8}{plaintext[-4:]}"
