"""Copilot / compliance / contracts logic-round endpoints.

    python manage.py test tests.test_area_copilot -v 2
"""
import io
import json
import uuid
import zipfile
from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

CACHE = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "area-copilot"}}


@override_settings(CACHES=CACHE)
class CopilotAreaTest(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        from apps.documents.models import Document, DocumentMetadata
        U = get_user_model()
        self.user = U.objects.create_user(email="cp@t.io", password="Str0ng-pass-123", full_name="Cp")
        self.other = U.objects.create_user(email="other@t.io", password="Str0ng-pass-123", full_name="Ot")
        self.up = Document.objects.create(owner=self.user, original_name="up.pdf", storage_key=str(uuid.uuid4()),
                                          file_extension="pdf", status="ai_ready")
        DocumentMetadata.objects.create(document=self.up)
        self.gd = Document.objects.create(owner=self.user, original_name="drive.pdf", storage_key=str(uuid.uuid4()),
                                          file_extension="pdf", status="ai_ready")
        DocumentMetadata.objects.create(document=self.gd, extra={"gdrive_file_id": "abc"})
        self.api = APIClient()
        self.api.force_authenticate(self.user)

    # ── 1. citation origin ───────────────────────────────────────────
    def test_query_sources_carry_origin(self):
        fake = {"answer": "ok", "confidence": 0.8, "sources_count": 2, "sources": [
            {"document_id": str(self.up.id), "document_name": "up.pdf", "relevance": 0.9, "excerpt": "x"},
            {"document_id": str(self.gd.id), "document_name": "drive.pdf", "relevance": 0.7, "excerpt": "y"},
        ]}
        with patch("apps.copilot.services.rag_engine.AvoraRAGEngine.query", return_value=fake):
            r = self.api.post("/api/copilot/query/", {"question": "hi"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        origins = {s["document_id"]: s["origin"] for s in r.data["sources"]}
        self.assertEqual(origins[str(self.up.id)], "uploads")
        self.assertEqual(origins[str(self.gd.id)], "google_drive")
        # Conversation history carries it too
        d = self.api.get(f"/api/copilot/conversations/{r.data['conversation_id']}/")
        refs = [ref for m in d.data["messages"] for ref in m["references"]]
        self.assertEqual({ref["origin"] for ref in refs}, {"uploads", "google_drive"})

    # ── 2. prompt template open ───────────────────────────────────────
    def test_open_prompt_scoped_and_counted(self):
        from apps.copilot.models import PromptTemplate
        mine = PromptTemplate.objects.create(owner=self.user, title="t", prompt="List vendor contracts", category="custom")
        theirs = PromptTemplate.objects.create(owner=self.other, title="t2", prompt="secret", category="custom")
        r = self.api.post(f"/api/copilot/prompts/{mine.id}/use/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["prompt"], "List vendor contracts")
        self.assertEqual(r.data["use_count"], 1)
        self.assertEqual(self.api.post(f"/api/copilot/prompts/{theirs.id}/use/").status_code, 404)

    # ── 4. audit package ZIP ─────────────────────────────────────────
    def test_audit_package_zip(self):
        from apps.compliance.models import AuditPackage
        foreign = str(uuid.uuid4())
        pkg = AuditPackage.objects.create(owner=self.user, name="Pkg", status="ready", readiness_score=72.5,
                                          document_ids=[str(self.up.id), str(self.gd.id), foreign], gaps=["GST return"])

        def fake_load(doc):
            if doc.id == self.gd.id:
                raise ValueError("no chunks")
            return b"%PDF-1.4 hello"
        with patch("apps.ai.services.ingestion.load_document_bytes", side_effect=fake_load):
            r = self.api.get(f"/api/compliance/audit-packages/{pkg.id}/download/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r["Content-Type"], "application/zip")
        zf = zipfile.ZipFile(io.BytesIO(b"".join(r.streaming_content)))
        names = zf.namelist()
        self.assertIn("documents/up.pdf", names)
        self.assertIn("manifest.json", names)
        self.assertIn("summary.csv", names)
        manifest = json.loads(zf.read("manifest.json"))
        self.assertEqual(len(manifest["documents_included"]), 1)
        self.assertEqual({d["document_id"] for d in manifest["documents_skipped"]}, {str(self.gd.id), foreign})
        self.assertEqual(manifest["gaps"], ["GST return"])

        # Another user cannot download it
        other = APIClient(); other.force_authenticate(self.other)
        self.assertEqual(other.get(f"/api/compliance/audit-packages/{pkg.id}/download/").status_code, 404)

    def test_audit_package_not_ready(self):
        from apps.compliance.models import AuditPackage
        pkg = AuditPackage.objects.create(owner=self.user, name="P", status="generating")
        self.assertEqual(self.api.get(f"/api/compliance/audit-packages/{pkg.id}/download/").status_code, 409)

    # ── 8. workspace avg confidence ──────────────────────────────────
    def test_dashboard_avg_confidence_null_when_no_answers(self):
        r = self.api.get("/api/copilot/dashboard/")
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.data["avg_confidence"])
