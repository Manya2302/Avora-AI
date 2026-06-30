import logging
from datetime import date, timedelta
from apps.contracts.models import ContractAnalysis, ContractRenewal
logger = logging.getLogger(__name__)

def setup_renewal_tracking(contract) -> dict | None:
    if not contract.expiry_date: return None
    today        = date.today()
    days_until   = (contract.expiry_date - today).days
    notice_days  = contract.notice_period_days or 30
    notice_date  = contract.expiry_date - timedelta(days=notice_days)
    r, _ = ContractRenewal.objects.update_or_create(
        contract=contract,
        defaults={"renewal_due":contract.expiry_date,"notice_deadline":notice_date,"days_until":days_until})
    return {"renewal_due":str(contract.expiry_date),"notice_deadline":str(notice_date),
            "days_until":days_until,"urgency":"critical" if days_until<=30 else "high" if days_until<=60 else "normal"}

def get_upcoming_renewals(owner, days=90) -> list:
    today  = date.today()
    cutoff = today + timedelta(days=days)
    rs = ContractRenewal.objects.filter(
        contract__owner=owner, renewal_due__gte=today, renewal_due__lte=cutoff, is_completed=False
    ).select_related("contract").order_by("renewal_due")
    return [{"contract_id":str(r.contract.id),"title":r.contract.title,"party_b":r.contract.party_b,
             "renewal_due":str(r.renewal_due),"notice_deadline":str(r.notice_deadline) if r.notice_deadline else None,
             "days_until":r.days_until,"action":r.action,
             "value":str(r.contract.contract_value) if r.contract.contract_value else None} for r in rs]
