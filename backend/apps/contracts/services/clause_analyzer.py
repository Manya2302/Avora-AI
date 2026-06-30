import re, logging
from apps.contracts.models import ContractAnalysis, ContractClause
logger = logging.getLogger(__name__)

CLAUSE_PATTERNS = {
    "termination":    ["terminat","cancel","discontinue","end of agreement"],
    "renewal":        ["renew","auto-renewal","automatic extension","rollover"],
    "payment":        ["payment terms","invoice","due date","net 30","late fee"],
    "liability":      ["liability","indemnif","hold harmless","limitation of liability"],
    "confidentiality":["confidential","non-disclosure","nda","proprietary"],
    "penalty":        ["penalty","liquidated damages","breach","damages"],
    "force_majeure":  ["force majeure","act of god","unforeseen"],
    "dispute":        ["dispute","arbitration","mediation","jurisdiction"],
    "governing_law":  ["governed by","governing law","applicable law"],
    "non_compete":    ["non-compete","restraint of trade"],
    "sla":            ["service level","sla","uptime","response time"],
    "warranty":       ["warranty","representation","guarantee"],
}
RED_KW    = ["unlimited liability","perpetual","irrevocable","waive all rights","solely responsible"]
YELLOW_KW = ["auto-renewal","automatic renewal","penalty","non-compete","exclusive","liquidated"]

def analyze_clauses(contract, text) -> list:
    paras   = [p.strip() for p in re.split(r"\n{2,}|(?=\d+\.\s+[A-Z])", text) if len(p.strip()) > 80][:50]
    created = []
    for para in paras:
        pl = para.lower()
        ctype = _detect(pl)
        if not ctype: continue
        risk, reason = _risk(pl)
        cl, new = ContractClause.objects.get_or_create(
            contract=contract, clause_type=ctype,
            defaults={"title":f"{ctype.replace('_',' ').title()} Clause",
                      "raw_text":para[:2000],"ai_summary":_summary(para),
                      "risk_flag":risk,"risk_reason":reason,"is_standard":risk=="green"})
        if new: created.append({"type":ctype,"risk":risk})
    return created

def _detect(text):
    best, bc = None, 0
    for ctype, kws in CLAUSE_PATTERNS.items():
        c = sum(1 for k in kws if k in text)
        if c > bc: best, bc = ctype, c
    return best if bc > 0 else None

def _risk(text):
    for k in RED_KW:
        if k in text: return "red", f"High-risk: \"{k}\""
    for k in YELLOW_KW:
        if k in text: return "yellow", f"Review: \"{k}\""
    return "green", ""

def _summary(text):
    sents = [s.strip() for s in text.split(".") if len(s.strip()) > 20]
    return ". ".join(sents[:2]) + "." if sents else ""
