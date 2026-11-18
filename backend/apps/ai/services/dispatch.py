"""
Avora AI — Pipeline dispatch
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
With CELERY_TASK_ALWAYS_EAGER=True (dev setup), `.delay()` ran the whole AI pipeline
INSIDE the upload HTTP request: a 100 MB / 300-page upload blocked the request for
minutes and could time out. When eager mode is on, we hand the task to a bounded
in-process background pool instead, so the upload returns immediately and the UI
polls status/progress as it would with a real worker. With a Celery worker
(eager off) nothing changes: the task is queued on the broker.
"""
import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor

from django.conf import settings
from django.db import connection

logger = logging.getLogger(__name__)

_pool = None
_pool_lock = threading.Lock()


def _get_pool():
    global _pool
    with _pool_lock:
        if _pool is None:
            _pool = ThreadPoolExecutor(max_workers=int(os.getenv("AI_INPROCESS_WORKERS", "2")),
                                       thread_name_prefix="avora-ai")
        return _pool


def _run_inline(task, args):
    try:
        task.apply(args=args)
    except Exception:
        logger.exception(f"[Dispatch] background {task.name} failed")
    finally:
        try:
            connection.close()
        except Exception:
            pass


def dispatch(task, *args):
    """Queue a Celery task; in eager mode run it on the background pool instead."""
    from django.db import transaction
    if getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False) and getattr(settings, "AI_BACKGROUND_IN_EAGER", True):
        # on_commit: the worker thread must see the rows the request just wrote
        transaction.on_commit(lambda: _get_pool().submit(_run_inline, task, list(args)))
        return None
    transaction.on_commit(lambda: task.delay(*args))
    return None


def dispatch_document_processing(document_id: str):
    from apps.documents.tasks import process_document_ai
    return dispatch(process_document_ai, str(document_id))
