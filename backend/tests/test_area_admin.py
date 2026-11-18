"""Admin console: dashboard counts and system-health checks.

    python manage.py test tests.test_area_admin -v 2
"""
import uuid
from datetime import timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

CACHE = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "admin-area"}}


@override_settings(CACHES=CACHE)
class AdminAreaTest(TestCase):
    def setUp(self):
        cache.clear()
        from django.contrib.auth import get_user_model
        from apps.documents.models import Document
        from apps.audit.models import AuditLog
        U = get_user_model()
        self.admin = U.objects.create_user(email="adm@t.io", password="Str0ng-pass-123", full_name="Ada Admin", role="admin")
        self.member = U.objects.create_user(email="mem@t.io", password="Str0ng-pass-123", full_name="Mem", role="user")
        old = U.objects.create_user(email="old@t.io", password="Str0ng-pass-123", full_name="Old", role="user")
        U.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=30))
        Document.objects.create(owner=self.member, original_name="a.pdf", storage_key=str(uuid.uuid4()),
                                file_extension="pdf", status="ai_ready",
                                original_size=1000, compressed_size=400, encrypted_size=420)
        AuditLog.objects.create(user=self.admin, action="settings", resource="admin:deactivate_user:x", is_flagged=True)
        AuditLog.objects.create(user=self.admin, action="view", resource="/api/documents/x/")
        self.api = APIClient()
        self.api.force_authenticate(self.admin)

    def test_dashboard_counts_are_real(self):
        r = self.api.get("/api/admin-panel/dashboard/")
        self.assertEqual(r.status_code, 200)
        d = r.data
        self.assertEqual(d["total_users"], 3)
        self.assertEqual(d["users_new_7d"], 2)
        self.assertEqual(d["total_documents"], 1)
        self.assertEqual(d["documents_today"], 1)
        self.assertEqual(d["storage_bytes"], 420)
        self.assertEqual(d["original_bytes"], 1000)
        self.assertEqual(d["compressed_bytes"], 400)
        self.assertEqual(d["security_alerts"], 1)
        self.assertEqual(d["security_alerts_24h"], 1)
        self.assertIn("ai_failed", d)

    def test_security_lists_flagged_only(self):
        r = self.api.get("/api/admin-panel/security/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data["results"]), 1)
        self.assertEqual(r.data["results"][0]["resource"], "admin:deactivate_user:x")

    @override_settings(USE_MOCK_STORAGE=True, CELERY_TASK_ALWAYS_EAGER=True, GROQ_API_KEY="k",
                       QDRANT_URL=None, QDRANT_HOST="127.0.0.1", QDRANT_PORT=9)
    def test_system_health_shape(self):
        r = self.api.get("/api/admin-panel/system-health/")
        self.assertEqual(r.status_code, 200)
        rows = {c["key"]: c for c in r.data["checks"]}
        self.assertEqual(set(rows), {"database", "vector_store", "storage", "broker", "ai_provider"})
        self.assertTrue(rows["database"]["ok"])
        self.assertFalse(rows["vector_store"]["ok"])          # nothing listens on port 9
        self.assertIsNone(rows["storage"]["ok"])              # mock storage → not applicable
        self.assertIsNone(rows["broker"]["ok"])               # eager mode → not applicable
        self.assertTrue(rows["ai_provider"]["ok"])
        self.assertIn("Groq", rows["ai_provider"]["status"])

    @override_settings(GROQ_API_KEY=None, COHERE_API_KEY=None, GEMINI_API_KEY=None,
                       OLLAMA_HOST="http://127.0.0.1:9", QDRANT_URL=None, QDRANT_HOST="127.0.0.1", QDRANT_PORT=9)
    def test_system_health_no_ai_provider(self):
        r = self.api.get("/api/admin-panel/system-health/")
        rows = {c["key"]: c for c in r.data["checks"]}
        self.assertFalse(rows["ai_provider"]["ok"])

    def test_non_admin_forbidden(self):
        self.api.force_authenticate(self.member)
        for url in ("/api/admin-panel/dashboard/", "/api/admin-panel/system-health/", "/api/admin-panel/security/"):
            self.assertEqual(self.api.get(url).status_code, 403, url)
