import logging
import io
from celery import shared_task
from django.conf import settings
from django.utils import timezone
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from google.oauth2.credentials import Credentials

from apps.integrations.models import IntegrationConfig, SyncStatus
from apps.documents.models import Document, DocumentMetadata, DocumentEncryptionKey, DocumentChunk
from apps.documents.services.encryption import generate_aes_key, encrypt_chunk
from apps.documents.services.storage import ensure_bucket_exists, generate_storage_key, upload_chunk
from apps.documents.services.compression import compress
from apps.documents.tasks import process_document_ai

logger = logging.getLogger(__name__)

@shared_task
def sync_google_drive_folder(integration_id: str):
    """
    Background worker that connects to Google Drive, downloads files from
    selected folders, encrypts them, and pushes them into the Avora AI RAG pipeline.
    """
    try:
        integration = IntegrationConfig.objects.get(id=integration_id)
        if not integration.selected_folders:
            return
            
        integration.status = SyncStatus.SYNCING
        integration.save()
        
        creds = Credentials(
            token=integration.get_access_token(),
            refresh_token=integration.get_refresh_token(),
            token_uri="https://oauth2.googleapis.com/token",
            client_id=integration.get_client_id(),
            client_secret=integration.get_client_secret()
        )
        service = build('drive', 'v3', credentials=creds, cache_discovery=False)
        ensure_bucket_exists()
        
        files_synced = 0
        
        def get_all_files_in_folder(parent_id, service):
            files = []
            page_token = None
            while True:
                query = f"'{parent_id}' in parents and trashed = false"
                results = service.files().list(
                    q=query, 
                    fields="nextPageToken, files(id, name, mimeType, size)",
                    pageToken=page_token
                ).execute()
                
                items = results.get('files', [])
                for item in items:
                    if item.get('mimeType') == 'application/vnd.google-apps.folder':
                        files.extend(get_all_files_in_folder(item['id'], service))
                    else:
                        files.append(item)
                        
                page_token = results.get('nextPageToken')
                if not page_token:
                    break
            return files

        for folder_id in integration.selected_folders:
            items = get_all_files_in_folder(folder_id, service)
            
            for item in items:
                # Skip if we already synced this file name for this user (simple mock deduplication)
                if Document.objects.filter(owner=integration.user, original_name=item['name']).exists():
                    continue
                    
                mime_type = item.get('mimeType', 'application/octet-stream')
                is_gdoc = mime_type.startswith('application/vnd.google-apps')
                ext = ''
                if '.' in item['name']:
                    ext = '.' + item['name'].split('.')[-1].lower()
                
                # Setup download request
                if is_gdoc:
                    if mime_type == 'application/vnd.google-apps.document':
                        request = service.files().export_media(fileId=item['id'], mimeType='text/plain')
                        ext = '.txt'
                        mime_type = 'text/plain'
                    elif mime_type == 'application/vnd.google-apps.spreadsheet':
                        request = service.files().export_media(fileId=item['id'], mimeType='text/csv')
                        ext = '.csv'
                        mime_type = 'text/csv'
                    else:
                        continue # Skip other google types for now
                else:
                    request = service.files().get_media(fileId=item['id'])
                
                # Download File Content
                fh = io.BytesIO()
                downloader = MediaIoBaseDownload(fh, request)
                done = False
                while not done:
                    _, done = downloader.next_chunk()
                
                content = fh.getvalue()
                size = len(content)
                if size == 0:
                    continue
                    
                storage_key = generate_storage_key(ext)
                total_chunks = (size // settings.CHUNK_SIZE_BYTES) + 1
                
                # Create Document Record
                document = Document.objects.create(
                    owner=integration.user,
                    original_name=item['name'],
                    storage_key=storage_key,
                    file_extension=ext,
                    mime_type=mime_type,
                    original_size=size,
                    total_chunks=total_chunks,
                    status=Document.Status.UPLOADING
                )
                DocumentMetadata.objects.create(document=document, category='google_drive_sync')
                
                aes_key = generate_aes_key()
                DocumentEncryptionKey.objects.create(
                    document=document,
                    encrypted_aes_key=aes_key,
                    rsa_public_key_ref=f"gdrive-{document.id}"
                )
                
                # Chunk, Encrypt, and Upload to MinIO
                chunk_index = 0
                for i in range(0, size, settings.CHUNK_SIZE_BYTES):
                    chunk_data = content[i:i+settings.CHUNK_SIZE_BYTES]
                    compressed_data = compress(chunk_data)
                    enc_result = encrypt_chunk(compressed_data, aes_key)
                    ciphertext = enc_result['ciphertext']
                    iv = enc_result['iv']
                    chunk_storage_key = f"{storage_key}_part_{chunk_index}"
                    upload_chunk(chunk_storage_key, ciphertext)
                    
                    DocumentChunk.objects.create(
                        document=document,
                        chunk_index=chunk_index,
                        iv=iv,
                        storage_key=chunk_storage_key,
                        chunk_size=len(chunk_data)
                    )
                    chunk_index += 1
                
                # Dispatch to AI Pipeline
                document.status = Document.Status.PROCESSING
                document.save()
                process_document_ai.delay(str(document.id))
                files_synced += 1

        integration.files_indexed += files_synced
        integration.status = SyncStatus.CONNECTED
        integration.last_sync_at = timezone.now()
        integration.save()
        
    except Exception as exc:
        logger.error(f"Google Drive sync failed: {exc}")
        integration.status = SyncStatus.ERROR
        integration.sync_error = str(exc)
        integration.save()
