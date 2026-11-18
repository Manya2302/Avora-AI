"""
Google Drive Sync Tasks — Enterprise Reliability Layer.

Rules:
  - Never cancel the whole sync because one file fails.
  - Retry individual files up to MAX_RETRIES with exponential backoff.
  - Batch processing to cap memory usage.
  - Duplicate detection via SHA-256 hash.
  - Token auto-refresh before every batch.
  - SQLite-safe DB writes with retry on OperationalError (locked).
  - All progress stored in GDriveSyncSession / GDriveFileStatus.
  - Existing OCR / AI / embedding / compliance pipeline untouched.
"""

import hashlib
import io
import logging
from django.db.models import F
from django.db.models.functions import Greatest
import time
import traceback
from datetime import timedelta
from typing import List

from celery import shared_task
from django.conf import settings
from django.db import OperationalError, transaction
from django.utils import timezone
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

from apps.integrations.models import (
    GDriveFileStatus,
    GDriveSyncSession,
    IntegrationConfig,
    SyncEvent,
    SyncStatus,
)
from apps.documents.models import Document, DocumentMetadata, DocumentEncryptionKey, DocumentChunk
from apps.documents.services.encryption import generate_aes_key, encrypt_chunk
from apps.documents.services.storage import ensure_bucket_exists, generate_storage_key, upload_chunk
from apps.documents.services.compression import compress
from apps.documents.tasks import process_document_ai  # noqa: F401
from apps.ai.services.dispatch import dispatch_document_processing

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────
BATCH_SIZE    = 50          # files processed per batch
MAX_RETRIES   = 3           # per-file retry attempts
BACKOFF_BASE  = 2           # exponential backoff base (seconds)
DB_LOCK_RETRIES = 5         # SQLite OperationalError retry count
DB_LOCK_SLEEP   = 0.3       # seconds between DB lock retries

SUPPORTED_GDOC_TYPES = {
    'application/vnd.google-apps.document':    ('text/plain',    '.txt'),
    'application/vnd.google-apps.spreadsheet': ('text/csv',      '.csv'),
    'application/vnd.google-apps.presentation':('text/plain',    '.txt'),
}

SUPPORTED_BINARY_EXTS = {
    '.pdf', '.txt', '.docx', '.doc', '.xlsx', '.xls', '.csv',
    '.pptx', '.ppt', '.md', '.json', '.xml', '.html',
}


# ── DB Helpers ────────────────────────────────────────────────────────────────

def _safe_save(instance, fields=None):
    """Save a model instance, retrying on SQLite database-locked errors."""
    for attempt in range(DB_LOCK_RETRIES):
        try:
            if fields:
                instance.save(update_fields=fields)
            else:
                instance.save()
            return
        except OperationalError as exc:
            if 'locked' in str(exc).lower() and attempt < DB_LOCK_RETRIES - 1:
                time.sleep(DB_LOCK_SLEEP * (attempt + 1))
            else:
                raise


def _update_session(session: GDriveSyncSession, **kwargs):
    """Atomically update specific fields on a sync session."""
    for k, v in kwargs.items():
        setattr(session, k, v)
    _safe_save(session, list(kwargs.keys()))


def _update_file_status(fs: GDriveFileStatus, **kwargs):
    for k, v in kwargs.items():
        setattr(fs, k, v)
    _safe_save(fs, list(kwargs.keys()))



def _public_error(exc) -> str:
    """User-visible error text. Raw exception strings from Google/HTTP libraries can
    contain URLs, request details or token fragments, so only a category is exposed;
    the full error stays in the server log."""
    logger.warning("[Integrations] %s: %s", type(exc).__name__, exc)
    status = getattr(getattr(exc, "resp", None), "status", None) or getattr(getattr(exc, "response", None), "status_code", None)
    if status:
        return {401: "Authorization expired — reconnect Google Drive.",
                403: "Access denied by Google Drive (check sharing/permissions).",
                404: "File or folder not found.",
                429: "Google Drive rate limit reached — will retry."}.get(int(status), f"Google Drive API error (HTTP {status}).")
    name = type(exc).__name__.lower()
    if "timeout" in name:
        return "Network timeout while contacting Google Drive."
    if "memory" in name:
        return "File too large to process."
    return "Processing failed. See server logs for details."

# ── Credential Helper ────────────────────────────────────────────────────────

def _get_refreshed_credentials(integration: IntegrationConfig) -> Credentials:
    """Return valid Google credentials, auto-refreshing if expired."""
    creds = Credentials(
        token=integration.get_access_token(),
        refresh_token=integration.get_refresh_token(),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=integration.get_client_id(),
        client_secret=integration.get_client_secret(),
    )
    from datetime import timedelta
    from django.utils import timezone as _tz
    expiry = integration.token_expiry
    # Refresh proactively: unknown expiry, already expired, or < 5 minutes left
    needs_refresh = expiry is None or expiry <= _tz.now() + timedelta(minutes=5)
    if needs_refresh and creds.refresh_token:
        try:
            creds.refresh(GoogleAuthRequest())
            integration.set_access_token(creds.token)
            integration.token_expiry = (_tz.make_aware(creds.expiry, __import__("datetime").timezone.utc) if creds.expiry and _tz.is_naive(creds.expiry)
                                        else creds.expiry) or (_tz.now() + timedelta(hours=1))
            _safe_save(integration, ['_access_token', 'token_expiry'])
            logger.info("Google Drive token refreshed for integration %s", integration.id)
        except Exception as exc:
            logger.warning("Token refresh failed (will try existing): %s", exc)
    return creds


# ── Drive File Listing ────────────────────────────────────────────────────────

_DRIVE_ID_RE = __import__("re").compile(r"^[A-Za-z0-9_-]{5,128}$")
MAX_SYNC_FILES = int(__import__("os").getenv("GDRIVE_MAX_SYNC_FILES", "20000"))
MAX_SYNC_FOLDERS = int(__import__("os").getenv("GDRIVE_MAX_SYNC_FOLDERS", "5000"))


def _list_all_files(service, folder_id: str):
    """List all files under a Drive folder.
    Iterative breadth-first walk (the recursive version could blow the stack on deep
    trees), de-duplicates folders reachable via several parents, validates ids before
    they go into the Drive query, and caps total files/folders per sync."""
    files, folders = [], 0
    if not _DRIVE_ID_RE.match(str(folder_id or "")):
        logger.warning("[GDrive] rejected invalid folder id")
        return files, folders
    queue, seen = [folder_id], {folder_id}
    while queue and len(files) < MAX_SYNC_FILES:
        current = queue.pop(0)
        page_token = None
        while True:
            results = service.files().list(
                q=f"'{current}' in parents and trashed = false",
                fields="nextPageToken, files(id, name, mimeType, size, md5Checksum, modifiedTime)",
                pageToken=page_token,
                pageSize=1000,
            ).execute()
            for item in results.get('files', []):
                if item.get('mimeType') == 'application/vnd.google-apps.folder':
                    fid = item.get('id', '')
                    if fid not in seen and _DRIVE_ID_RE.match(fid) and folders < MAX_SYNC_FOLDERS:
                        seen.add(fid)
                        folders += 1
                        queue.append(fid)
                elif len(files) < MAX_SYNC_FILES:
                    files.append(item)
            page_token = results.get('nextPageToken')
            if not page_token or len(files) >= MAX_SYNC_FILES:
                break
    if len(files) >= MAX_SYNC_FILES:
        logger.warning(f"[GDrive] sync capped at {MAX_SYNC_FILES} files")
    return files, folders


# ── Supported File Classifier ─────────────────────────────────────────────────

def _classify_file(item: dict):
    """
    Returns (is_supported, export_mime, ext) or (False, None, None).
    """
    mime = item.get('mimeType', '')
    name = item.get('name', '')
    ext  = ('.' + name.rsplit('.', 1)[-1].lower()) if '.' in name else ''

    if mime in SUPPORTED_GDOC_TYPES:
        export_mime, export_ext = SUPPORTED_GDOC_TYPES[mime]
        return True, export_mime, export_ext

    if mime.startswith('application/vnd.google-apps'):
        return False, None, None   # other Google types → skip

    if ext in SUPPORTED_BINARY_EXTS:
        return True, mime or 'application/octet-stream', ext

    return False, None, None


# ── Pre-scan (for confirmation dialog) ────────────────────────────────────────

@shared_task
def prescan_google_drive_folder(integration_id: str, session_id: str):
    """
    Count total folders/files/supported/unsupported.
    Stores results in GDriveSyncSession so the frontend can show a
    confirmation dialog before the actual import.
    """
    try:
        integration = IntegrationConfig.objects.get(id=integration_id)
        session     = GDriveSyncSession.objects.get(id=session_id)
        creds       = _get_refreshed_credentials(integration)
        service     = build('drive', 'v3', credentials=creds, cache_discovery=False)

        _update_session(session, current_phase='scanning')

        total_folders = 0
        all_files     = []

        for folder_id in integration.selected_folders:
            files, folders = _list_all_files(service, folder_id)
            all_files.extend(files)
            total_folders += folders + 1  # +1 for the root folder itself

        supported   = [f for f in all_files if _classify_file(f)[0]]
        unsupported = [f for f in all_files if not _classify_file(f)[0]]
        total_size  = sum(int(f.get('size', 0) or 0) for f in all_files)
        # ~1 MB/s rough estimate
        est_seconds = max(30, total_size // (1024 * 1024)) + len(supported) * 3

        # The user may have cancelled while we were scanning — don't resurrect it.
        session.refresh_from_db(fields=['overall_status'])
        if session.overall_status == 'cancelled':
            return

        _update_session(session,
            total_folders=total_folders,
            total_files=len(all_files),
            supported_files=len(supported),
            unsupported_files=len(unsupported),
            estimated_size_bytes=total_size,
            elapsed_seconds=est_seconds,
            current_phase='queued',
            overall_status='running',
        )

    except Exception as exc:
        logger.error("prescan_google_drive_folder failed: %s", exc)
        try:
            session = GDriveSyncSession.objects.get(id=session_id)
            _update_session(session, overall_status='failed', current_phase='failed')
        except Exception:
            pass


# ── Main Sync Task ────────────────────────────────────────────────────────────

@shared_task
def sync_google_drive_folder(integration_id: str, session_id: str = None):
    """
    Enterprise-grade Google Drive sync:
    - Batched processing (BATCH_SIZE files)
    - Per-file retry with exponential backoff
    - Duplicate detection via SHA-256
    - Auto token refresh
    - Partial success (failed files don't abort sync)
    - Live progress via GDriveSyncSession / GDriveFileStatus
    """
    integration = None
    session     = None

    try:
        integration = IntegrationConfig.objects.get(id=integration_id)

        # Get or create session
        if session_id:
            try:
                session = GDriveSyncSession.objects.get(id=session_id)
            except GDriveSyncSession.DoesNotExist:
                session = None

        if session is None:
            session = GDriveSyncSession.objects.create(integration=integration)

        if not integration.selected_folders:
            _update_session(session, overall_status='completed', current_phase='completed')
            return

        integration.status = SyncStatus.SYNCING
        _safe_save(integration, ['status'])

        _update_session(session, current_phase='scanning')
        ensure_bucket_exists()

        creds   = _get_refreshed_credentials(integration)
        service = build('drive', 'v3', credentials=creds, cache_discovery=False)

        # ── Scan all folders ────────────────────────────────────────────
        all_files, total_folders = [], 0
        for folder_id in integration.selected_folders:
            files, sub_folders = _list_all_files(service, folder_id)
            all_files.extend(files)
            total_folders += sub_folders + 1

        # Classify supported vs unsupported
        supported_items   = [f for f in all_files if _classify_file(f)[0]]
        unsupported_count = len(all_files) - len(supported_items)

        _update_session(session,
            total_folders=total_folders,
            total_files=len(all_files),
            supported_files=len(supported_items),
            unsupported_files=unsupported_count,
            files_queued=len(supported_items),
            current_phase='downloading',
        )

        # Create per-file status records
        # One INSERT per 500 files instead of one per file
        statuses = GDriveFileStatus.objects.bulk_create([
            GDriveFileStatus(
                session=session,
                gdrive_file_id=item['id'],
                file_name=item['name'][:500],
                file_size=int(item.get('size', 0) or 0),
                mime_type=item.get('mimeType', ''),
                status='queued',
            ) for item in supported_items
        ], batch_size=500)
        file_status_map = {fs.gdrive_file_id: fs for fs in statuses}

        # ── Process in batches ──────────────────────────────────────────
        files_synced = 0
        sync_started = time.time()

        for batch_start in range(0, len(supported_items), BATCH_SIZE):
            batch = supported_items[batch_start:batch_start + BATCH_SIZE]

            # Refresh credentials before each batch
            try:
                creds   = _get_refreshed_credentials(integration)
                service = build('drive', 'v3', credentials=creds, cache_discovery=False)
            except Exception as exc:
                logger.warning("Credential refresh before batch failed: %s", exc)

            for item in batch:
                fs = file_status_map.get(item['id'])
                _process_single_file(
                    item=item,
                    service=service,
                    integration=integration,
                    session=session,
                    file_status=fs,
                )
                if fs:
                    if fs.status == 'completed':
                        files_synced += 1

            # Update elapsed time
            elapsed = int(time.time() - sync_started)
            _update_session(session, elapsed_seconds=elapsed)

        # ── Finalize ────────────────────────────────────────────────────
        _update_session(session,
            current_phase='completed',
            overall_status='completed',
            current_file='',
            finished_at=timezone.now(),
            elapsed_seconds=int(time.time() - sync_started),
        )

        integration.files_indexed = (integration.files_indexed or 0) + files_synced
        integration.status        = SyncStatus.CONNECTED
        integration.last_sync_at  = timezone.now()
        _safe_save(integration, ['files_indexed', 'status', 'last_sync_at'])

        SyncEvent.objects.create(
            integration=integration,
            event_type='sync_complete',
            details={
                'session_id':     str(session.id),
                'files_synced':   files_synced,
                'files_failed':   session.files_failed,
                'files_skipped':  session.files_skipped,
            }
        )

    except Exception as exc:
        logger.error("sync_google_drive_folder fatal error: %s\n%s", exc, traceback.format_exc())
        if integration:
            integration.status     = SyncStatus.ERROR
            integration.sync_error = _public_error(exc)
            _safe_save(integration, ['status', 'sync_error'])
        if session:
            _update_session(session,
                overall_status='failed',
                current_phase='failed',
                finished_at=timezone.now(),
            )


# ── Single-file Processor ─────────────────────────────────────────────────────

def _process_single_file(item, service, integration, session, file_status):
    """
    Download, encrypt, upload, and dispatch AI pipeline for one file.
    Retries up to MAX_RETRIES times with exponential backoff.
    Never raises — marks file as failed instead.
    """
    is_supported, export_mime, ext = _classify_file(item)
    if not is_supported:
        if file_status:
            _update_file_status(file_status, status='skipped', error_message='Unsupported file type')
        # Atomic increment
        try:
            with transaction.atomic():
                GDriveSyncSession.objects.filter(pk=session.pk).update(
                    files_queued=Greatest(F('files_queued') - 1, 0),
                    files_skipped=F('files_skipped') + 1,
                )
                session.files_skipped += 1
                session.files_queued  -= 1
        except Exception:
            pass
        return

    file_name = item['name']
    _update_session(session, current_file=file_name)

    for attempt in range(MAX_RETRIES):
        try:
            _do_process_file(item, service, integration, session, file_status, export_mime, ext)
            return
        except Exception as exc:
            wait = BACKOFF_BASE ** attempt
            logger.warning(
                "File %s attempt %d/%d failed: %s — retrying in %ss",
                file_name, attempt + 1, MAX_RETRIES, exc, wait,
            )
            if file_status:
                _update_file_status(file_status,
                    retry_count=attempt + 1,
                    error_message=_public_error(exc),
                )
            if attempt < MAX_RETRIES - 1:
                time.sleep(wait)

    # All retries exhausted
    if file_status:
        _update_file_status(file_status, status='failed')
    try:
        error_entry = {'file': file_name, 'reason': file_status.error_message if file_status else 'unknown'}
        with transaction.atomic():
            sess = GDriveSyncSession.objects.select_for_update().get(pk=session.pk)
            sess.files_failed  += 1
            sess.files_queued  -= 1
            err_log = sess.error_log or []
            err_log.append(error_entry)
            sess.error_log = err_log
            _safe_save(sess, ['files_failed', 'files_queued', 'error_log'])
            session.files_failed = sess.files_failed
            session.files_queued = sess.files_queued
    except Exception as db_exc:
        logger.error("Could not update session counters: %s", db_exc)


def _mark_skipped(session, file_status):
    if file_status:
        _update_file_status(file_status, status='skipped', is_duplicate=True)
    try:
        with transaction.atomic():
            GDriveSyncSession.objects.filter(pk=session.pk).update(
                files_skipped=F('files_skipped') + 1,
                files_queued=Greatest(F('files_queued') - 1, 0),
            )
            session.files_skipped += 1
            session.files_queued  -= 1
    except Exception:
        pass

def _do_process_file(item, service, integration, session, file_status, export_mime, ext):
    """
    Core file processing: download → dedup check → encrypt → upload → AI dispatch.
    """
    if file_status:
        _update_file_status(file_status, status='checking')

    # ── Duplicate check BEFORE download ─────────────────────────
    # We check if there's an existing document with the same name.
    # To be perfectly correct, we should check by gdrive_file_id in metadata, 
    # but the existing code relies on Document.original_name for uniqueness check in this context.
    existing = Document.objects.filter(
        owner=integration.user,
        original_name=item['name'],
        is_deleted=False,
    ).first()

    # Determine if we can skip based on GDrive item properties
    file_hash = item.get('md5Checksum')
    file_modified = item.get('modifiedTime') # fallback for docs without md5

    if existing:
        existing_hash = getattr(existing, 'content_hash', None)
        
        # Check if we can verify it's unchanged without downloading
        # 1. If we have md5Checksum, use it
        # 2. Or, for Google Docs, we could use a saved modifiedTime. But since we didn't save it before,
        #    we rely on file_hash. If existing_hash == file_hash (from GDrive), skip.
        if file_hash and existing_hash == file_hash:
            _mark_skipped(session, file_status)
            return
            
        # If we couldn't definitively skip before download, we might still check after download 
        # (e.g. for Google Docs which get exported to PDF/TXT and their hash is generated on the fly)

    if file_status:
        _update_file_status(file_status, status='downloading')

    # ── Download ────────────────────────────────────────────────
    mime = item.get('mimeType', '')
    if mime in SUPPORTED_GDOC_TYPES:
        request = service.files().export_media(fileId=item['id'], mimeType=export_mime)
    else:
        request = service.files().get_media(fileId=item['id'])

    fh = io.BytesIO()
    downloader = MediaIoBaseDownload(fh, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()

    content = fh.getvalue()
    if not content:
        raise ValueError("Downloaded file is empty")

    # ── Duplicate detection (post-download) ─────────────────────
    computed_hash = hashlib.sha256(content).hexdigest()
    # Use computed_hash for future duplicate detection, but if GDrive gives md5Checksum, 
    # saving the md5Checksum in content_hash helps us skip the download next time.
    final_hash = file_hash if file_hash else computed_hash

    if file_status:
        _update_file_status(file_status, file_hash=final_hash)

    if existing:
        existing_hash = getattr(existing, 'content_hash', None)
        if existing_hash == final_hash or existing_hash == computed_hash:
            if existing_hash == computed_hash and final_hash != computed_hash:
                existing.content_hash = final_hash
                _safe_save(existing, ['content_hash'])
            _mark_skipped(session, file_status)
            return
        
        # Content changed → re-index (mark old as deleted)
        existing.is_deleted = True
        existing.deleted_at = timezone.now()
        _safe_save(existing, ['is_deleted', 'deleted_at'])
        # Stale version must not keep answering RAG questions
        try:
            from apps.ai.services.vector_store import delete_document_points
            delete_document_points(str(existing.id))
        except Exception as exc:
            logger.warning(f"[GDrive] could not purge vectors of replaced doc {existing.id}: {exc}")

    # ── Encrypt & upload ────────────────────────────────────────
    if file_status:
        _update_file_status(file_status, status='processing')

    size = len(content)
    storage_key  = generate_storage_key(ext)
    total_chunks = (size // settings.CHUNK_SIZE_BYTES) + 1

    with transaction.atomic():
        document = Document.objects.create(
            owner=integration.user,
            original_name=item['name'],
            storage_key=storage_key,
            file_extension=ext,
            mime_type=export_mime,
            original_size=size,
            total_chunks=total_chunks,
            status=Document.Status.UPLOADING,
            content_hash=final_hash, # Save the hash for future comparison
        )
        DocumentMetadata.objects.create(
            document=document,
            category='google_drive_sync',
            extra={'gdrive_file_id': item['id'], 'file_hash': final_hash, 'computed_hash': computed_hash, 'modifiedTime': file_modified},
        )
        aes_key = generate_aes_key()
        DocumentEncryptionKey.objects.create(
            document=document,
            encrypted_aes_key=aes_key,
            rsa_public_key_ref=f"gdrive-{document.id}",
        )
        # Every document needs an access policy row owned by its real owner
        from apps.organizations.permissions import ensure_visibility
        ensure_visibility(document.id, integration.user, visibility='private')

    chunk_index = 0
    for i in range(0, size, settings.CHUNK_SIZE_BYTES):
        chunk_data       = content[i:i + settings.CHUNK_SIZE_BYTES]
        compressed_data  = compress(chunk_data)
        enc_result       = encrypt_chunk(compressed_data, aes_key)
        chunk_storage_key = f"{storage_key}_part_{chunk_index}"
        upload_chunk(chunk_storage_key, enc_result['ciphertext'])
        DocumentChunk.objects.create(
            document=document,
            chunk_index=chunk_index,
            iv=enc_result['iv'],
            storage_key=chunk_storage_key,
            chunk_size=len(chunk_data),
        )
        chunk_index += 1

    # ── Dispatch AI pipeline ────────────────────────────────────
    if file_status:
        _update_file_status(file_status, status='embedding')

    document.status = Document.Status.PROCESSING
    _safe_save(document, ['status'])
    dispatch_document_processing(document.id)

    if file_status:
        _update_file_status(file_status, status='completed')

    # Update session counters
    try:
        with transaction.atomic():
            GDriveSyncSession.objects.filter(pk=session.pk).update(
                files_completed=F('files_completed') + 1,
                files_queued=Greatest(F('files_queued') - 1, 0),
            )
            session.files_completed += 1
            session.files_queued     = max(0, session.files_queued - 1)
    except Exception as exc:
        logger.error("Session counter update failed: %s", exc)


# ── Retry Failed Files ────────────────────────────────────────────────────────

@shared_task
def retry_failed_files(session_id: str):
    """Re-queue all files with status='failed' in a given session."""
    try:
        session     = GDriveSyncSession.objects.get(id=session_id)
        integration = session.integration
        failed      = session.file_statuses.filter(status='failed')
        if not failed.exists():
            return

        creds   = _get_refreshed_credentials(integration)
        service = build('drive', 'v3', credentials=creds, cache_discovery=False)

        for fs in failed:
            item = {
                'id':       fs.gdrive_file_id,
                'name':     fs.file_name,
                'mimeType': fs.mime_type,
                'size':     str(fs.file_size),
            }
            _update_file_status(fs, status='queued', retry_count=0, error_message='')
            _process_single_file(item, service, integration, session, fs)

        _update_session(session, overall_status='completed', current_phase='completed',
                        current_file='', finished_at=timezone.now())

    except Exception as exc:
        logger.error("retry_failed_files error: %s", exc)
        try:
            GDriveSyncSession.objects.filter(id=session_id, overall_status='running').update(
                overall_status='failed', current_phase='failed', current_file='', finished_at=timezone.now(),
            )
        except Exception:
            pass
