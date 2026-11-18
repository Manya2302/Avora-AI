"""
SecureVault AI — Encryption Service
Layer 3: AES-256-GCM  |  Layer 4: RSA-4096 Key Wrapping
"""
import os
import hashlib
import secrets
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.backends import default_backend


def generate_rsa_key_pair(key_size: int = 4096):
    """Generate RSA-4096 key pair for key wrapping."""
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=key_size,
        backend=default_backend()
    )
    public_key = private_key.public_key()
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    )
    return private_pem, public_pem


def generate_aes_key() -> bytes:
    """Generate 256-bit AES key."""
    return secrets.token_bytes(32)


def encrypt_chunk(data: bytes, aes_key: bytes) -> dict:
    """
    Layer 3: AES-256-GCM encrypt a single chunk.
    Returns: {ciphertext, iv, tag, sha256_hash}
    """
    iv = secrets.token_bytes(12)   # 96-bit IV for GCM
    aesgcm = AESGCM(aes_key)
    ciphertext_with_tag = aesgcm.encrypt(iv, data, None)
    # GCM appends 16-byte auth tag at end
    ciphertext = ciphertext_with_tag[:-16]
    tag = ciphertext_with_tag[-16:]
    sha256 = hashlib.sha256(ciphertext_with_tag).hexdigest()
    return {
        'ciphertext': ciphertext_with_tag,  # store together
        'iv': iv.hex(),
        'tag': tag.hex(),
        'sha256_hash': sha256,
    }


def decrypt_chunk(ciphertext_with_tag: bytes, aes_key: bytes, iv_hex: str) -> bytes:
    """AES-256-GCM decrypt a single chunk."""
    iv = bytes.fromhex(iv_hex)
    aesgcm = AESGCM(aes_key)
    return aesgcm.decrypt(iv, ciphertext_with_tag, None)


def wrap_key_with_rsa(aes_key: bytes, public_pem: bytes) -> bytes:
    """
    Layer 4: RSA-4096 OAEP — wrap (encrypt) the AES key with RSA public key.
    Attacker needs: encrypted_file + wrapped_aes_key + rsa_private_key.
    """
    public_key = serialization.load_pem_public_key(public_pem, backend=default_backend())
    wrapped = public_key.encrypt(
        aes_key,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None
        )
    )
    return wrapped


def unwrap_key_with_rsa(wrapped_key: bytes, private_pem: bytes) -> bytes:
    """RSA-4096 OAEP — unwrap (decrypt) the AES key with RSA private key."""
    private_key = serialization.load_pem_private_key(
        private_pem, password=None, backend=default_backend()
    )
    return private_key.decrypt(
        wrapped_key,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None
        )
    )


def verify_sha256(data: bytes, stored_hash: str) -> bool:
    """Layer 5: SHA-256 integrity verification."""
    computed = hashlib.sha256(data).hexdigest()
    return computed == stored_hash


def encrypt_string(text: str, aes_key: bytes) -> dict:
    """Encrypt a string and return hex-encoded fields for JSON storage."""
    res = encrypt_chunk(text.encode('utf-8'), aes_key)
    return {
        'ciphertext_hex': res['ciphertext'].hex(),
        'iv_hex': res['iv'],
        'tag_hex': res['tag'],
    }


def decrypt_string(encrypted_dict: dict, aes_key: bytes) -> str:
    """Decrypt a hex-encoded dictionary back to string."""
    # encrypt_chunk() already returns ciphertext WITH the 16-byte GCM tag appended, so
    # 'ciphertext_hex' is complete on its own. The previous implementation appended
    # tag_hex a second time, which made GCM authentication fail for every payload.
    # Try the correct form first; keep the concatenated form as a fallback.
    try:
        aes_key = bytes(aes_key)
        ct = bytes.fromhex(encrypted_dict['ciphertext_hex'])
        iv = encrypted_dict['iv_hex']
    except Exception:
        return ""
    for candidate in (ct, ct + bytes.fromhex(encrypted_dict.get('tag_hex', '') or '')):
        try:
            return decrypt_chunk(candidate, aes_key, iv).decode('utf-8')
        except Exception:
            continue
    return ""
