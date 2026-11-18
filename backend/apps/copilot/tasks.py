"""Background jobs for Copilot."""
import logging
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(acks_late=True, soft_time_limit=600, time_limit=660)
def generate_report_task(report_id: str):
    from .services.report_generator import run_report
    return run_report(report_id)
