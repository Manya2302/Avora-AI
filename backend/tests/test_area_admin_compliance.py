"""Admin compliance overview: platform-wide roll-up of per-user compliance data.

    python manage.py test tests.test_area_admin_compliance -v 2
"""
import uuid
from datetime import timedelta

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

CACHE = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "admin-compliance"}}


@override_settings(CACHES=CACHE)
class AdminComplianceOverviewTest(TestCase):
    def setUp(self):
        cache.clear()
        from django.contrib.auth import get_user_model
        from apps.compliance.models import ComplianceProfile, MissingDocument, ExpiryAlert, ComplianceRisk
        U = get_user_model()
        self.admin = U.objects.create_user(email="adm@t.io", password="Str0ng-pass-123", full_name="Ada", role="admin")
        self.a = U.objects.create_user(email="a@t.io", password="Str0ng-pass-123", full_name="A", role="user")
        self.b = U.objects.create_user(email="b@t.io", password="Str0ng-pass-123", full_name="B", role="user")
        now = timezone.now()
        today = now.date()
        ComplianceProfile.objects.create(owner=self.a, industry="ca_firm", compliance_score=40, audit_readiness_pct=50, last_scored_at=now)
        ComplianceProfile.objects.create(owner=self.b, industry="law_firm", compliance_score=80, audit_readiness_pct=90, last_scored_at=now)
        MissingDocument.objects.create(owner=self.a, name="GST return", priority="high")
        MissingDocument.objects.create(owner=self.a, name="Old", priority="low", is_resolved=True)
        alert = lambda d, **kw: ExpiryAlert.objects.create(owner=self.b, document_id=uuid.uuid4(), doc_name="x", doc_type="contract",
                                                           expiry_date=today + timedelta(days=d), alert_type="expiring_30", **kw)
        alert(-3); alert(10); alert(60); alert(5, is_dismissed=True)
        ComplianceRisk.objects.create(owner=self.b, document_id=uuid.uuid4(), doc_name="x", compliance_standard="GDPR",
                                      risk_type="Missing Clause", severity="critical", description="d", suggested_fix="f")
        self.api = APIClient()

    def test_rollup(self):
        self.api.force_authenticate(self.admin)
        r = self.api.get("/api/admin-panel/compliance/")
        self.assertEqual(r.status_code, 200)
        d = r.data
        self.assertEqual(d["profiles"]["count"], 2)
        self.assertEqual(d["profiles"]["avg_score"], 60.0)
        self.assertEqual(d["lowest_scores"][0]["owner__email"], "a@t.io")
        self.assertEqual(d["missing_documents"]["open"], 1)
        self.assertEqual(d["missing_documents"]["users_affected"], 1)
        self.assertEqual(d["expiry"], {"expired": 1, "next_30_days": 1, "next_90_days": 2})
        self.assertEqual(d["risks"]["open"], 1)

    def test_empty_platform_has_no_invented_averages(self):
        from apps.compliance.models import ComplianceProfile
        ComplianceProfile.objects.all().delete()
        self.api.force_authenticate(self.admin)
        r = self.api.get("/api/admin-panel/compliance/")
        self.assertIsNone(r.data["profiles"]["avg_score"])

    def test_non_admin_forbidden(self):
        self.api.force_authenticate(self.a)
        self.assertEqual(self.api.get("/api/admin-panel/compliance/").status_code, 403)
