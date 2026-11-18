"""
Documents / audit area: chunk checksum verification, real file download, list search +
pagination, encryption facts on the detail endpoint, and audit CSV export.

    python manage.py test tests.test_area_documents
"""
import csv
import hashlib
import io
import shutil
import tempfile
from unittest.mock import patch

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

CACHE = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "area-docs"}}
TMP_MEDIA = tempfile.mkdtemp(prefix="avora-area-docs-")


@override_settings(CACHES=CACHE, USE_MOCK_STORAGE=True, MEDIA_ROOT=TMP_MEDIA, CHUNK_SIZE_BYTES=64 * 1024)
@patch("rest_framework.throttling.SimpleRateThrottle.allow_request", return_value=True)
class DocumentsAreaTest(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TMP_MEDIA, ignore_errors=True)

    def setUp(self):
        cache.clear()
        from django.contrib.auth import get_user_model
        U = get_user_model()
        self.user = U.objects.create_user(email="docs@t.io", password="Str0ng-pass-123", full_name="Docs")
        self.other = U.objects.create_user(email="other@t.io", password="Str0ng-pass-123", full_name="Other")
        self.api = APIClient()
        self.api.force_authenticate(self.user)

    # ── helpers ──────────────────────────────────────────────
    def _initiate(self, data: bytes, name="report.txt"):
        r = self.api.post("/api/documents/upload/initiate/", {
            "file_name": name, "file_size": len(data), "mime_type": "text/plain"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.data

    def _send_chunk(self, doc_id, idx, part: bytes, sha):
        return self.api.post("/api/documents/upload/chunk/", {
            "document_id": doc_id, "chunk_index": idx,
            "chunk_data": SimpleUploadedFile("c", part), "sha256_hash": sha}, format="multipart")

    def _upload(self, data: bytes, name="report.txt"):
        init = self._initiate(data, name)
        size = init["chunk_size"]
        with patch("apps.documents.views.dispatch_document_processing") as disp:
            for i in range(init["total_chunks"]):
                part = data[i * size:(i + 1) * size]
                r = self._send_chunk(init["document_id"], i, part, hashlib.sha256(part).hexdigest())
                self.assertEqual(r.status_code, 200, r.content)
            disp.assert_called_once()
        return init["document_id"]

    # ── tests ────────────────────────────────────────────────
    def test_chunk_hash_mismatch_rejected(self, _t):
        data = b"hello world" * 10
        init = self._initiate(data)
        r = self._send_chunk(init["document_id"], 0, data, "0" * 64)
        self.assertEqual(r.status_code, 400)
        self.assertIn("checksum", r.data["error"])

    def test_legacy_placeholder_hash_still_accepted(self, _t):
        data = b"legacy client"
        init = self._initiate(data)
        with patch("apps.documents.views.dispatch_document_processing"):
            r = self._send_chunk(init["document_id"], 0, data, "placeholder")
        self.assertEqual(r.status_code, 200, r.content)

    def test_download_roundtrip_multi_chunk_and_audit(self, _t):
        from apps.audit.models import AuditLog
        data = bytes(range(256)) * 700   # ~179 KB -> 3 chunks of 64 KB
        doc_id = self._upload(data, name="données.txt")
        r = self.api.get(f"/api/documents/{doc_id}/download/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(b"".join(r.streaming_content), data)
        self.assertIn("attachment", r["Content-Disposition"])
        self.assertIn("filename*=UTF-8''donn%C3%A9es.txt", r["Content-Disposition"])
        self.assertTrue(AuditLog.objects.filter(user=self.user, action="download", document_id=doc_id).exists())

        # Detail exposes only recorded encryption facts
        d = self.api.get(f"/api/documents/{doc_id}/").data["encryption"]
        self.assertEqual(d["algorithm"], "AES-256-GCM")
        self.assertEqual(d["chunks_stored"], 3)
        self.assertEqual(d["chunks_hashed"], 3)
        self.assertGreater(d["stored_bytes"], 0)

    def test_download_scoped_and_blocked_while_uploading(self, _t):
        data = b"x" * 100
        init = self._initiate(data)
        self.assertEqual(self.api.get(f"/api/documents/{init['document_id']}/download/").status_code, 409)
        doc_id = self._upload(b"secret")
        other = APIClient(); other.force_authenticate(self.other)
        self.assertEqual(other.get(f"/api/documents/{doc_id}/download/").status_code, 404)

    def test_list_search_and_pagination(self, _t):
        import uuid
        from apps.documents.models import Document
        for i in range(25):
            Document.objects.create(owner=self.user, original_name=f"file-{i}.pdf", storage_key=str(uuid.uuid4()),
                                    file_extension="pdf", status="ai_ready")
        Document.objects.create(owner=self.user, original_name="Quarterly-Invoice.pdf", storage_key=str(uuid.uuid4()),
                                file_extension="pdf", status="ai_ready")
        r = self.api.get("/api/documents/", {"page": 2})
        self.assertEqual(r.data["count"], 26)
        self.assertEqual(len(r.data["results"]), 6)
        self.assertIsNone(r.data["next"])
        r = self.api.get("/api/documents/", {"search": "invoice"})
        self.assertEqual(r.data["count"], 1)

    def test_audit_csv_export_scoped_filtered_and_escaped(self, _t):
        from apps.audit.models import AuditLog
        AuditLog.objects.create(user=self.user, action="upload", resource='=HYPERLINK("x"),"quoted"')
        AuditLog.objects.create(user=self.user, action="download", resource="b.pdf")
        AuditLog.objects.create(user=self.other, action="upload", resource="not-mine.pdf")
        r = self.api.get("/api/audit/logs/export/", {"action": "upload"})
        self.assertEqual(r.status_code, 200)
        self.assertIn("text/csv", r["Content-Type"])
        self.assertIn("audit-log-upload-", r["Content-Disposition"])
        rows = list(csv.reader(io.StringIO(b"".join(r.streaming_content).decode())))
        self.assertEqual(rows[0][3], "action")
        self.assertEqual(len(rows), 2)                                   # header + my one upload
        self.assertEqual(rows[1][4], '\'=HYPERLINK("x"),"quoted"')       # formula neutralised, quotes kept
        r = self.api.get("/api/audit/logs/export/", {"action": "bad\r\nX-Injected: 1"})
        self.assertEqual(r.status_code, 200)
        self.assertIn("audit-log-all-", r["Content-Disposition"])
