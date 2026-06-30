from rest_framework import serializers
from .models import Document, DocumentMetadata, DocumentChunk, DocumentShare

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

    class Meta:
        model  = Document
        fields = '__all__'

    def get_ocr_text(self, obj):
        try:
            from apps.ai.models import DocumentOCR
            ocr = DocumentOCR.objects.get(document_id=obj.id, status='completed')
            return ocr.cleaned_text or ocr.raw_text
        except Exception:
            return ""

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

class DocumentShareSerializer(serializers.ModelSerializer):
    class Meta:
        model  = DocumentShare
        fields = ['id', 'share_token', 'expires_at', 'is_active', 'created_at']
        read_only_fields = ['share_token', 'created_at']
