import hashlib
import hmac
import os
import re
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
from .models import Document, DocumentMetadata, DocumentChunk, DocumentEncryptionKey, DocumentVersion, DocumentChangeLog
from .serializers import (
    DocumentListSerializer, DocumentDetailSerializer,
    DocumentMetadataSerializer, InitiateUploadSerializer,
    ChunkUploadSerializer, DocumentShareSerializer,
    DocumentVersionSerializer, DocumentChangeLogSerializer
)
from .services.compression import compress, compression_ratio
from .services.encryption import generate_aes_key, encrypt_chunk, wrap_key_with_rsa, generate_rsa_key_pair
from .services.chunking import calculate_total_chunks
from .services.storage import generate_storage_key, upload_chunk, ensure_bucket_exists
from apps.audit.models import AuditLog
from .tasks import process_document_ai  # noqa: F401
from apps.ai.services.dispatch import dispatch_document_processing
from apps.ai.tasks import analyze_temporal_diff_async

_SHA256_HEX = re.compile(r'^[0-9a-f]{64}$')


def _is_sha256_hex(value: str) -> bool:
    return bool(_SHA256_HEX.match(value or ''))


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
            extra={'graph_processing': d.get('graph_processing', 'ai'), 'industry_edition': d.get('industry_edition', 'generic')}
        )

        # Create default visibility for new documents based on user selection
        from apps.organizations.models import DocumentVisibility
        from apps.organizations.permissions import ensure_visibility
        vis_level = d.get('visibility', 'private')
        if vis_level not in DocumentVisibility.Level.values:
            vis_level = 'private'
        ensure_visibility(document.id, request.user, visibility=vis_level)

        # Per-document AES-256 key. (An RSA-4096 key pair used to be generated here on every
        # upload and then discarded — 0.2-0.8 s of CPU per upload for nothing.)
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
            # The data key is no longer sent to the browser: chunks are encrypted server-side with
            # the stored per-document key, so exposing it (logs, proxies, devtools) gained nothing.
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

        idx = d['chunk_index']
        if idx < 0 or idx >= max(document.total_chunks, 1):
            return Response({'error': 'chunk_index out of range.'}, status=400)
        if d['chunk_data'].size > settings.CHUNK_SIZE_BYTES + 1024:
            return Response({'error': 'Chunk exceeds the configured chunk size.'}, status=413)
        if document.status not in (Document.Status.UPLOADING,):
            return Response({'error': 'Upload already completed for this document.'}, status=409)
        chunk_data = d['chunk_data'].read()

        # Transport integrity: the client sends the hex SHA-256 of the plaintext chunk it read.
        # Verify it when it is a real digest (legacy clients sent 'placeholder', which is skipped).
        client_hash = (d.get('sha256_hash') or '').strip().lower()
        if _is_sha256_hex(client_hash) and not hmac.compare_digest(
                hashlib.sha256(chunk_data).hexdigest(), client_hash):
            return Response({'error': 'Chunk checksum mismatch — the chunk was corrupted in transit. Retry the upload.'},
                            status=400)

        # Layer 1: Compress
        compressed = compress(chunk_data)

        # Layer 3: Encrypt (AES-256-GCM) — key from request in demo
        # In production, client sends pre-encrypted chunk
        # The server-held key is authoritative. A client-supplied key that differs would
        # silently encrypt chunks the pipeline can never decrypt (corrupt document).
        key_row = DocumentEncryptionKey.objects.filter(document=document).only('encrypted_aes_key').first()
        if key_row is None:
            return Response({'error': 'Encryption key missing for this document.'}, status=409)
        aes_key = bytes(key_row.encrypted_aes_key)
        aes_key_hex = str(request.data.get('aes_key_hex', '') or '')
        if aes_key_hex in ('undefined', 'null'):   # older frontends echo a missing field
            aes_key_hex = ''
        if aes_key_hex:
            try:
                if not hmac.compare_digest(bytes.fromhex(aes_key_hex), aes_key):
                    return Response({'error': 'aes_key_hex does not match this document.'}, status=400)
            except ValueError:
                return Response({'error': 'aes_key_hex is not valid hex.'}, status=400)
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

        uploaded_count = document.chunks.filter(upload_status='done', chunk_index__lt=document.total_chunks).count()

        # Atomic status flip: exactly one request (the last chunk) starts processing,
        # even when the final chunks arrive concurrently.
        if uploaded_count >= document.total_chunks and Document.objects.filter(
                id=document.id, status=Document.Status.UPLOADING).update(status=Document.Status.PROCESSING):
            document.status = Document.Status.PROCESSING
            document.compressed_size = document.chunks.aggregate(
                s=models.Sum('chunk_size'))['s'] or 0
            document.encrypted_size = document.compressed_size
            document.save(update_fields=["compressed_size", "encrypted_size", "updated_at"])
            # Hand off to the AI pipeline (background pool in eager mode, Celery worker otherwise)
            dispatch_document_processing(document.id)

        return Response({'chunk_index': d['chunk_index'], 'status': 'uploaded',
                         'uploaded': uploaded_count, 'total': document.total_chunks})


class DocumentViewSet(ModelViewSet):
    """
    /api/documents/  — CRUD + list for documents.
    """
    permission_classes = [permissions.IsAuthenticated]
    search_fields = ['original_name']   # ?search=<text> (SearchFilter is a default backend)

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
        doc_id_str = str(document.id)
        
        # Log before hard delete
        AuditLog.log(request, 'delete', document_id=doc_id_str, resource=document.original_name)
        
        # Attempt to remove vectors from Qdrant Cloud
        # Remove ALL vectors of the document (chunks + document point) by payload filter
        try:
            from apps.ai.services.vector_store import delete_document_points
            delete_document_points(doc_id_str)
        except Exception:
            pass
            
        # Manually cascade delete decoupled intelligence records
        from apps.contracts.models import ContractAnalysis
        from apps.compliance.models import ComplianceRisk, ComplianceCheckResult, ExpiryAlert, ComplianceTimeline
        from apps.ai.models import DocumentClassification, DocumentOCR
        from apps.knowledge.models import KnowledgeNode
        
        ContractAnalysis.objects.filter(document_id=doc_id_str).delete()
        ComplianceRisk.objects.filter(document_id=doc_id_str).delete()
        ComplianceCheckResult.objects.filter(document_id=doc_id_str).delete()
        ExpiryAlert.objects.filter(document_id=doc_id_str).delete()
        ComplianceTimeline.objects.filter(document_id=doc_id_str).delete()
        DocumentClassification.objects.filter(document_id=doc_id_str).delete()
        DocumentOCR.objects.filter(document_id=doc_id_str).delete()
        KnowledgeNode.objects.filter(document_id=doc_id_str).delete()

        # Hard delete from local relational DB
        document.delete()
        return Response({'message': 'Document permanently deleted.'}, status=204)

    @action(detail=True, methods=['get'])
    def download_url(self, request, pk=None):
        """Generate a pre-signed download URL."""
        document = self.get_object()
        AuditLog.log(request, 'download', document_id=str(document.id),
                     resource=document.original_name)
        # In production: generate MinIO pre-signed URL
        return Response({'message': 'Download endpoint — integrate MinIO presign here.',
                         'document_id': str(document.id)})

    @action(detail=True, methods=['get'], url_path='download')
    def download(self, request, pk=None):
        """
        GET /api/documents/<id>/download/ — stream the original file.
        Chunks are fetched from storage one at a time, checked against their stored SHA-256,
        AES-256-GCM decrypted and ZSTD-decompressed, so memory stays at ~one chunk.
        """
        from urllib.parse import quote
        from django.http import StreamingHttpResponse
        from .services.storage import download_chunk
        from .services.encryption import decrypt_chunk
        from .services.compression import decompress
        import logging

        document = self.get_object()
        if document.status == Document.Status.UPLOADING:
            return Response({'error': 'This document is still uploading.'}, status=409)
        chunks = list(document.chunks.filter(upload_status='done').order_by('chunk_index')
                      .only('chunk_index', 'storage_key', 'sha256_hash', 'iv'))
        key_row = DocumentEncryptionKey.objects.filter(document=document).only('encrypted_aes_key').first()
        if not chunks or len(chunks) < document.total_chunks or key_row is None:
            return Response({'error': 'The stored file is incomplete and cannot be downloaded.'}, status=409)
        aes_key = bytes(key_row.encrypted_aes_key)

        AuditLog.log(request, 'download', document_id=str(document.id), resource=document.original_name)

        def stream():
            for c in chunks:
                blob = download_chunk(c.storage_key)
                if c.sha256_hash and hashlib.sha256(blob).hexdigest() != c.sha256_hash:
                    # Can't change the status mid-stream; stopping early makes the transfer fail
                    # on the client (Content-Length not reached) instead of serving corrupt bytes.
                    logging.getLogger(__name__).error(
                        'Integrity check failed for document %s chunk %s', document.id, c.chunk_index)
                    return
                yield decompress(decrypt_chunk(blob, aes_key, c.iv))

        resp = StreamingHttpResponse(stream(), content_type=document.mime_type or 'application/octet-stream')
        if document.original_size:
            resp['Content-Length'] = str(document.original_size)
        ascii_name = document.original_name.encode('ascii', 'ignore').decode().replace('"', '') or 'document'
        resp['Content-Disposition'] = (f'attachment; filename="{ascii_name}"; '
                                       f"filename*=UTF-8''{quote(document.original_name)}")
        resp['X-Content-Type-Options'] = 'nosniff'
        return resp

    @action(detail=True, methods=['get'])
    def versions(self, request, pk=None):
        """Get version history of a document."""
        document = self.get_object()
        versions = DocumentVersion.objects.filter(document=document).order_by('-version_number')
        serializer = DocumentVersionSerializer(versions, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def risks(self, request, pk=None):
        """Get AI identified compliance risks for this specific document."""
        from apps.compliance.models import ComplianceRisk
        from apps.compliance.serializers import ComplianceRiskSerializer
        
        document = self.get_object()
        risks = ComplianceRisk.objects.filter(document_id=str(document.id)).order_by('-created_at')
        serializer = ComplianceRiskSerializer(risks, many=True)
        return Response(serializer.data)


    @action(detail=True, methods=['get'])
    def change_logs(self, request, pk=None):
        """Get temporal intelligence analysis (diffs, risks) between versions."""
        document = self.get_object()
        logs = DocumentChangeLog.objects.filter(document=document).order_by('-created_at')
        serializer = DocumentChangeLogSerializer(logs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def save_version(self, request, pk=None):
        """
        Save a new version of the document from the frontend editor.
        Expects 'raw_text' in the request body.
        """
        document = self.get_object()
        raw_text = request.data.get('raw_text', '')
        
        if not raw_text:
            return Response({'error': 'raw_text is required'}, status=400)

        # Get or create the previous version (v1) if it doesn't exist
        # We assume OCR text is v1 if there's no version
        previous_version = DocumentVersion.objects.filter(document=document).order_by('-version_number').first()
        
        if not previous_version:
            # Fallback to OCR text
            from apps.ai.models import DocumentOCR
            ocr = DocumentOCR.objects.filter(document_id=document.id).only('cleaned_text', 'raw_text').first()
            old_text = (ocr.cleaned_text or ocr.raw_text) if ocr else ""
                
            previous_version = DocumentVersion.objects.create(
                document=document,
                version_number=document.version,
                created_by=document.owner,
                raw_text=old_text
            )

        # Increment document version
        document.version += 1
        document.save(update_fields=['version', 'updated_at'])

        # Create new version
        new_version = DocumentVersion.objects.create(
            document=document,
            version_number=document.version,
            created_by=request.user,
            raw_text=raw_text
        )

        # Create change log and trigger temporal intelligence analysis
        changelog = DocumentChangeLog.objects.create(
            document=document,
            from_version=previous_version,
            to_version=new_version
        )
        
        # Update stored text now (cheap); everything slow runs in the background
        from apps.ai.models import DocumentOCR
        DocumentOCR.objects.update_or_create(
            document_id=document.id, defaults={'raw_text': raw_text, 'cleaned_text': raw_text})

        # Re-classify + RE-INDEX the edited text (previously the vector index kept serving the
        # old text to Copilot/search forever), temporal diff, and downstream analysers.
        from apps.ai.services.dispatch import dispatch
        from .tasks import reprocess_edited_document
        dispatch(reprocess_edited_document, str(document.id), str(request.user.id), str(changelog.id))

        return Response({
            'message': 'Version saved successfully. Temporal intelligence analysis started.',
            'version': document.version,
            'changelog_id': str(changelog.id)
        }, status=201)



class DocumentMetadataView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/documents/<id>/metadata/"""
    serializer_class = DocumentMetadataSerializer

    def get_object(self):
        from django.shortcuts import get_object_or_404
        doc = get_object_or_404(Document.objects.select_related('metadata'),
                                id=self.kwargs['pk'], owner=self.request.user, is_deleted=False)
        meta, _ = DocumentMetadata.objects.get_or_create(document=doc)
        return meta
