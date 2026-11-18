"""
Query-count budgets for hot endpoints — fails if an N+1 creeps back in.
    python manage.py test tests.test_perf_budget -v 2
"""
import time
import uuid

from django.core.cache import cache
from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

CACHE = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "perf-tests"}}


@override_settings(CACHES=CACHE)
class PerfBudgetTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from django.contrib.auth import get_user_model
        from apps.organizations.models import Department, OrgRole, OrgMember
        from apps.documents.models import Document, DocumentMetadata
        U = get_user_model()
        cls.user = U.objects.create_user(email="perf@t.io", password="Str0ng-pass-123", full_name="Perf")
        OrgMember.objects.create(user=cls.user)   # every real user has a membership (backfilled)
        parent = None
        for d in range(30):                      # 30 departments, nested 3 deep, 5 members each
            dept = Department.objects.create(name=f"Dept {d}", parent=parent if d % 3 else None)
            parent = dept if d % 3 != 2 else None
            role = OrgRole.objects.create(name=f"Role {d}", level=5, department=dept)
            for m in range(5):
                u = U.objects.create_user(email=f"u{d}_{m}@t.io", password="x", full_name=f"U{d}{m}")
                OrgMember.objects.create(user=u, department=dept, role=role)
        for i in range(60):
            doc = Document.objects.create(owner=cls.user, original_name=f"doc{i}.pdf", storage_key=str(uuid.uuid4()),
                                          file_extension="pdf", status="ai_ready")
            DocumentMetadata.objects.create(document=doc, category="finance", tags=["a", "b"],
                                            ai_summary="Summary text " * 20)

    def setUp(self):
        cache.clear()
        self.api = APIClient()
        r = self.api.post("/api/auth/login/", {"email": "perf@t.io", "password": "Str0ng-pass-123"}, format="json")
        self.api.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        self.api.get("/api/users/me/")  # warm session cache

    def measure(self, path, budget, **kw):
        with CaptureQueriesContext(connection) as ctx:
            t = time.perf_counter()
            r = self.api.get(path, **kw)
            ms = (time.perf_counter() - t) * 1000
        self.assertEqual(r.status_code, 200, (path, getattr(r, "data", None)))
        print(f"\n    {path:<34} {len(ctx.captured_queries):>3} queries  {ms:6.1f} ms  {len(r.content):>7} B")
        self.assertLessEqual(len(ctx.captured_queries), budget, f"{path}: {len(ctx.captured_queries)} queries")
        return r

    def test_auth_overhead_per_request(self):
        # JWT user lookup only; revoked-session check is served from cache
        self.measure("/api/users/me/", 3)

    def test_org_tree_constant_queries(self):
        self.measure("/api/org/tree/", 6)  # was 2 per department (+ recursion) → 60+ for this org

    def test_document_list(self):
        r = self.measure("/api/documents/", 5, HTTP_ACCEPT_ENCODING="gzip")
        self.assertEqual(r.get("Content-Encoding"), "gzip")

    def test_dashboards(self):
        self.measure("/api/ai/dashboard/", 8)
        self.measure("/api/copilot/dashboard/", 7)
