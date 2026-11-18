"""Request helpers shared across apps."""
from django.conf import settings


def get_client_ip(request) -> str:
    """
    Client IP for audit logs, sessions and rate limiting.

    X-Forwarded-For is attacker-controlled unless a trusted reverse proxy sets it,
    so it is only honoured when TRUST_X_FORWARDED_FOR=True (set this when running
    behind nginx / a load balancer). We take the right-most address appended by
    NUM_PROXIES trusted proxies, not the left-most one the client can forge.
    """
    if request is None:
        return "0.0.0.0"
    meta = getattr(request, "META", {})
    if getattr(settings, "TRUST_X_FORWARDED_FOR", False):
        xff = meta.get("HTTP_X_FORWARDED_FOR", "")
        if xff:
            parts = [p.strip() for p in xff.split(",") if p.strip()]
            n = max(1, int(getattr(settings, "NUM_PROXIES", 1)))
            if parts:
                return parts[-n] if len(parts) >= n else parts[0]
    return meta.get("REMOTE_ADDR") or "0.0.0.0"
