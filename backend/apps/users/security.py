"""
Avora — Authentication security primitives
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  • Login brute-force protection: per-account and per-IP failure counters with
    temporary lockout (cache-backed; Redis in production → shared across workers).
  • Real session revocation: every JWT carries a `sid` claim bound to a UserSession
    row. Revoking a session (logout, "revoke", password change/reset) makes its
    access AND refresh tokens stop working immediately — not after they expire.
    The active-check is cached, so it costs no DB query on most requests.
  • Password-reset OTPs: CSPRNG codes, stored as HMAC (never plaintext), single
    active code per user, limited verification attempts, per-email request limit.
"""
import hashlib
import hmac
import logging
import secrets

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from rest_framework.exceptions import Throttled

logger = logging.getLogger(__name__)

# ── Login lockout ────────────────────────────────────────────────────────
ACCOUNT_MAX_FAILURES = 5
IP_MAX_FAILURES = 30
LOCKOUT_SECONDS = 15 * 60


def _norm(email: str) -> str:
    return (email or "").strip().lower()


def _k_acct(email):
    return f"auth:fail:acct:{hashlib.sha256(_norm(email).encode()).hexdigest()[:32]}"


def _k_ip(ip):
    return f"auth:fail:ip:{ip}"


def check_login_allowed(email: str, ip: str):
    """Raise 429 if this account or IP is temporarily locked."""
    if (cache.get(_k_acct(email)) or 0) >= ACCOUNT_MAX_FAILURES or (cache.get(_k_ip(ip)) or 0) >= IP_MAX_FAILURES:
        raise Throttled(wait=LOCKOUT_SECONDS,
                        detail="Too many failed sign-in attempts. Please try again later.")


def _incr(key):
    if cache.add(key, 1, LOCKOUT_SECONDS):
        return 1
    try:
        return cache.incr(key)
    except ValueError:
        cache.set(key, 1, LOCKOUT_SECONDS)
        return 1


def register_login_failure(email: str, ip: str, user_agent: str = ""):
    n = _incr(_k_acct(email))
    _incr(_k_ip(ip))
    if n == ACCOUNT_MAX_FAILURES:
        logger.warning(f"[Auth] account locked for {LOCKOUT_SECONDS // 60} min after {n} failures (ip={ip})")
    _audit_login_failure(email, ip, user_agent, attempt=n, locked=n >= ACCOUNT_MAX_FAILURES)


def _audit_login_failure(email: str, ip: str, user_agent: str, attempt: int, locked: bool):
    """Flagged audit entry (admin "security events"). Never allowed to break login."""
    try:
        from django.contrib.auth import get_user_model
        from apps.audit.models import AuditLog
        email = (email or "").strip()[:254]
        user = get_user_model().objects.filter(email__iexact=email).only("id").first() if email else None
        try:
            from ipaddress import ip_address as _parse_ip
            ip_value = str(_parse_ip(ip)) if ip else None
        except ValueError:
            ip_value = None
        AuditLog.objects.create(
            user=user, action="login_failed", resource=email, ip_address=ip_value,
            user_agent=(user_agent or "")[:500], is_flagged=True,
            extra_data={"email": email, "attempt": attempt, "account_locked": locked,
                        "known_account": user is not None},
        )
    except Exception as e:
        logger.warning(f"[Auth] could not audit failed login: {e}")


def clear_login_failures(email: str):
    cache.delete(_k_acct(email))


# ── Session binding / revocation ────────────────────────────────────────
SESSION_CACHE_TTL = 300
TOUCH_INTERVAL = 300


def _k_sess(sid):
    return f"auth:sess:{sid}"


def session_is_active(sid, user_id) -> bool:
    key = _k_sess(sid)
    cached = cache.get(key)
    if cached is None:
        from .models import UserSession
        cached = UserSession.objects.filter(id=sid, user_id=user_id, is_active=True).exists()
        cache.set(key, cached, SESSION_CACHE_TTL)
    if cached and cache.add(f"auth:touch:{sid}", 1, TOUCH_INTERVAL):
        # at most one write per session every 5 minutes
        from .models import UserSession
        UserSession.objects.filter(id=sid).update(last_active_at=timezone.now())
    return bool(cached)


def revoke_sessions(queryset):
    """Deactivate sessions and invalidate their cached active-state immediately."""
    ids = list(queryset.filter(is_active=True).values_list("id", flat=True))
    if ids:
        queryset.model.objects.filter(id__in=ids).update(is_active=False)
        cache.set_many({_k_sess(i): False for i in ids}, 24 * 3600)
    return len(ids)


# ── Password-reset OTP ──────────────────────────────────────────────────
OTP_TTL_MINUTES = 10
OTP_MAX_ATTEMPTS = 5
OTP_REQUESTS_PER_WINDOW = 3
OTP_REQUEST_WINDOW = 15 * 60


def generate_otp() -> str:
    return f"{secrets.randbelow(10 ** 6):06d}"


def hash_otp(user_id, code: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), f"{user_id}:{code}".encode(), hashlib.sha256).hexdigest()


def otp_request_allowed(email: str) -> bool:
    key = f"auth:otp:req:{hashlib.sha256(_norm(email).encode()).hexdigest()[:32]}"
    return _incr_window(key, OTP_REQUEST_WINDOW) <= OTP_REQUESTS_PER_WINDOW


def _incr_window(key, ttl):
    if cache.add(key, 1, ttl):
        return 1
    try:
        return cache.incr(key)
    except ValueError:
        cache.set(key, 1, ttl)
        return 1


def otp_attempts_exceeded(user_id) -> bool:
    return (cache.get(f"auth:otp:fail:{user_id}") or 0) >= OTP_MAX_ATTEMPTS


def register_otp_failure(user_id):
    """After too many wrong codes the active OTP is burned; the user must request a new one."""
    n = _incr_window(f"auth:otp:fail:{user_id}", OTP_TTL_MINUTES * 60)
    if n >= OTP_MAX_ATTEMPTS:
        from .models import PasswordResetOTP
        PasswordResetOTP.objects.filter(user_id=user_id, is_used=False).update(is_used=True)


def clear_otp_failures(user_id):
    cache.delete(f"auth:otp:fail:{user_id}")


def find_valid_otp(user, code: str):
    from .models import PasswordResetOTP
    if otp_attempts_exceeded(user.id):
        return None
    otp = (PasswordResetOTP.objects
           .filter(user=user, otp_code=hash_otp(user.id, code), is_used=False, expires_at__gt=timezone.now())
           .order_by("-created_at").first())
    if otp is None:
        register_otp_failure(user.id)
    return otp


def send_new_signin_email(email: str, ip: str, user_agent: str):
    """Opt-in (preferences.login_notif): tell the user about a sign-in from an unseen IP/browser."""
    import threading
    from django.core.mail import send_mail
    when = timezone.now().strftime("%d %b %Y, %H:%M UTC")

    def _send():
        try:
            send_mail("New sign-in to your Avora account",
                      f"Your account was signed in to on {when}.\n"
                      f"IP address: {ip}\nBrowser: {user_agent or 'unknown'}\n\n"
                      "If this wasn't you, change your password and sign out all other sessions in Settings.",
                      getattr(settings, "DEFAULT_FROM_EMAIL", None), [email], fail_silently=True)
        except Exception as e:
            logger.warning(f"[Auth] sign-in email failed: {e}")

    threading.Thread(target=_send, daemon=True).start()


def send_otp_email(email: str, code: str):
    """Send asynchronously so SMTP latency never slows the API response."""
    import threading
    from django.core.mail import send_mail

    def _send():
        try:
            send_mail("Your Avora password reset code",
                      f"Your verification code is {code}. It expires in {OTP_TTL_MINUTES} minutes.\n"
                      "If you did not request this, you can ignore this email.",
                      getattr(settings, "DEFAULT_FROM_EMAIL", None), [email], fail_silently=True)
        except Exception as e:
            logger.warning(f"[Auth] OTP email failed: {e}")

    if settings.DEBUG:
        logger.info(f"[DEV OTP] {email}: {code}")
    threading.Thread(target=_send, daemon=True).start()
