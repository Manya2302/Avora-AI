"""
Avora AI — Summary Generation Service
Generates short / medium / long summaries using Ollama.
"""
import logging, requests
from django.conf import settings
logger = logging.getLogger(__name__)


def generate_summaries(document_id: str, text: str) -> dict:
    """Generate three levels of summary from document text."""
    if not text.strip():
        return {'short': '', 'medium': '', 'long': '', 'key_points': []}

    truncated = text[:6000]  # Keep within context window

    # Three independent LLM calls → run concurrently (was sequential: up to 3 x 90 s)
    from concurrent.futures import ThreadPoolExecutor
    prompts = [(f"Summarise this document in 1-2 sentences:\n\n{truncated}", 120), (f"Write a concise 1-paragraph summary of this document:\n\n{truncated}", 300), (f"Write a detailed analysis of this document including key parties, obligations, dates and risks:\n\n{truncated}", 600)]
    with ThreadPoolExecutor(max_workers=3) as ex:
        short, medium, long = ex.map(lambda a: _call_ollama(*a), prompts)
    points = _extract_key_points(truncated)

    # Persist to DB
    try:
        from apps.ai.models import DocumentSummary
        DocumentSummary.objects.update_or_create(
            document_id=document_id,
            defaults={
                'short_summary':  short,
                'medium_summary': medium,
                'long_summary':   long,
                'key_points':     points,
                'model_used':     getattr(settings, 'OLLAMA_CHAT_MODEL', 'llama3'),
            }
        )
    except Exception as e:
        logger.error(f"[Avora Summary] DB save error: {e}")

    return {'short': short, 'medium': medium, 'long': long, 'key_points': points}


def _call_groq(prompt: str, max_tokens: int):
    import os
    from utils.circuit_breaker import groq_cb
    key = getattr(settings, "GROQ_API_KEY", None) or os.getenv("GROQ_API_KEY")
    if not key or not groq_cb.is_healthy():
        return None
    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json={"model": os.getenv("GROQ_SUMMARY_MODEL", "llama-3.1-8b-instant"),
                  "messages": [{"role": "user", "content": prompt}],
                  "max_tokens": max_tokens, "temperature": 0.3},
            timeout=20,
        )
        if resp.status_code == 200:
            groq_cb.record_success()
            return resp.json()["choices"][0]["message"]["content"].strip()
        groq_cb.record_failure()
    except requests.RequestException:
        groq_cb.record_failure()
    return None


def _call_ollama(prompt: str, max_tokens: int = 300) -> str:
    """Groq first (seconds), then local Ollama, then the extractive fallback."""
    fast = _call_groq(prompt, max_tokens)
    if fast:
        return fast
    try:
        resp = requests.post(
            f"{settings.OLLAMA_HOST}/api/generate",
            json={
                "model":  getattr(settings, 'OLLAMA_CHAT_MODEL', 'llama3'),
                "prompt": prompt,
                "stream": False,
                "options": {"num_predict": max_tokens, "temperature": 0.3},
            },
            timeout=90,
        )
        resp.raise_for_status()
        return resp.json().get('response', '').strip()
    except Exception as e:
        logger.warning(f"[Avora Summary] Ollama unavailable: {e}")
        return _fallback_summary(prompt)


def _fallback_summary(text: str) -> str:
    """Rule-based fallback when Ollama is unavailable."""
    sentences = [s.strip() for s in text.replace('\n', ' ').split('.') if len(s.strip()) > 20]
    return '. '.join(sentences[:2]) + '.' if sentences else ''


def _extract_key_points(text: str) -> list:
    """Extract key bullet-point facts from text."""
    import re
    points = []
    # Amounts
    amounts = re.findall(r'(?:₹|Rs\.?|INR|USD|\$)\s*[\d,]+(?:\.\d{2})?', text)
    if amounts:
        points.append(f"Amount: {amounts[0]}")
    # Dates
    dates = re.findall(r'\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b', text)
    if dates:
        points.append(f"Date: {dates[0]}")
    # Org names (simple heuristic)
    orgs = re.findall(r'\b[A-Z][a-zA-Z]+ (?:Pvt|Ltd|Inc|Corp|LLP|LLC|Co)\b', text)
    for o in orgs[:2]:
        points.append(f"Organisation: {o}")
    # Page count estimate
    words = len(text.split())
    points.append(f"Approx. {max(1, words // 250)} page(s), {words:,} words")
    return points[:8]
