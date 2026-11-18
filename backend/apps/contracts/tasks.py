"""Background jobs for contracts."""
from celery import shared_task


@shared_task(acks_late=True, soft_time_limit=600, time_limit=660)
def analyze_contract_task(document_id: str, owner_id: str):
    from .services.analysis import run_contract_analysis
    return run_contract_analysis(document_id, owner_id)
