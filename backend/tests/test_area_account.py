"""
Account area: profile summary, preferences, session revocation.
    python manage.py test tests.test_area_account
"""
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

CACHE = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "acct-tests"}}
PW = "Str0ng-pass-123"


@override_settings(CACHES=CACHE)
class AccountAreaTests(TestCase):
    def setUp(self):
        cache.clear()
        from django.contrib.auth import get_user_model
        self.user = get_user_model().objects.create_user(email="acct@corp.io", password=PW, full_name="Acct")
        self.other = get_user_model().objects.create_user(email="other@corp.io", password=PW, full_name="Other")

    def login(self, email="acct@corp.io", ua="UA-1"):
        c = APIClient(HTTP_USER_AGENT=ua)
        r = c.post("/api/auth/login/", {"email": email, "password": PW}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        api = APIClient()
        api.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        return api

    def _doc(self, owner, status, size=100, deleted=False):
        import uuid
        from apps.documents.models import Document
        return Document.objects.create(owner=owner, original_name="a.pdf", storage_key=str(uuid.uuid4()),
                                       file_extension="pdf", original_size=size, status=status, is_deleted=deleted)

    def test_summary_counts_only_own_live_documents(self):
        self._doc(self.user, "ai_ready", 100)
        self._doc(self.user, "encrypted", 50)
        self._doc(self.user, "processing", 25)
        self._doc(self.user, "ai_ready", 999, deleted=True)
        self._doc(self.other, "ai_ready", 999)
        self.login(ua="Old browser")
        api = self.login(ua="New browser")
        d = api.get("/api/users/me/summary/").data
        self.assertEqual((d["document_count"], d["encrypted_count"], d["storage_bytes"]), (3, 2, 175))
        self.assertIsNotNone(d["member_since"])
        self.assertEqual(d["last_sign_in"]["user_agent"], "Old browser")   # previous, not the current one
        self.assertFalse(d["last_sign_in"]["is_current"])

    def test_summary_first_sign_in_falls_back_to_current(self):
        d = self.login().get("/api/users/me/summary/").data
        self.assertEqual(d["document_count"], 0)
        self.assertTrue(d["last_sign_in"]["is_current"])

    def test_preferences_defaults_patch_and_validation(self):
        api = self.login()
        d = api.get("/api/users/me/preferences/").data
        self.assertEqual(d, {"login_notif": False, "upload_complete": True, "audit_digest": False})
        r = api.patch("/api/users/me/preferences/", {"audit_digest": True}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(api.get("/api/users/me/preferences/").data["audit_digest"])
        self.assertEqual(api.patch("/api/users/me/preferences/", {"bogus": True}, format="json").status_code, 400)
        self.assertEqual(api.patch("/api/users/me/preferences/", {"audit_digest": "yes"}, format="json").status_code, 400)
        # profile PATCH cannot bypass validation
        api.patch("/api/users/profile/", {"preferences": {"bogus": 1}}, format="json")
        self.assertNotIn("bogus", api.get("/api/users/me/preferences/").data)

    def test_login_notification_only_for_new_device_when_enabled(self):
        api = self.login(ua="UA-1")
        with patch("apps.users.security.send_new_signin_email") as m:
            self.login(ua="UA-2")
            m.assert_not_called()   # preference off by default
            api.patch("/api/users/me/preferences/", {"login_notif": True}, format="json")
            self.login(ua="UA-1")   # known device
            m.assert_not_called()
            self.login(ua="UA-3")   # new device
            m.assert_called_once()

    def test_revoke_others_keeps_current_session(self):
        self.login(ua="A")
        self.login(ua="B")
        api = self.login(ua="C")
        sessions = api.get("/api/users/sessions/").data["results"]
        self.assertEqual(len(sessions), 3)
        self.assertEqual(sum(s["is_current"] for s in sessions), 1)
        r = api.delete("/api/users/sessions/revoke-all/?keep_current=1")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["revoked"], 2)
        left = api.get("/api/users/sessions/").data["results"]
        self.assertEqual([s["is_current"] for s in left], [True])

    def test_failed_login_writes_flagged_audit_entry(self):
        from apps.audit.models import AuditLog
        c = APIClient(HTTP_USER_AGENT="Bad UA")
        r = c.post("/api/auth/login/", {"email": "ACCT@corp.io", "password": "wrong"}, format="json")
        self.assertEqual(r.status_code, 401)
        c.post("/api/auth/login/", {"email": "nobody@corp.io", "password": "wrong"}, format="json")
        known = AuditLog.objects.get(action="login_failed", resource="ACCT@corp.io")
        self.assertTrue(known.is_flagged)
        self.assertEqual(known.user, self.user)
        self.assertEqual(known.user_agent, "Bad UA")
        self.assertEqual(known.extra_data["attempt"], 1)
        unknown = AuditLog.objects.get(action="login_failed", resource="nobody@corp.io")
        self.assertIsNone(unknown.user)
        self.assertFalse(unknown.extra_data["known_account"])
        # audit failure must never break login
        with patch("apps.audit.models.AuditLog.objects.create", side_effect=RuntimeError("db down")):
            r = c.post("/api/auth/login/", {"email": "acct@corp.io", "password": "wrong"}, format="json")
            self.assertEqual(r.status_code, 401)
        self.login()   # correct password still works

    def test_revoke_single_session_scoped_to_owner(self):
        api = self.login()
        other_api = self.login(email="other@corp.io")
        other_sid = other_api.get("/api/users/sessions/").data["results"][0]["id"]
        self.assertEqual(api.delete(f"/api/users/sessions/{other_sid}/").status_code, 404)
