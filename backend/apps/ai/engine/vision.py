"""
Avora AI — Figure Understanding (charts, graphs, diagrams, photos)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OCR on a chart gives you "Q1 Q2 Q3 12 18 25" — useless for retrieval.
Here every figure goes to a vision-language model that returns a STRUCTURED
description: chart type, title, axes, series, the actual data points, and
the insight. That description is turned into a text chunk ("figure chunk")
and embedded, so a question like "which region had the highest Q3 revenue?"
matches the chart's meaning, not its pixels.

Providers (VISION_PROVIDER):
  auto    → gemini if GEMINI_API_KEY is set, else ollama if VISION_OLLAMA_MODEL is set, else none
  gemini  → Google Gemini (cloud; images leave your infrastructure)
  ollama  → local VLM via Ollama (e.g. qwen2.5vl:7b, llava:13b) — fully on-prem
  none    → no VLM; figure chunk = caption + labels found inside the figure

Runs figures concurrently (I/O bound), caches by image hash, retries 429/5xx,
and is protected by a circuit breaker.
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor

import requests
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

DECORATIVE_TYPES = {"logo", "decorative", "icon", "signature", "blank", "none", "stamp", "watermark"}

PROMPT = """You are indexing a figure from a business document for a search engine.
Describe ONLY what is visible. Never invent numbers. If a value is unreadable, omit it.
Return STRICT JSON, no markdown fences:
{
  "figure_type": "bar chart|line chart|pie chart|scatter plot|area chart|table image|flowchart|org chart|diagram|map|photo|screenshot|infographic|logo|decorative|signature|other",
  "title": "title shown in or above the figure, else a short descriptive title",
  "summary": "2-4 sentences: what the figure shows and its main takeaway",
  "axes": {"x": "label and unit", "y": "label and unit"},
  "series": ["legend entries / series names"],
  "data_points": ["label: value (unit)", "..."],
  "key_insights": ["highest/lowest values, trends, comparisons, totals, anomalies"],
  "text_in_figure": "all other readable text (labels, annotations, nodes in a diagram)"
}
For diagrams/flowcharts put the steps and relationships in data_points as "A -> B: relation".
For photos describe the subject in summary and leave data_points empty."""


def _provider() -> str:
    p = (getattr(settings, "VISION_PROVIDER", None) or os.getenv("VISION_PROVIDER", "auto")).lower()
    if p != "auto":
        return p
    if getattr(settings, "GEMINI_API_KEY", None) or os.getenv("GEMINI_API_KEY"):
        return "gemini"
    if os.getenv("VISION_OLLAMA_MODEL"):
        return "ollama"
    return "none"


def vision_enabled() -> bool:
    return _provider() in ("gemini", "ollama")


def _parse_json(text: str) -> dict | None:
    if not text:
        return None
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def _call_gemini(png: bytes, context: str) -> dict | None:
    key = getattr(settings, "GEMINI_API_KEY", None) or os.getenv("GEMINI_API_KEY")
    model = os.getenv("GEMINI_VISION_MODEL", "gemini-3.8-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    body = {
        "contents": [{"parts": [
            {"text": PROMPT + (f"\n\nSurrounding document text (for context only):\n{context}" if context else "")},
            {"inline_data": {"mime_type": "image/png", "data": base64.b64encode(png).decode()}},
        ]}],
        "generationConfig": {"temperature": 0.0, "responseMimeType": "application/json", "maxOutputTokens": 2048,
                             # Figure description is perception, not reasoning: low thinking = much lower latency
                             "thinkingConfig": {"thinkingLevel": os.getenv("GEMINI_THINKING_LEVEL", "low")}},
    }
    timeout = int(os.getenv("VISION_TIMEOUT", "90"))
    resp = requests.post(url, headers={"x-goog-api-key": key}, json=body, timeout=timeout)
    if resp.status_code == 400 and "thinking" in resp.text.lower():
        body["generationConfig"].pop("thinkingConfig", None)   # model without thinking controls
        resp = requests.post(url, headers={"x-goog-api-key": key}, json=body, timeout=timeout)
    if resp.status_code != 200:
        raise _HTTPError(resp.status_code, resp.text[:200])
    parts = resp.json().get("candidates", [{}])[0].get("content", {}).get("parts", [])
    return _parse_json("".join(p.get("text", "") for p in parts if not p.get("thought")))


def _call_ollama(png: bytes, context: str) -> dict | None:
    host = os.getenv("OLLAMA_HOST", getattr(settings, "OLLAMA_HOST", "http://localhost:11434"))
    model = os.getenv("VISION_OLLAMA_MODEL", "qwen2.5vl:7b")
    resp = requests.post(f"{host}/api/generate", json={
        "model": model,
        "prompt": PROMPT + (f"\n\nSurrounding text:\n{context}" if context else ""),
        "images": [base64.b64encode(png).decode()],
        "stream": False, "format": "json",
        "options": {"temperature": 0.0, "num_predict": 900},
    }, timeout=180)
    if resp.status_code != 200:
        raise _HTTPError(resp.status_code, resp.text[:200])
    return _parse_json(resp.json().get("response", ""))


class _HTTPError(Exception):
    def __init__(self, status, msg):
        super().__init__(f"{status}: {msg}")
        self.status = status


def describe_figure(png: bytes, context: str = "") -> dict | None:
    """Describe one figure. Cached by image hash. Returns parsed JSON dict or None."""
    from utils.circuit_breaker import vision_cb
    provider = _provider()
    if provider not in ("gemini", "ollama"):
        return None

    ck = "vision:v1:" + hashlib.sha256(png).hexdigest()
    hit = cache.get(ck)
    if hit is not None:
        return hit or None

    call = _call_gemini if provider == "gemini" else _call_ollama
    for attempt in range(3):
        if not vision_cb.is_healthy():
            return None
        try:
            data = call(png, context[:1500])
            vision_cb.record_success()
            cache.set(ck, data or {}, 60 * 60 * 24 * 30)
            return data
        except _HTTPError as e:
            if e.status in (429, 500, 502, 503, 504) and attempt < 2:
                time.sleep(1.5 * (2 ** attempt))
                continue
            vision_cb.record_failure()
            logger.warning(f"[Vision] {provider} error {e}")
            return None
        except requests.exceptions.RequestException as e:
            vision_cb.record_failure()
            logger.warning(f"[Vision] {provider} request failed: {e}")
            if attempt < 2:
                time.sleep(1.0 * (attempt + 1))
                continue
            return None
    return None


def figure_to_text(fig: dict, desc: dict | None) -> str | None:
    """Turn a figure + VLM description into a retrieval-friendly text chunk.
    Returns None for decorative images (logos, signatures)."""
    page = fig.get("page")
    caption = (fig.get("caption") or "").strip()
    inner = (fig.get("inner_text") or "").strip()

    if desc:
        ftype = str(desc.get("figure_type", "figure")).lower().strip()
        if ftype in DECORATIVE_TYPES:
            return None
        lines = [f"[FIGURE · page {page} · {ftype}] {desc.get('title') or caption or ''}".strip()]
        if caption:
            lines.append(f"Caption: {caption}")
        if desc.get("summary"):
            lines.append(f"Summary: {desc['summary']}")
        axes = desc.get("axes") or {}
        if isinstance(axes, dict) and (axes.get("x") or axes.get("y")):
            lines.append(f"Axes: x = {axes.get('x', '-')}; y = {axes.get('y', '-')}")
        if desc.get("series"):
            lines.append("Series: " + ", ".join(map(str, desc["series"]))[:500])
        if desc.get("data_points"):
            lines.append("Data: " + "; ".join(map(str, desc["data_points"]))[:2500])
        if desc.get("key_insights"):
            lines.append("Insights:\n" + "\n".join(f"- {i}" for i in desc["key_insights"])[:1200])
        txt = desc.get("text_in_figure") or inner
        if txt:
            lines.append(f"Text in figure: {str(txt)[:800]}")
        return "\n".join(lines)

    # No VLM available — still index what we can read
    if not caption and len(inner.split()) < 4:
        return None
    lines = [f"[FIGURE · page {page} · {fig.get('kind', 'image')}] {caption}".strip()]
    if inner:
        lines.append(f"Labels / text in figure: {inner[:1500]}")
    return "\n".join(lines)


def describe_figures(figures: list, page_text_lookup: dict, progress_cb=None) -> list:
    """
    Describe many figures concurrently. Returns list of (figure, text) with
    decorative figures removed. `page_text_lookup[page]` gives nearby text for context.
    """
    if not figures:
        return []
    max_figs = int(os.getenv("VISION_MAX_FIGURES", "120"))
    # Prioritise figures that have captions and are large
    def prio(f):
        b = f.get("bbox") or [0, 0, 0, 0]
        area = max((b[2] - b[0]) * (b[3] - b[1]), 0)
        return (0 if f.get("caption") else 1, -area)
    ordered = sorted(figures, key=prio)
    selected, skipped = ordered[:max_figs], ordered[max_figs:]

    out = []
    if vision_enabled():
        workers = int(os.getenv("VISION_CONCURRENCY", "6"))
        done = 0

        def work(f):
            ctx = (f.get("caption", "") + "\n" + page_text_lookup.get(f["page"], ""))[:1500]
            return f, figure_to_text(f, describe_figure(f["image_png"], ctx))

        with ThreadPoolExecutor(max_workers=workers) as ex:
            for f, txt in ex.map(work, selected):
                done += 1
                if progress_cb:
                    try:
                        progress_cb(done, len(selected))
                    except Exception:
                        pass
                if txt:
                    out.append((f, txt))
        rest = skipped
    else:
        rest = ordered

    for f in rest:
        txt = figure_to_text(f, None)
        if txt:
            out.append((f, txt))
    out.sort(key=lambda x: x[0]["page"])
    return out
