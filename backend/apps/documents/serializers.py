from rest_framework import serializers
from .models import Document, DocumentMetadata, DocumentChunk, DocumentShare, DocumentVersion, DocumentChangeLog

class DocumentChunkSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentChunk
        fields = ['chunk_index', 'chunk_size', 'sha256_hash', 'upload_status']

class DocumentMetadataSerializer(serializers.ModelSerializer):
    class Meta:
        model  = DocumentMetadata
        fields = '__all__'
        read_only_fields = ['document']

class DocumentListSerializer(serializers.ModelSerializer):
    category   = serializers.CharField(source='metadata.category', read_only=True, default='')
    tags       = serializers.JSONField(source='metadata.tags', read_only=True, default=list)
    ai_summary = serializers.CharField(source='metadata.ai_summary', read_only=True, default='')

    class Meta:
        model  = Document
        fields = [
            'id', 'original_name', 'file_extension', 'mime_type',
            'original_size', 'compressed_size', 'encrypted_size',
            'total_chunks', 'status', 'version', 'category', 'tags',
            'ai_summary', 'created_at', 'updated_at',
        ]

class DocumentDetailSerializer(serializers.ModelSerializer):
    metadata = DocumentMetadataSerializer(read_only=True)
    chunks   = DocumentChunkSerializer(many=True, read_only=True)
    ocr_text = serializers.SerializerMethodField()
    encryption = serializers.SerializerMethodField()

    class Meta:
        model  = Document
        fields = '__all__'

    def get_encryption(self, obj):
        """Facts actually stored for this document's encryption (nothing asserted that isn't recorded)."""
        try:
            key = obj.encryption_key
        except Exception:
            key = None
        chunks = list(obj.chunks.all())
        return {
            'algorithm': key.algorithm if key else None,
            'chunks_stored': sum(1 for c in chunks if c.upload_status == 'done'),
            'chunks_hashed': sum(1 for c in chunks if c.sha256_hash),
            'stored_bytes': sum(c.chunk_size for c in chunks),
        }

    def get_ocr_text(self, obj):
        from apps.ai.models import DocumentOCR
        ocr = (DocumentOCR.objects.filter(document_id=obj.id, status='completed')
               .only('cleaned_text', 'raw_text').first())
        return (ocr.cleaned_text or ocr.raw_text) if ocr else ""

class ChunkUploadSerializer(serializers.Serializer):
    document_id = serializers.UUIDField()
    chunk_index = serializers.IntegerField(min_value=0)
    chunk_data  = serializers.FileField()
    sha256_hash = serializers.CharField(max_length=64)

class InitiateUploadSerializer(serializers.Serializer):
    file_name  = serializers.CharField(max_length=500)
    file_size  = serializers.IntegerField(min_value=1)
    mime_type  = serializers.CharField(max_length=100)
    category   = serializers.CharField(max_length=100, required=False, allow_blank=True)
    department = serializers.CharField(max_length=100, required=False, allow_blank=True)
    # Previously undeclared → DRF dropped them and every upload silently became private
    visibility       = serializers.ChoiceField(choices=['private', 'user_share', 'department', 'organization', 'custom'],
                                               required=False, default='private')
    graph_processing = serializers.ChoiceField(choices=['ai', 'always', 'never'], required=False, default='ai')
    industry_edition = serializers.CharField(max_length=50, required=False, default='generic')

class DocumentShareSerializer(serializers.ModelSerializer):
    class Meta:
        model  = DocumentShare
        fields = ['id', 'share_token', 'expires_at', 'is_active', 'created_at']
        read_only_fields = ['share_token', 'created_at']

class DocumentVersionSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentVersion
        fields = '__all__'

class DocumentChangeLogSerializer(serializers.ModelSerializer):
    from_version = DocumentVersionSerializer(read_only=True)
    to_version = DocumentVersionSerializer(read_only=True)

    class Meta:
        model = DocumentChangeLog
        fields = '__all__'
