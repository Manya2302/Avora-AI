"""
Background jobs (reports, contract analysis) and organization tenancy.
    python manage.py test tests.test_async_and_tenancy
"""
import uuid
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

CACHE = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "async-tenancy"}}


def _run_inline(task, *args):
    """Stand-in for dispatch(): run the job synchronously so the test can observe the result."""
    task.apply(args=list(args))


@override_settings(CACHES=CACHE, GROQ_API_KEY=None, OLLAMA_HOST="http://127.0.0.1:9")
class BackgroundJobTests(TestCase):
    def setUp(self):
        cache.clear()
        from django.contrib.auth import get_user_model
        from apps.documents.models import Document, DocumentMetadata
        from apps.ai.models import DocumentOCR
        self.user = get_user_model().objects.create_user(email="jobs@t.io", password="Str0ng-pass-123", full_name="J")
        self.doc = Document.objects.create(owner=self.user, original_name="msa.pdf", storage_key=str(uuid.uuid4()),
                                           file_extension="pdf", status="ai_ready")
        DocumentMetadata.objects.create(document=self.doc)
        DocumentOCR.objects.create(document_id=self.doc.id, status="completed",
                                   cleaned_text="Master Services Agreement between Acme Ltd and Beta Corp. "
                                                "Effective 01/01/2025. Expires 31/12/2026. Auto-renewal applies.")
        self.api = APIClient()
        self.api.force_authenticate(self.user)

    def test_report_returns_202_then_completes(self):
        with patch("apps.ai.services.dispatch.dispatch") as d, \
             patch("apps.copilot.services.report_generator._call_ollama",
                   return_value="Executive Summary: all good.\n1. Finding one\nRecommendations:\n- Do X"):
            r = self.api.post("/api/copilot/reports/generate/", {"report_type": "risk_assessment"}, format="json")
            self.assertEqual(r.status_code, 202, r.data)
            self.assertEqual(r.data["status"], "generating")
            rid = r.data["report_id"]
            self.assertEqual(self.api.get(f"/api/copilot/reports/{rid}/").data["status"], "generating")
            task, *args = d.call_args[0]
            _run_inline(task, *args)
        final = self.api.get(f"/api/copilot/reports/{rid}/").data
        self.assertEqual(final["status"], "ready")
        self.assertIn("all good", final["full_content"])

    def test_report_failure_is_reported_not_raised(self):
        with patch("apps.ai.services.dispatch.dispatch") as d, \
             patch("apps.copilot.services.report_generator._call_ollama", side_effect=RuntimeError("boom")):
            rid = self.api.post("/api/copilot/reports/generate/", {}, format="json").data["report_id"]
            task, *args = d.call_args[0]
            _run_inline(task, *args)
        self.assertEqual(self.api.get(f"/api/copilot/reports/{rid}/").data["status"], "failed")

    def test_contract_analysis_returns_202_then_ready(self):
        fake = {"parties": {"party_a": "Acme Ltd", "party_b": "Beta Corp"}, "contract_type": "MSA",
                "effective_date": "01/01/2025", "expiry_date": "31/12/2026", "auto_renewal": True}
        with patch("apps.ai.services.dispatch.dispatch") as d, \
             patch("apps.contracts.services.contract_extractor.extract_contract_data", return_value=fake):
            r = self.api.post("/api/contracts/analyze/", {"document_id": str(self.doc.id)}, format="json")
            self.assertEqual(r.status_code, 202, r.data)
            cid = r.data["contract_id"]
            self.assertEqual(self.api.get(f"/api/contracts/{cid}/").data["analysis_status"], "running")
            task, *args = d.call_args[0]
            _run_inline(task, *args)
        c = self.api.get(f"/api/contracts/{cid}/").data
        self.assertEqual(c["analysis_status"], "ready")
        self.assertEqual(c["party_a"], "Acme Ltd")
        self.assertEqual(str(c["expiry_date"]), "2026-12-31")
        listed = self.api.get("/api/contracts/").data["results"][0]
        self.assertIn("risk_count", listed)
        self.assertEqual(listed["analysis_status"], "ready")

    def test_contract_analysis_rejects_foreign_or_bad_ids(self):
        from django.contrib.auth import get_user_model
        other = get_user_model().objects.create_user(email="o@t.io", password="x", full_name="O")
        api = APIClient(); api.force_authenticate(other)
        self.assertEqual(api.post("/api/contracts/analyze/", {"document_id": str(self.doc.id)}, format="json").status_code, 404)
        self.assertEqual(api.post("/api/contracts/analyze/", {"document_id": "nope"}, format="json").status_code, 400)


@override_settings(CACHES=CACHE)
class TenancyTests(TestCase):
    def setUp(self):
        cache.clear()
        from django.contrib.auth import get_user_model
        from apps.organizations.models import Organization, Department, OrgMember, DocumentVisibility
        from apps.documents.models import Document, DocumentMetadata
        U = get_user_model()
        self.acme = Organization.objects.create(name="Acme")
        self.globex = Organization.objects.create(name="Globex")
        self.acme_fin = Department.objects.create(name="Finance", organization=self.acme)
        self.globex_fin = Department.objects.create(name="Finance", organization=self.globex)

        def member(email, org, dept, staff=False):
            u = U.objects.create_user(email=email, password="Str0ng-pass-123", full_name=email.split("@")[0],
                                      is_staff=staff)
            OrgMember.objects.create(user=u, organization=org, department=dept)
            return u
        self.alice = member("alice@acme.io", self.acme, self.acme_fin, staff=True)
        self.bob = member("bob@acme.io", self.acme, None)
        self.eve = member("eve@globex.io", self.globex, self.globex_fin, staff=True)

        self.doc = Document.objects.create(owner=self.alice, original_name="acme-plan.pdf",
                                           storage_key=str(uuid.uuid4()), file_extension="pdf", status="ai_ready")
        DocumentMetadata.objects.create(document=self.doc)
        DocumentVisibility.objects.create(document_id=self.doc.id, owner=self.alice, visibility="organization")

    def api(self, user):
        c = APIClient(); c.force_authenticate(user); return c

    def test_directory_is_scoped_to_organization(self):
        emails = {m["user_email"] for m in self.api(self.bob).get("/api/org/members/").data["results"]}
        self.assertEqual(emails, {"alice@acme.io", "bob@acme.io"})
        self.assertNotIn("eve@globex.io", str(self.api(self.alice).get("/api/org/tree/").data))
        depts = self.api(self.eve).get("/api/org/departments/").data
        rows = depts["results"] if isinstance(depts, dict) else depts
        self.assertEqual([d["id"] for d in rows], [str(self.globex_fin.id)])

    def test_organization_visibility_does_not_cross_tenants(self):
        from apps.organizations.permissions import get_accessible_document_ids
        self.assertIn(str(self.doc.id), get_accessible_document_ids(self.bob))
        self.assertNotIn(str(self.doc.id), get_accessible_document_ids(self.eve))

    def test_admin_cannot_pull_or_assign_across_tenants(self):
        r = self.api(self.eve).post("/api/org/members/assign/", {"user_id": str(self.bob.id),
                                                                  "department_id": str(self.globex_fin.id)}, format="json")
        self.assertEqual(r.status_code, 404)
        r = self.api(self.alice).post("/api/org/members/assign/", {"user_id": str(self.bob.id),
                                                                    "department_id": str(self.globex_fin.id)}, format="json")
        self.assertEqual(r.status_code, 400)
        r = self.api(self.alice).post("/api/org/members/assign/", {"user_id": str(self.bob.id),
                                                                    "department_id": str(self.acme_fin.id)}, format="json")
        self.assertEqual(r.status_code, 201)
        r = self.api(self.eve).post("/api/org/departments/", {"name": "Ops", "parent": str(self.acme_fin.id)}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_sharing_cannot_target_other_tenant(self):
        r = self.api(self.alice).patch(f"/api/org/visibility/{self.doc.id}/",
                                       {"visibility": "user_share", "allowed_user_ids": [str(self.eve.id), str(self.bob.id)]},
                                       format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["allowed_user_ids"], [self.bob.id])

    @override_settings(SIGNUP_ORGANIZATION_MODE="isolated")
    def test_isolated_signup_gets_own_organization(self):
        r = APIClient().post("/api/auth/register/", {"email": "new@startup.io", "full_name": "New", "company_name": "Startup",
                                                     "password": "Str0ng-pass-123", "confirm_password": "Str0ng-pass-123"},
                             format="json")
        self.assertEqual(r.status_code, 201, r.data)
        from apps.organizations.models import OrgMember
        m = OrgMember.objects.select_related("organization").get(user__email="new@startup.io")
        self.assertEqual(m.organization.name, "Startup")
        self.assertNotIn(m.organization_id, (self.acme.id, self.globex.id))
