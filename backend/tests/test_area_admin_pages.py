"""Admin console pages: users (search/filters/role/status guards), documents, audits, security,
storage breakdowns and the read-only settings endpoint.

    python manage.py test tests.test_area_admin_pages -v 2
"""
import uuid

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

CACHE = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "admin-pages"}}


@override_settings(CACHES=CACHE)
class AdminPagesTest(TestCase):
    def setUp(self):
        cache.clear()
        from django.contrib.auth import get_user_model
        from apps.documents.models import Document
        from apps.audit.models import AuditLog
        U = get_user_model()
        self.U = U
        self.admin = U.objects.create_user(email="adm@t.io", password="Str0ng-pass-123", full_name="Ada Admin", role="admin")
        self.member = U.objects.create_user(email="mem@t.io", password="Str0ng-pass-123", full_name="Mo Member", role="user")
        self.viewer = U.objects.create_user(email="vee@t.io", password="Str0ng-pass-123", full_name="Vee", role="viewer")
        mk = lambda **kw: Document.objects.create(owner=self.member, storage_key=str(uuid.uuid4()), **kw)
        mk(original_name="invoice.pdf", file_extension="pdf", status="ai_ready", original_size=1000, compressed_size=400, encrypted_size=420)
        mk(original_name="sheet.xlsx", file_extension="xlsx", status="failed", original_size=500, compressed_size=200, encrypted_size=210)
        mk(original_name="gone.pdf", file_extension="pdf", status="ai_ready", encrypted_size=999, is_deleted=True)
        AuditLog.objects.create(user=self.member, action="login", resource="", ip_address="10.0.0.7", is_flagged=True)
        AuditLog.objects.create(user=self.member, action="view", resource="/api/documents/x/", ip_address="10.0.0.8")
        self.api = APIClient()
        self.api.force_authenticate(self.admin)

    # ── users ──────────────────────────────────────────────────
    def test_user_list_has_usage_and_search(self):
        r = self.api.get("/api/admin-panel/users/")
        self.assertEqual(r.status_code, 200)
        rows = {u["email"]: u for u in r.data["results"]}
        self.assertEqual(rows["mem@t.io"]["document_count"], 2)        # deleted doc excluded
        self.assertEqual(rows["mem@t.io"]["storage_bytes"], 630)
        self.assertEqual(rows["adm@t.io"]["storage_bytes"], 0)
        r = self.api.get("/api/admin-panel/users/", {"search": "member"})
        self.assertEqual([u["email"] for u in r.data["results"]], ["mem@t.io"])
        r = self.api.get("/api/admin-panel/users/", {"role": "viewer"})
        self.assertEqual([u["email"] for u in r.data["results"]], ["vee@t.io"])

    def test_change_role_and_reactivate(self):
        from apps.audit.models import AuditLog
        url = f"/api/admin-panel/users/{self.member.pk}/"
        r = self.api.patch(url, {"role": "viewer"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["role"], "viewer")
        self.assertTrue(AuditLog.objects.filter(resource=f"admin:change_role:{self.member.pk}", is_flagged=True).exists())
        r = self.api.patch(url, {"is_active": False}, format="json")
        self.assertEqual(r.status_code, 200)
        self.member.refresh_from_db(); self.assertFalse(self.member.is_active)
        r = self.api.patch(url, {"is_active": True}, format="json")
        self.assertEqual(r.status_code, 200)
        self.member.refresh_from_db(); self.assertTrue(self.member.is_active)
        r = self.api.patch(url, {"role": "superuser"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_cannot_change_self(self):
        url = f"/api/admin-panel/users/{self.admin.pk}/"
        self.assertEqual(self.api.patch(url, {"role": "user"}, format="json").status_code, 400)
        self.assertEqual(self.api.patch(url, {"is_active": False}, format="json").status_code, 400)
        self.assertEqual(self.api.delete(url).status_code, 400)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.role, "admin"); self.assertTrue(self.admin.is_active)
        # renaming yourself is still fine
        self.assertEqual(self.api.patch(url, {"full_name": "Ada A."}, format="json").status_code, 200)

    def test_cannot_demote_last_admin(self):
        other = self.U.objects.create_user(email="adm2@t.io", password="Str0ng-pass-123", full_name="Two", role="admin")
        api2 = APIClient(); api2.force_authenticate(other)
        # two admins: other may demote the first one…
        self.assertEqual(api2.patch(f"/api/admin-panel/users/{self.admin.pk}/", {"role": "user"}, format="json").status_code, 200)
        # …but now `other` is the last admin; re-promote and try to demote other via first? first is no longer admin.
        self.U.objects.filter(pk=self.admin.pk).update(role="admin", is_active=False)
        r = self.api.patch(f"/api/admin-panel/users/{other.pk}/", {"role": "user"}, format="json")
        self.assertEqual(r.status_code, 400)   # the only *active* admin

    def test_delete_deactivates(self):
        r = self.api.delete(f"/api/admin-panel/users/{self.member.pk}/")
        self.assertEqual(r.status_code, 204)
        self.member.refresh_from_db(); self.assertFalse(self.member.is_active)

    def test_non_admin_forbidden(self):
        api = APIClient(); api.force_authenticate(self.member)
        for path in ("users/", "documents/", "audits/", "security/", "storage/", "settings/"):
            self.assertEqual(api.get(f"/api/admin-panel/{path}").status_code, 403, path)

    # ── documents / audits / security ──────────────────────────
    def test_documents_owner_search_and_filters(self):
        r = self.api.get("/api/admin-panel/documents/")
        self.assertEqual(r.data["count"], 2)
        self.assertEqual(r.data["results"][0]["owner_email"], "mem@t.io")
        self.assertEqual(self.api.get("/api/admin-panel/documents/", {"status": "failed"}).data["count"], 1)
        self.assertEqual(self.api.get("/api/admin-panel/documents/", {"file_extension": "pdf"}).data["count"], 1)
        self.assertEqual(self.api.get("/api/admin-panel/documents/", {"search": "Mo Member"}).data["count"], 2)
        self.assertEqual(self.api.get("/api/admin-panel/documents/", {"search": "sheet"}).data["count"], 1)
        self.assertEqual(self.api.get("/api/admin-panel/documents/", {"owner": str(self.admin.pk)}).data["count"], 0)

    def test_audit_filters(self):
        self.assertEqual(self.api.get("/api/admin-panel/audits/", {"is_flagged": "true"}).data["count"], 1)
        self.assertEqual(self.api.get("/api/admin-panel/audits/", {"action": "view"}).data["count"], 1)
        self.assertEqual(self.api.get("/api/admin-panel/audits/", {"search": "mem@t.io"}).data["count"], 2)

    def test_security_search(self):
        r = self.api.get("/api/admin-panel/security/", {"action": "login"})
        self.assertEqual(r.data["count"], 1)
        self.assertEqual(self.api.get("/api/admin-panel/security/", {"action": "view"}).data["count"], 0)
        # actions outside AuditLog.Action (written by the login lockout code) still filter
        from apps.audit.models import AuditLog
        AuditLog.objects.create(action="login_failed", resource="x@t.io", is_flagged=True)
        self.assertEqual(self.api.get("/api/admin-panel/security/", {"action": "login_failed"}).data["count"], 1)
        self.assertEqual(self.api.get("/api/admin-panel/audits/", {"action": "login_failed"}).data["count"], 1)

    # ── storage / settings ─────────────────────────────────────
    def test_storage_breakdowns(self):
        d = self.api.get("/api/admin-panel/storage/").data
        self.assertEqual(d["total_encrypted_bytes"], 630)
        self.assertEqual({r["status"]: r["count"] for r in d["by_status"]}, {"ai_ready": 1, "failed": 1})
        self.assertEqual(d["by_owner"][0]["owner__email"], "mem@t.io")
        self.assertEqual(d["by_owner"][0]["size"], 630)

    @override_settings(GROQ_API_KEY="sk-very-secret", COHERE_API_KEY=None, GEMINI_API_KEY=None,
                       MINIO_SECRET_KEY="minio-secret", USE_MOCK_STORAGE=True)
    def test_settings_is_read_only_and_secret_free(self):
        r = self.api.get("/api/admin-panel/settings/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["ai"]["cloud_providers"], ["Groq"])
        self.assertTrue(r.data["storage"]["use_mock_storage"])
        body = r.content.decode()
        self.assertNotIn("sk-very-secret", body)
        self.assertNotIn("minio-secret", body)
        self.assertNotIn("http://", body)
        self.assertIn(self.api.post("/api/admin-panel/settings/", {}).status_code, (405,))
