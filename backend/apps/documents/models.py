import uuid
from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()

class Document(models.Model):
    class Status(models.TextChoices):
        UPLOADING  = 'uploading', 'Uploading'
        PROCESSING = 'processing', 'Processing'
        ENCRYPTED  = 'encrypted', 'Encrypted'
        AI_READY   = 'ai_ready', 'AI Ready'
        FAILED     = 'failed', 'Failed'

    id               = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner            = models.ForeignKey(User, on_delete=models.CASCADE, related_name='documents')
    original_name    = models.CharField(max_length=500)
    storage_key      = models.CharField(max_length=500, unique=True)  # obfuscated MinIO key
    file_extension   = models.CharField(max_length=20)
    mime_type        = models.CharField(max_length=100, blank=True)
    original_size    = models.BigIntegerField(default=0)   # bytes
    compressed_size  = models.BigIntegerField(default=0)
    encrypted_size   = models.BigIntegerField(default=0)
    total_chunks     = models.IntegerField(default=0)
    status           = models.CharField(max_length=20, choices=Status.choices, default=Status.UPLOADING)
    version          = models.IntegerField(default=1)
    parent_document  = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL)
    is_deleted       = models.BooleanField(default=False)
    deleted_at       = models.DateTimeField(null=True, blank=True)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'documents'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['owner', '-created_at']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return f"{self.original_name} (v{self.version})"

class DocumentMetadata(models.Model):
    document   = models.OneToOneField(Document, on_delete=models.CASCADE, related_name='metadata')
    category   = models.CharField(max_length=100, blank=True)
    department = models.CharField(max_length=100, blank=True)
    year       = models.CharField(max_length=10, blank=True)
    tags       = models.JSONField(default=list)
    ai_summary = models.TextField(blank=True)
    page_count = models.IntegerField(default=0)
    language   = models.CharField(max_length=50, blank=True, default='en')
    extra      = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'document_metadata'

class DocumentChunk(models.Model):
    document     = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='chunks')
    chunk_index  = models.IntegerField()
    storage_key  = models.CharField(max_length=500)   # MinIO object key
    chunk_size   = models.BigIntegerField()             # encrypted size
    sha256_hash  = models.CharField(max_length=64)
    iv           = models.CharField(max_length=32)      # AES GCM IV (hex)
    tag          = models.CharField(max_length=32)      # AES GCM auth tag (hex)
    upload_status= models.CharField(max_length=20, default='pending')
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'document_chunks'
        unique_together = ('document', 'chunk_index')
        ordering = ['chunk_index']

class DocumentEncryptionKey(models.Model):
    document      = models.OneToOneField(Document, on_delete=models.CASCADE, related_name='encryption_key')
    encrypted_aes_key  = models.BinaryField()   # AES key encrypted with RSA-4096
    rsa_public_key_ref = models.CharField(max_length=200)   # reference to public key ID
    algorithm          = models.CharField(max_length=50, default='AES-256-GCM')
    key_derivation     = models.CharField(max_length=50, default='RSA-OAEP-SHA256')
    created_at         = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'document_encryption_keys'

class DocumentShare(models.Model):
    document    = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='shares')
    shared_by   = models.ForeignKey(User, on_delete=models.CASCADE, related_name='shared_docs')
    share_token = models.UUIDField(default=uuid.uuid4, unique=True)
    expires_at  = models.DateTimeField()
    is_active   = models.BooleanField(default=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'document_shares'

class DocumentVersion(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='history_versions')
    version_number = models.IntegerField()
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    raw_text = models.TextField(blank=True) # Full text of this version for diffing
    storage_key = models.CharField(max_length=500, blank=True) # Storage key for binary file
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'document_versions'
        ordering = ['-version_number']

class DocumentChangeLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='change_logs')
    from_version = models.ForeignKey(DocumentVersion, on_delete=models.CASCADE, related_name='changes_from')
    to_version = models.ForeignKey(DocumentVersion, on_delete=models.CASCADE, related_name='changes_to')
    
    ai_summary = models.TextField(blank=True, help_text="What changed")
    ai_risk = models.TextField(blank=True, help_text="Risk introduced")
    ai_compliance = models.TextField(blank=True, help_text="Compliance impact")
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'document_change_logs'
        ordering = ['-created_at']
