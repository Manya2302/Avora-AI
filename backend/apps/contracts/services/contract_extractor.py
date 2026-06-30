import re

def extract_contract_data(text: str) -> dict:
    return {
        "parties":        _parties(text),
        "effective_date": _date(text, ["effective date","commencement date","dated"]),
        "expiry_date":    _date(text, ["expiry date","expiration date","valid until","end date"]),
        "contract_value": _value(text),
        "currency":       _currency(text),
        "notice_period":  _notice(text),
        "auto_renewal":   bool(re.search(r"auto.?renew|automatically renew|unless.*terminat", text, re.I)),
        "contract_type":  _type(text),
        "key_obligations":_obligations(text),
        "key_dates":      list(set(re.findall(r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b", text)))[:8],
    }

def _parties(text):
    m = re.search(r"(?:between|agreement between)\s+([A-Z][^\n,]{5,60})\s+(?:and|,)\s+([A-Z][^\n,]{5,60})", text, re.I)
    return {"party_a": m.group(1).strip() if m else "", "party_b": m.group(2).strip() if m else ""}

def _date(text, labels):
    for l in labels:
        m = re.search(rf"{l}[:\s]+(\d{{1,2}}[/-]\d{{1,2}}[/-]\d{{2,4}}|\d{{4}}-\d{{2}}-\d{{2}})", text, re.I)
        if m: return m.group(1)
    return None

def _value(text):
    m = re.search(r"(?:contract value|total value|consideration)[:\s]+(?:₹|Rs\.?|INR|USD|\$)?\s*([\d,]+(?:\.\d{2})?)", text, re.I)
    if m:
        try: return float(m.group(1).replace(",",""))
        except: pass
    return None

def _currency(text):
    if re.search(r"₹|INR|Rs\.?", text): return "INR"
    if re.search(r"\$|USD", text): return "USD"
    return ""

def _notice(text):
    m = re.search(r"(\d+)\s+days?\s+(?:written\s+)?notice", text, re.I)
    return int(m.group(1)) if m else None

def _type(text):
    tl = text.lower()
    if "non-disclosure" in tl or "nda" in tl: return "NDA"
    if "employment" in tl or "offer letter" in tl: return "Employment Contract"
    if "vendor" in tl or "supplier" in tl: return "Vendor Agreement"
    if "lease" in tl or "rental" in tl: return "Lease Agreement"
    if "service" in tl: return "Service Agreement"
    return "General Agreement"

def _obligations(text):
    obs = []
    for s in text.split("."):
        if re.search(r"\b(shall|must|agrees? to|obliged to|required to)\b", s, re.I):
            c = s.strip()
            if 20 < len(c) < 200: obs.append(c)
    return obs[:5]
