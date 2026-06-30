import os
import uuid
from django.db import models
from django.conf import settings
from django.utils import timezone
from rest_framework import status, generics, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet
from rest_framework.parsers import MultiPartParser, FormParser
from .models import Document, DocumentMetadata, DocumentChunk, DocumentEncryptionKey
from .serializers import (
    DocumentListSerializer, DocumentDetailSerializer,
    DocumentMetadataSerializer, InitiateUploadSerializer,
    ChunkUploadSerializer, DocumentShareSerializer,
)
from .services.compression import compress, compression_ratio
from .services.encryption import generate_aes_key, encrypt_chunk, wrap_key_with_rsa, generate_rsa_key_pair
from .services.chunking import calculate_total_chunks
from .services.storage import generate_storage_key, upload_chunk, ensure_bucket_exists
from apps.audit.models import AuditLog
from .tasks import process_document_ai


class InitiateUploadView(APIView):
    """
    POST /api/documents/upload/initiate/
    Step 1: Create document record, generate encryption keys.
    """
    def post(self, request):
        s = InitiateUploadSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data

        # Validate file size
        if d['file_size'] > settings.MAX_UPLOAD_SIZE_BYTES:
            return Response({'error': 'File exceeds 5 GB limit.'}, status=400)

        # Validate extension
        ext = os.path.splitext(d['file_name'])[1].lower()
        if ext not in settings.ALLOWED_EXTENSIONS:
            return Response({'error': f'Extension {ext} not allowed.'}, status=400)

        ensure_bucket_exists()
        storage_key    = generate_storage_key(ext)
        total_chunks   = calculate_total_chunks(d['file_size'])

        document = Document.objects.create(
            owner=request.user,
            original_name=d['file_name'],
            storage_key=storage_key,
            file_extension=ext,
            mime_type=d['mime_type'],
            original_size=d['file_size'],
            total_chunks=total_chunks,
            status=Document.Status.UPLOADING,
        )
        DocumentMetadata.objects.create(
            document=document,
            category=d.get('category', ''),
            department=d.get('department', ''),
        )

        # Generate per-document AES-256 key + RSA-4096 key pair
        private_pem, public_pem = generate_rsa_key_pair(settings.RSA_KEY_SIZE)
        aes_key     = generate_aes_key()
        # In mock/development mode, save the plaintext key directly in encrypted_aes_key
        # so the async pipeline task can decrypt it.
        wrapped_key = aes_key

        DocumentEncryptionKey.objects.create(
            document=document,
            encrypted_aes_key=wrapped_key,
            rsa_public_key_ref=f"doc-{document.id}",
        )

        # Return AES key to client for client-side chunk encryption
        # In production: use client-side encryption only — never transmit plaintext key
        return Response({
            'document_id': str(document.id),
            'total_chunks': total_chunks,
            'chunk_size': settings.CHUNK_SIZE_BYTES,
            'storage_key': storage_key,
            'aes_key_hex': aes_key.hex(),    # WARNING: for demo; use client-side crypto in prod
            'message': 'Upload initiated. Start sending chunks.',
        }, status=status.HTTP_201_CREATED)


class UploadChunkView(APIView):
    """
    POST /api/documents/upload/chunk/
    Step 2: Upload an individual encrypted chunk.
    """
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        s = ChunkUploadSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data

        try:
            document = Document.objects.get(id=d['document_id'], owner=request.user)
        except Document.DoesNotExist:
            return Response({'error': 'Document not found.'}, status=404)

        chunk_data = d['chunk_data'].read()

        # Layer 1: Compress
        compressed = compress(chunk_data)

        # Layer 3: Encrypt (AES-256-GCM) — key from request in demo
        # In production, client sends pre-encrypted chunk
        aes_key_hex = request.data.get('aes_key_hex', '')
        if not aes_key_hex:
            return Response({'error': 'aes_key_hex required'}, status=400)

        aes_key    = bytes.fromhex(aes_key_hex)
        enc_result = encrypt_chunk(compressed, aes_key)

        # Layer 5: SHA-256 integrity hash
        chunk_storage_key = f"chunks/{document.id}/{d['chunk_index']}.enc"
        upload_chunk(chunk_storage_key, enc_result['ciphertext'])

        DocumentChunk.objects.update_or_create(
            document=document,
            chunk_index=d['chunk_index'],
            defaults={
                'storage_key':  chunk_storage_key,
                'chunk_size':   len(enc_result['ciphertext']),
                'sha256_hash':  enc_result['sha256_hash'],
                'iv':           enc_result['iv'],
                'tag':          enc_result['tag'],
                'upload_status':'done',
            }
        )

        uploaded_count = document.chunks.filter(upload_status='done').count()

        if uploaded_count >= document.total_chunks:
            document.status = Document.Status.PROCESSING
            document.compressed_size = document.chunks.aggregate(
                s=models.Sum('chunk_size'))['s'] or 0
            document.encrypted_size = document.compressed_size
            document.save()
            import threading
            threading.Thread(
                target=process_document_ai.run,
                args=(str(document.id),),
                daemon=True
            ).start()

        return Response({'chunk_index': d['chunk_index'], 'status': 'uploaded',
                         'uploaded': uploaded_count, 'total': document.total_chunks})


class DocumentViewSet(ModelViewSet):
    """
    /api/documents/  — CRUD + list for documents.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Document.objects.filter(
            owner=self.request.user, is_deleted=False
        ).select_related('metadata')

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return DocumentDetailSerializer
        return DocumentListSerializer

    def destroy(self, request, *args, **kwargs):
        document = self.get_object()
        document.is_deleted = True
        document.deleted_at = timezone.now()
        document.save()
        AuditLog.log(request, 'delete', document_id=str(document.id),
                     resource=document.original_name)
        return Response({'message': 'Document deleted.'}, status=204)

    @action(detail=True, methods=['get'])
    def download_url(self, request, pk=None):
        """Generate a pre-signed download URL."""
        document = self.get_object()
        AuditLog.log(request, 'download', document_id=str(document.id),
                     resource=document.original_name)
        # In production: generate MinIO pre-signed URL
        return Response({'message': 'Download endpoint — integrate MinIO presign here.',
                         'document_id': str(document.id)})


class DocumentMetadataView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/documents/<id>/metadata/"""
    serializer_class = DocumentMetadataSerializer

    def get_object(self):
        doc = Document.objects.get(id=self.kwargs['pk'], owner=self.request.user)
        return doc.metadata
