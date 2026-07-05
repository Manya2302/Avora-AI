import re
import json
import logging
import requests
import os
from django.conf import settings

logger = logging.getLogger(__name__)

def extract_contract_data(text: str) -> dict:
    """
    Uses an LLM to accurately extract structured contract details from text,
    falling back to regex if the LLM fails.
    """
    groq_key = getattr(settings, "GROQ_API_KEY", os.getenv("GROQ_API_KEY"))
    
    if groq_key:
        prompt = '''You are an expert legal AI. Extract the following metadata from the provided contract text.
Return ONLY a raw JSON object (no markdown, no quotes, no preamble) with these exact keys:
{
  "party_a": "string (name of first party)",
  "party_b": "string (name of second party)",
  "effective_date": "YYYY-MM-DD",
  "expiry_date": "YYYY-MM-DD",
  "contract_value": number (extract the total value, remove currency symbols),
  "currency": "string (e.g., USD, INR)",
  "notice_period": number (days),
  "auto_renewal": boolean,
  "contract_type": "string (e.g., MSA, NDA, Vendor Agreement)"
}
If a field is not found, set its value to null. Format dates strictly as YYYY-MM-DD.

DOCUMENT TEXT:
''' + text[:5000]

        try:
            resp = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "system", "content": prompt}],
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"}
                },
                timeout=15
            )
            if resp.status_code == 200:
                data = json.loads(resp.json()['choices'][0]['message']['content'])
                return {
                    "parties": {"party_a": data.get("party_a") or "", "party_b": data.get("party_b") or ""},
                    "effective_date": data.get("effective_date"),
                    "expiry_date": data.get("expiry_date"),
                    "contract_value": data.get("contract_value"),
                    "currency": data.get("currency") or "",
                    "notice_period": data.get("notice_period"),
                    "auto_renewal": bool(data.get("auto_renewal")),
                    "contract_type": data.get("contract_type") or "General Agreement",
                    "key_obligations": _obligations(text),
                    "key_dates": []
                }
        except Exception as e:
            logger.warning(f"[Contract Extractor] LLM extraction failed: {e}")

    # Fallback to regex
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
    # Regex fallback for alphanumeric dates too
    for l in labels:
        m = re.search(rf"{l}[:\s]+(\d{{1,2}}[/-]\d{{1,2}}[/-]\d{{2,4}}|\d{{4}}-\d{{2}}-\d{{2}}|\d{{1,2}}\s+[a-zA-Z]+\s+\d{{4}})", text, re.I)
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
