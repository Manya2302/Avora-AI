import logging
from apps.contracts.models import ContractAnalysis, ContractRisk
logger = logging.getLogger(__name__)

RULES = [
    {"title":"Unlimited Liability","severity":"critical","kw":["unlimited liability","no cap on liability"],"cat":"Financial","rec":"Negotiate a liability cap (1-2× contract value)."},
    {"title":"Auto-Renewal Without Notice","severity":"high","kw":["automatically renew","auto-renewal","unless terminated"],"cat":"Renewal","rec":"Set a calendar reminder 90 days before renewal."},
    {"title":"Broad Indemnification","severity":"high","kw":["indemnify","hold harmless","defend against all"],"cat":"Legal","rec":"Limit to direct damages caused by your actions."},
    {"title":"Unilateral Amendment Right","severity":"high","kw":["may amend at any time","sole discretion","reserves the right to modify"],"cat":"Legal","rec":"Negotiate mutual consent for amendments."},
    {"title":"Unreasonable Payment Penalty","severity":"medium","kw":["penalty","late fee","liquidated damages","interest at"],"cat":"Financial","rec":"Clarify penalty thresholds."},
    {"title":"Vague Termination","severity":"medium","kw":["for any reason","at will","without cause"],"cat":"Legal","rec":"Define specific termination triggers."},
    {"title":"IP Ownership Ambiguity","severity":"medium","kw":["work for hire","assigns all rights","all intellectual property"],"cat":"IP","rec":"Define IP ownership boundaries explicitly."},
    {"title":"Non-Compete Restriction","severity":"medium","kw":["non-compete","restraint of trade"],"cat":"Employment","rec":"Review jurisdiction enforceability."},
    {"title":"Short Notice Period","severity":"low","kw":["7 days notice","14 days notice"],"cat":"Operational","rec":"Negotiate at least 30-60 days."},
    {"title":"Unusual Governing Law","severity":"low","kw":["governed by the laws of","exclusive jurisdiction"],"cat":"Legal","rec":"Confirm comfort with governing jurisdiction."},
]

def detect_risks(contract, text) -> list:
    tl      = text.lower()
    created = []
    for rule in RULES:
        if any(k in tl for k in rule["kw"]):
            r, new = ContractRisk.objects.get_or_create(
                contract=contract, title=rule["title"],
                defaults={"description":f"Detected: {rule['title']}","severity":rule["severity"],
                          "category":rule["cat"],"recommendation":rule["rec"]})
            if new: created.append({"title":rule["title"],"severity":rule["severity"]})
    sevs = list(ContractRisk.objects.filter(contract=contract).values_list("severity",flat=True))
    overall = ("critical" if "critical" in sevs else "high" if "high" in sevs else "medium" if "medium" in sevs else "low")
    ContractAnalysis.objects.filter(pk=contract.pk).update(
        risk_level=overall, risk_score={"critical":0.9,"high":0.7,"medium":0.45,"low":0.2}.get(overall,0.2))
    return created
