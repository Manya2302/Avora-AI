"""
Auth / authorization hardening tests.
    python manage.py test tests.test_security_hardening
"""
import uuid

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

CACHE = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "sec-tests"}}


@override_settings(CACHES=CACHE)
class AuthHardeningTests(TestCase):
    def setUp(self):
        cache.clear()
        from django.contrib.auth import get_user_model
        self.U = get_user_model()
        self.user = self.U.objects.create_user(email="Alice@Corp.io", password="Str0ng-pass-123", full_name="Alice")
        self.c = APIClient()

    def login(self, email="alice@corp.io", pw="Str0ng-pass-123", client=None):
        return (client or self.c).post("/api/auth/login/", {"email": email, "password": pw}, format="json")

    def auth(self, access):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        return c

    def test_login_is_case_insensitive_and_binds_session(self):
        r = self.login()
        self.assertEqual(r.status_code, 200, r.data)
        from rest_framework_simplejwt.tokens import AccessToken
        sid = AccessToken(r.data["access"])["sid"]
        from apps.users.models import UserSession
        s = UserSession.objects.get(id=sid)
        self.assertTrue(s.is_active)
        self.assertNotIn(r.data["access"][:40], s.session_key)   # raw token no longer stored
        self.assertEqual(self.auth(r.data["access"]).get("/api/users/me/").status_code, 200)

    def test_lockout_after_repeated_failures(self):
        for _ in range(5):
            self.assertEqual(self.login(pw="wrong-password").status_code, 401)
        r = self.login()  # correct password, but account is locked
        self.assertEqual(r.status_code, 429)

    def test_revoked_session_kills_access_and_refresh(self):
        r = self.login()
        access, refresh = r.data["access"], r.data["refresh"]
        api = self.auth(access)
        sid = api.get("/api/users/sessions/").data["results"][0]["id"]
        self.assertEqual(api.delete(f"/api/users/sessions/{sid}/").status_code, 200)
        self.assertEqual(self.auth(access).get("/api/users/me/").status_code, 401)
        self.assertEqual(APIClient().post("/api/auth/token/refresh/", {"refresh": refresh}, format="json").status_code, 401)

    def test_logout_ends_session_immediately(self):
        r = self.login()
        api = self.auth(r.data["access"])
        self.assertEqual(api.post("/api/auth/logout/", {"refresh": r.data["refresh"]}, format="json").status_code, 200)
        self.assertEqual(self.auth(r.data["access"]).get("/api/users/me/").status_code, 401)

    def test_change_password_revokes_other_sessions_only(self):
        a = self.login().data
        b = self.login().data
        api = self.auth(a["access"])
        r = api.post("/api/users/change-password/", {"current_password": "Str0ng-pass-123",
                                                      "new_password": "N3w-Str0ng-pass!", "confirm_password": "N3w-Str0ng-pass!"},
                     format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.auth(a["access"]).get("/api/users/me/").status_code, 200)
        self.assertEqual(self.auth(b["access"]).get("/api/users/me/").status_code, 401)

    def test_otp_hashed_attempt_limited_and_reset_revokes(self):
        from apps.users.models import PasswordResetOTP
        from apps.users import security
        tokens = self.login().data
        codes = []
        orig = security.generate_otp
        security.generate_otp = lambda: codes.append(orig()) or codes[-1]
        try:
            self.c.post("/api/auth/forgot-password/", {"email": "ALICE@corp.io"}, format="json")
        finally:
            security.generate_otp = orig
        otp = PasswordResetOTP.objects.get(user=self.user, is_used=False)
        self.assertNotEqual(otp.otp_code, codes[0])           # never stored in plaintext
        self.assertEqual(len(otp.otp_code), 64)

        r = self.c.post("/api/auth/reset-password/", {"email": "alice@corp.io", "otp_code": codes[0],
                                                       "new_password": "Brand-N3w-pass!", "confirm_password": "Brand-N3w-pass!"},
                        format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(self.auth(tokens["access"]).get("/api/users/me/").status_code, 401)  # signed out everywhere
        self.assertEqual(self.login(pw="Brand-N3w-pass!").status_code, 200)

    def test_otp_burned_after_too_many_wrong_codes(self):
        from apps.users import security
        codes = []
        orig = security.generate_otp
        security.generate_otp = lambda: codes.append(orig()) or codes[-1]
        try:
            self.c.post("/api/auth/forgot-password/", {"email": "alice@corp.io"}, format="json")
        finally:
            security.generate_otp = orig
        wrong = "000000" if codes[0] != "000000" else "111111"
        for _ in range(security.OTP_MAX_ATTEMPTS):
            self.assertIsNone(security.find_valid_otp(self.user, wrong))
        # Correct code no longer works: the OTP was burned after too many wrong guesses
        self.assertIsNone(security.find_valid_otp(self.user, codes[0]))
        from apps.users.models import PasswordResetOTP
        self.assertFalse(PasswordResetOTP.objects.filter(user=self.user, is_used=False).exists())

    def test_profile_plan_not_user_writable(self):
        api = self.auth(self.login().data["access"])
        api.patch("/api/users/profile/", {"plan": "enterprise", "city": "Pune"}, format="json")
        from apps.users.models import UserProfile
        p = UserProfile.objects.get(user=self.user)
        self.assertEqual(p.plan, "free")
        self.assertEqual(p.city, "Pune")


@override_settings(CACHES=CACHE)
class AuthorizationTests(TestCase):
    def setUp(self):
        cache.clear()
        from django.contrib.auth import get_user_model
        from apps.documents.models import Document, DocumentMetadata
        U = get_user_model()
        self.owner = U.objects.create_user(email="owner@t.io", password="Str0ng-pass-123", full_name="Owner")
        self.attacker = U.objects.create_user(email="mallory@t.io", password="Str0ng-pass-123", full_name="Mallory")
        self.doc = Document.objects.create(owner=self.owner, original_name="secret.pdf", storage_key=str(uuid.uuid4()),
                                           file_extension="pdf", status="ai_ready")
        DocumentMetadata.objects.create(document=self.doc)
        self.api = APIClient()
        self.api.force_authenticate(self.attacker)

    def test_cannot_hijack_visibility_of_foreign_document(self):
        r = self.api.patch(f"/api/org/visibility/{self.doc.id}/", {"visibility": "organization"}, format="json")
        self.assertEqual(r.status_code, 404)
        from apps.organizations.models import DocumentVisibility
        self.assertFalse(DocumentVisibility.objects.filter(document_id=self.doc.id, owner=self.attacker).exists())
        from apps.organizations.permissions import get_accessible_document_ids
        self.assertNotIn(str(self.doc.id), get_accessible_document_ids(self.attacker))

    def test_owner_can_share_and_value_is_validated(self):
        api = APIClient(); api.force_authenticate(self.owner)
        self.assertEqual(api.patch(f"/api/org/visibility/{self.doc.id}/", {"visibility": "bogus"}, format="json").status_code, 400)
        self.assertEqual(api.patch(f"/api/org/visibility/{self.doc.id}/", {"visibility": "organization"}, format="json").status_code, 200)
        from apps.organizations.permissions import get_accessible_document_ids
        self.assertIn(str(self.doc.id), get_accessible_document_ids(self.attacker))

    def test_ai_insights_idor_blocked(self):
        from apps.ai.models import DocumentSummary
        DocumentSummary.objects.create(document_id=self.doc.id, short_summary="Q3 layoffs planned")
        for path in (f"/api/ai/insights/{self.doc.id}/", f"/api/ai/pipeline/{self.doc.id}/",
                     f"/api/ai/recommendations/{self.doc.id}/"):
            r = self.api.get(path)
            self.assertEqual(r.status_code, 404, path)
            self.assertNotIn("layoffs", str(r.data))

    def test_graph_score_idor_blocked(self):
        from apps.ai.models import DocumentOCR
        DocumentOCR.objects.create(document_id=self.doc.id, cleaned_text="Confidential merger terms")
        r = self.api.post("/api/knowledge/score/", {"document_id": str(self.doc.id)}, format="json")
        self.assertEqual(r.status_code, 404)

    def test_private_prompt_template_not_usable_by_others(self):
        from apps.copilot.models import PromptTemplate
        tpl = PromptTemplate.objects.create(owner=self.owner, title="secret", prompt="TOP-SECRET-PROMPT", is_public=False)
        from django.db.models import Q
        visible = PromptTemplate.objects.filter(Q(is_builtin=True) | Q(is_public=True) | Q(owner=self.attacker), id=tpl.id)
        self.assertFalse(visible.exists())
        r = self.api.post("/api/copilot/prompts/create/", {"title": "x", "prompt": "y", "is_public": True,
                                                           "is_builtin": True}, format="json")
        self.assertEqual(r.status_code, 201)
        created = PromptTemplate.objects.get(id=r.data["id"])
        self.assertFalse(created.is_public)
        self.assertFalse(created.is_builtin)

    def test_oauth_state_single_use_and_xss_escaped(self):
        from apps.integrations.views import _issue_oauth_state, _consume_oauth_state
        st = _issue_oauth_state(self.owner.id, "google_drive")
        self.assertIsNone(_consume_oauth_state(st, "github"))          # wrong provider (and now burned)
        st = _issue_oauth_state(self.owner.id, "google_drive")
        self.assertEqual(_consume_oauth_state(st, "google_drive"), str(self.owner.id))
        self.assertIsNone(_consume_oauth_state(st, "google_drive"))    # replay rejected
        r = APIClient().get("/api/integrations/google-drive/callback/", {"error": "<script>alert(1)</script>"})
        self.assertEqual(r.status_code, 400)
        self.assertNotIn(b"<script>", r.content)
        self.assertTrue(r["Content-Type"].startswith("text/plain"))

    def test_health_endpoint(self):
        r = APIClient().get("/api/health/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["status"], "ok")
