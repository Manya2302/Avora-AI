"""DRF exception handler that never leaks internals to clients."""
import logging
import uuid

from django.core.exceptions import ObjectDoesNotExist, PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger("avora.errors")


def safe_exception_handler(exc, context):
    # Model.DoesNotExist raised from a view is a 404, not a 500
    if isinstance(exc, ObjectDoesNotExist):
        exc = Http404()
    if isinstance(exc, (ValueError, TypeError)) and getattr(exc, "_avora_client_error", False):
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    response = exception_handler(exc, context)
    if response is not None:
        return response

    # Unhandled → log full traceback server-side, give the client an opaque reference id
    ref = uuid.uuid4().hex[:12]
    view = context.get("view").__class__.__name__ if context.get("view") else "?"
    logger.exception(f"[{ref}] Unhandled error in {view}")
    return Response({"error": "Internal server error.", "reference": ref},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def client_error(message: str) -> ValueError:
    e = ValueError(message)
    e._avora_client_error = True
    return e


def int_param(value, default: int, lo: int, hi: int) -> int:
    """Parse and clamp an integer request parameter (no 500s on bad input, no huge values)."""
    try:
        v = int(value)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, v))
