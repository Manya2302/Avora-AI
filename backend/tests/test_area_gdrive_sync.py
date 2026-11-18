"""
Google Drive sync session endpoints: cancel / confirm / progress / retry.
All Google calls and background dispatch are mocked — no network.

    python manage.py test tests.test_area_gdrive_sync -v 2
"""
from unittest.mock import patch, MagicMock

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.integrations.models import (
    IntegrationConfig, IntegrationProvider, SyncStatus, GDriveSyncSession, GDriveFileStatus,
)

CACHE = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "gdsync"}}
BASE = "/api/integrations/google-drive"


@override_settings(CACHES=CACHE)
class GDriveSyncSessionTests(TestCase):
    def setUp(self):
        cache.clear()
        from django.contrib.auth import get_user_model
        U = get_user_model()
        self.user = U.objects.create_user(email="gd@t.io", password="Str0ng-pass-123", full_name="GD")
        self.other = U.objects.create_user(email="gd2@t.io", password="Str0ng-pass-123", full_name="GD2")
        self.integration = IntegrationConfig.objects.create(
            user=self.user, provider=IntegrationProvider.GOOGLE_DRIVE, status=SyncStatus.CONNECTED,
            selected_folders=["f1"],
        )
        self.api = APIClient()
        self.api.force_authenticate(self.user)
        p = patch("apps.integrations.views.dispatch")
        self.dispatch = p.start()
        self.addCleanup(p.stop)
        p2 = patch("rest_framework.throttling.SimpleRateThrottle.allow_request", return_value=True)
        p2.start()
        self.addCleanup(p2.stop)

    def _prescanned(self, **kw):
        defaults = dict(integration=self.integration, total_files=5, supported_files=4,
                        unsupported_files=1, current_phase="queued", overall_status="running",
                        elapsed_seconds=42)
        defaults.update(kw)
        return GDriveSyncSession.objects.create(**defaults)

    # ── cancel ────────────────────────────────────────────────────────────────
    def test_cancel_prescanned_session(self):
        s = self._prescanned()
        r = self.api.post(f"{BASE}/cancel/", {"session_id": str(s.id)}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        s.refresh_from_db()
        self.assertEqual(s.overall_status, "cancelled")
        self.assertIsNotNone(s.finished_at)
        # progress reflects it
        r = self.api.get(f"{BASE}/progress/", {"session_id": str(s.id)})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["session"]["overall_status"], "cancelled")
        # idempotent
        r = self.api.post(f"{BASE}/cancel/", {"session_id": str(s.id)}, format="json")
        self.assertEqual(r.status_code, 200)

    def test_cancel_during_scan(self):
        s = self._prescanned(current_phase="scanning", total_files=0, elapsed_seconds=0)
        r = self.api.post(f"{BASE}/cancel/", {"session_id": str(s.id)}, format="json")
        self.assertEqual(r.status_code, 200)

    def test_cannot_cancel_started_import(self):
        s = self._prescanned(current_phase="downloading", files_queued=4)
        r = self.api.post(f"{BASE}/cancel/", {"session_id": str(s.id)}, format="json")
        self.assertEqual(r.status_code, 409)
        s.refresh_from_db()
        self.assertEqual(s.overall_status, "running")

    def test_cannot_cancel_completed(self):
        s = self._prescanned(current_phase="completed", overall_status="completed")
        r = self.api.post(f"{BASE}/cancel/", {"session_id": str(s.id)}, format="json")
        self.assertEqual(r.status_code, 409)

    def test_cancel_other_users_session_is_404(self):
        s = self._prescanned()
        api = APIClient()
        api.force_authenticate(self.other)
        IntegrationConfig.objects.create(user=self.other, provider=IntegrationProvider.GOOGLE_DRIVE,
                                         status=SyncStatus.CONNECTED)
        r = api.post(f"{BASE}/cancel/", {"session_id": str(s.id)}, format="json")
        self.assertEqual(r.status_code, 404)
        s.refresh_from_db()
        self.assertEqual(s.overall_status, "running")

    def test_cancel_bad_input(self):
        for body in ({}, {"session_id": "not-a-uuid"}):
            r = self.api.post(f"{BASE}/cancel/", body, format="json")
            self.assertEqual(r.status_code, 404)

    # ── confirm ───────────────────────────────────────────────────────────────
    def test_confirm_dispatches_sync(self):
        s = self._prescanned()
        r = self.api.post(f"{BASE}/confirm/", {"session_id": str(s.id)}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.dispatch.call_count, 1)

    def test_confirm_cancelled_session_refused(self):
        s = self._prescanned(overall_status="cancelled")
        r = self.api.post(f"{BASE}/confirm/", {"session_id": str(s.id)}, format="json")
        self.assertEqual(r.status_code, 409)
        self.dispatch.assert_not_called()

    # ── retry ─────────────────────────────────────────────────────────────────
    def test_retry_reopens_session_and_moves_failed_back_to_queue(self):
        s = self._prescanned(current_phase="completed", overall_status="completed",
                             files_completed=2, files_failed=2, error_log=[{"file": "a", "reason": "x"}])
        for i in range(2):
            GDriveFileStatus.objects.create(session=s, gdrive_file_id=f"g{i}", file_name=f"f{i}", status="failed")
        r = self.api.post(f"{BASE}/retry/", {"session_id": str(s.id)}, format="json")
        self.assertEqual(r.status_code, 200)
        s.refresh_from_db()
        self.assertEqual(s.overall_status, "running")
        self.assertEqual(s.files_failed, 0)
        self.assertEqual(s.files_queued, 2)
        self.assertEqual(s.error_log, [])
        self.assertEqual(self.dispatch.call_count, 1)

    # ── tasks honour cancellation / finalise retry ────────────────────────────
    def test_prescan_does_not_resurrect_cancelled_session(self):
        from apps.integrations import tasks
        s = self._prescanned(total_files=0, elapsed_seconds=0, current_phase="scanning")

        def _list(service, folder_id):
            # user cancels while the scan is listing Drive
            GDriveSyncSession.objects.filter(id=s.id).update(overall_status="cancelled")
            return [{"id": "x", "name": "a.pdf", "mimeType": "application/pdf", "size": "10"}], 0

        with patch.object(tasks, "_get_refreshed_credentials", return_value=MagicMock()), \
             patch.object(tasks, "build", return_value=MagicMock()), \
             patch.object(tasks, "_list_all_files", side_effect=_list):
            tasks.prescan_google_drive_folder(str(self.integration.id), str(s.id))
        s.refresh_from_db()
        self.assertEqual(s.overall_status, "cancelled")
        self.assertEqual(s.total_files, 0)

    def test_retry_task_marks_session_completed(self):
        from apps.integrations import tasks
        s = self._prescanned(current_phase="downloading", overall_status="running", files_queued=1)
        GDriveFileStatus.objects.create(session=s, gdrive_file_id="g", file_name="f.pdf", status="failed")
        with patch.object(tasks, "_get_refreshed_credentials", return_value=MagicMock()), \
             patch.object(tasks, "build", return_value=MagicMock()), \
             patch.object(tasks, "_process_single_file", return_value=None):
            tasks.retry_failed_files(str(s.id))
        s.refresh_from_db()
        self.assertEqual(s.overall_status, "completed")
        self.assertIsNotNone(s.finished_at)
