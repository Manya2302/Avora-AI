"""Liveness / readiness endpoint for load balancers and monitoring."""
import time

from django.core.cache import cache
from django.db import connection
from django.http import JsonResponse


def health(request):
    """GET /api/health/ — 200 when DB + cache work; ?deep=1 also checks Qdrant.
    Exposes only up/down + latency, never configuration."""
    checks, ok = {}, True

    t = time.perf_counter()
    try:
        with connection.cursor() as c:
            c.execute("SELECT 1")
        checks["database"] = {"ok": True, "ms": round((time.perf_counter() - t) * 1000, 1)}
    except Exception:
        checks["database"] = {"ok": False}
        ok = False

    t = time.perf_counter()
    try:
        cache.set("health:ping", 1, 10)
        checks["cache"] = {"ok": cache.get("health:ping") == 1, "ms": round((time.perf_counter() - t) * 1000, 1)}
        ok = ok and checks["cache"]["ok"]
    except Exception:
        checks["cache"] = {"ok": False}
        ok = False

    if request.GET.get("deep") == "1":
        t = time.perf_counter()
        try:
            from utils.qdrant_client import get_client
            get_client().get_collections()
            checks["vector_store"] = {"ok": True, "ms": round((time.perf_counter() - t) * 1000, 1)}
        except Exception:
            checks["vector_store"] = {"ok": False}
            ok = False

    return JsonResponse({"status": "ok" if ok else "degraded", "checks": checks}, status=200 if ok else 503)
