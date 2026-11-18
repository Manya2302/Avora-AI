"""
API smoke test: call every URL pattern as an authenticated user, with and without
an empty/garbage body, and fail on any 5xx. Catches crashes on bad input and
broken endpoints before users do.

    python manage.py test tests.test_api_smoke -v 2
"""
import re
import uuid
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import get_resolver, URLPattern, URLResolver
from rest_framework.test import APIClient

CACHE = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache", "LOCATION": "smoke"}}

SKIP = (
    "django-admin", "api/docs", "api/redoc", "swagger", "media/",
    "upload/chunk",          # multipart, covered by ingestion tests
)


def _walk(patterns, prefix=""):
    for p in patterns:
        if isinstance(p, URLResolver):
            yield from _walk(p.url_patterns, prefix + str(p.pattern))
        elif isinstance(p, URLPattern):
            yield prefix + str(p.pattern), p


def _fill(route: str, doc_id: str) -> str:
    route = route.lstrip("^").rstrip("$")
    route = re.sub(r"<uuid:\w+>", doc_id, route)
    route = re.sub(r"<int:\w+>", "1", route)
    route = re.sub(r"<(str:|slug:)?\w+>", "test", route)
    route = re.sub(r"\(\?P<\w+>[^)]+\)", "test", route)   # router regex groups
    route = route.replace("\\.", ".").replace("(?P<format>[a-z0-9]+)/?", "")
    return "/" + route


def _no_network(*a, **k):
    raise ConnectionError("network disabled in smoke test")


@override_settings(CACHES=CACHE, COHERE_API_KEY=None, GROQ_API_KEY=None, GEMINI_API_KEY=None,
                   OLLAMA_HOST="http://127.0.0.1:9", VISION_PROVIDER="none")
class ApiSmokeTest(TestCase):
    def setUp(self):
        cache.clear()
        from django.contrib.auth import get_user_model
        from apps.documents.models import Document, DocumentMetadata
        U = get_user_model()
        self.user = U.objects.create_user(email="smoke@t.io", password="Str0ng-pass-123", full_name="Smoke",
                                          role="admin")
        self.doc = Document.objects.create(owner=self.user, original_name="a.pdf", storage_key=str(uuid.uuid4()),
                                           file_extension="pdf", status="ai_ready")
        DocumentMetadata.objects.create(document=self.doc)
        self.api = APIClient()
        self.api.force_authenticate(self.user)
        # Never touch real external services from tests
        from qdrant_client import QdrantClient
        import utils.qdrant_client as qc
        import apps.ai.services.vector_store as vs
        self._orig_q = qc._client
        qc._client = QdrantClient(":memory:")
        vs._ready = False

    def tearDown(self):
        import utils.qdrant_client as qc
        qc._client = self._orig_q

    def test_no_endpoint_crashes(self):
        import requests
        failures, checked = [], 0
        self.codes, self.not_found = {}, []
        with patch.object(requests, "post", _no_network), patch.object(requests, "get", _no_network), \
             patch.object(requests.Session, "request", _no_network),              patch("rest_framework.throttling.SimpleRateThrottle.allow_request", return_value=True),              patch("apps.users.security.check_login_allowed", return_value=None):
            for route, pat in _walk(get_resolver().url_patterns):
                if any(s in route for s in SKIP) or "(?P<format>" in route:
                    continue
                url = _fill(route, str(self.doc.id))
                for method, body in (("get", None), ("post", {}), ("post", {"document_id": "not-a-uuid", "top_k": "x",
                                                                         "days": "abc", "question": "q"}),
                                     ("patch", {"visibility": 123}), ("delete", None)):
                    try:
                        r = getattr(self.api, method)(url, body, format="json") if body is not None \
                            else getattr(self.api, method)(url)
                        if r.status_code in (301, 302, 308) and r.get("Location"):
                            loc = r["Location"]
                            r = getattr(self.api, method)(loc, body, format="json") if body is not None                                 else getattr(self.api, method)(loc)
                        code = r.status_code
                    except Exception as e:  # exception escaped the view entirely
                        code = f"EXC {type(e).__name__}: {str(e)[:120]}"
                    checked += 1
                    self.codes[code if isinstance(code, int) else 'EXC'] = self.codes.get(code if isinstance(code, int) else 'EXC', 0) + 1
                    if code == 404 and method == 'get':
                        self.not_found.append(url)
                    if not isinstance(code, int) or code >= 500:
                        failures.append(f"{method.upper():6} {url}  →  {code}")
        print(f"\n    checked {checked} method/endpoint combinations; status mix: "
              f"{dict(sorted(self.codes.items(), key=str))}")
        print("    GET 404s:", *self.not_found[:60], sep="\n      ")
        self.assertEqual(failures, [], "\n" + "\n".join(failures))
