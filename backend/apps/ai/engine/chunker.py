"""
Avora AI — Structure-Aware Chunker
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Old chunker: split on "\n", 2000 chars, no page numbers, no sections, tables
flattened into prose, 40-word overlap that often cut sentences in half.

New chunker:
  • detects headings from font size / bold / numbering → every chunk knows its section
  • never crosses a section boundary when the current chunk is already substantial
  • ~350-token target with sentence-level overlap (no half sentences)
  • tables are their own chunks; big tables split by rows WITH the header repeated
  • figures (charts/images) become their own chunks from the VLM description
  • each chunk carries page_start/page_end → citations like "p. 42"
  • `embed_text` = contextual header (doc · section · page) + content. Embedding
    the context with the chunk is what lets "the revenue chart in the annual report"
    find a chunk that itself never says "annual report".
"""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field

TARGET_CHARS = 1400     # ≈ 350 tokens
MAX_CHARS = 2000
MIN_CHARS = 250
OVERLAP_CHARS = 220
TABLE_MAX_CHARS = 2200

_SENT_SPLIT = re.compile(r"(?<=[.!?;:])\s+(?=[A-Z0-9\"'(\[])")
_NUMBERED_HEADING = re.compile(r"^(\d+(\.\d+){0,3}|[IVXLC]+\.|[A-Z]\.|section\s+\d+|article\s+\d+|chapter\s+\d+)\s+\S", re.I)


@dataclass
class Chunk:
    content: str
    chunk_type: str = "text"          # text | table | figure
    page_start: int = 0
    page_end: int = 0
    section: str = ""
    extra: dict = field(default_factory=dict)

    def embed_text(self, doc_name: str) -> str:
        head = [f"Document: {doc_name}"] if doc_name else []
        if self.section:
            head.append(f"Section: {self.section}")
        if self.page_start:
            pg = f"{self.page_start}" if self.page_end in (0, self.page_start) else f"{self.page_start}-{self.page_end}"
            head.append(f"Page: {pg}")
        return ("\n".join(head) + "\n\n" + self.content) if head else self.content


def _body_size(pages) -> float:
    c = Counter()
    for p in pages:
        for b in p.get("blocks", []):
            if b.get("size"):
                c[b["size"]] += b.get("chars", len(b["text"]))
    return c.most_common(1)[0][0] if c else 0.0


def _is_heading(b: dict, body: float) -> bool:
    t = b["text"].strip()
    n = len(t)
    if n < 3 or n > 160 or t.endswith((".", ",", ";")) and n > 60:
        return False
    if body and b.get("size") and b["size"] >= body * 1.18:
        return True
    if b.get("bold") and n <= 120 and not t.endswith("."):
        return True
    if _NUMBERED_HEADING.match(t) and n <= 100 and not t.endswith("."):
        return True
    letters = [ch for ch in t if ch.isalpha()]
    if 4 <= len(letters) and n <= 80 and all(ch.isupper() for ch in letters):
        return True
    return False


def _split_sentences(text: str) -> list:
    parts = _SENT_SPLIT.split(text)
    out = []
    for p in parts:
        p = p.strip()
        while len(p) > MAX_CHARS:                       # pathological run-on text
            cut = p.rfind(" ", 0, MAX_CHARS) or MAX_CHARS
            out.append(p[:cut])
            p = p[cut:].strip()
        if p:
            out.append(p)
    return out


def _tail_overlap(text: str) -> str:
    sents = _split_sentences(text)
    tail = ""
    for s in reversed(sents):
        if len(tail) + len(s) > OVERLAP_CHARS:
            break
        tail = (s + " " + tail).strip()
    return tail


def _split_table(md: str) -> list:
    if len(md) <= TABLE_MAX_CHARS:
        return [md]
    lines = md.split("\n")
    header, rows = lines[:2], lines[2:]
    out, cur = [], list(header)
    for r in rows:
        if len("\n".join(cur)) + len(r) > TABLE_MAX_CHARS and len(cur) > 2:
            out.append("\n".join(cur))
            cur = list(header)
        cur.append(r)
    if len(cur) > 2:
        out.append("\n".join(cur))
    return out


def chunk_pages(pages: list, figure_chunks: list | None = None) -> list:
    """
    pages: output of page_extractor (or adapters) — each {"page", "blocks", "tables"}.
    figure_chunks: list of (figure_dict, text) from vision.describe_figures.
    """
    body = _body_size(pages)
    chunks: list[Chunk] = []
    h1 = h2 = ""
    buf, buf_start, buf_end = "", 0, 0

    def section():
        return " › ".join(x for x in (h1, h2) if x)[:200]

    def flush(carry=True):
        nonlocal buf, buf_start
        text = buf.strip()
        if text:
            chunks.append(Chunk(text, "text", buf_start, buf_end, section()))
        buf = _tail_overlap(text) if (carry and text) else ""
        buf_start = buf_end if buf else 0

    for p in pages:
        pno = p["page"]
        for b in p.get("blocks", []):
            t = re.sub(r"\s+", " ", b["text"]).strip()
            if not t:
                continue
            if _is_heading(b, body):
                if len(buf) >= MIN_CHARS:
                    flush(carry=False)
                elif buf.strip():
                    buf += "\n"
                big = body and b.get("size", 0) >= body * 1.45
                if big or not h1:
                    h1, h2 = t[:120], ""
                else:
                    h2 = t[:120]
                buf += t + "\n"
                buf_start = buf_start or pno
                buf_end = pno
                continue

            for s in (_split_sentences(t) if len(t) > TARGET_CHARS else [t]):
                if len(buf) + len(s) > TARGET_CHARS and len(buf) >= MIN_CHARS:
                    flush()
                if not buf_start:
                    buf_start = pno
                buf += (" " if buf and not buf.endswith("\n") else "") + s
                buf_end = pno
            buf += "\n"

        for tab in p.get("tables", []):
            for part in _split_table(tab["markdown"]):
                chunks.append(Chunk(f"[TABLE · page {pno}]\n{part}", "table", pno, pno, section()))

    flush(carry=False)

    for fig, text in (figure_chunks or []):
        chunks.append(Chunk(text, "figure", fig["page"], fig["page"], "",
                            extra={"figure_kind": fig.get("kind", ""), "caption": (fig.get("caption") or "")[:300]}))

    # Merge trailing tiny text chunks into their predecessor (same section)
    merged: list[Chunk] = []
    for c in chunks:
        if (merged and c.chunk_type == "text" and merged[-1].chunk_type == "text"
                and len(c.content) < 120 and merged[-1].section == c.section
                and len(merged[-1].content) + len(c.content) < MAX_CHARS):
            merged[-1].content += "\n" + c.content
            merged[-1].page_end = c.page_end
        else:
            merged.append(c)

    merged.sort(key=lambda c: (c.page_start or 0, {"text": 0, "table": 1, "figure": 2}[c.chunk_type]))
    return merged


def chunk_plain_text(text: str) -> list:
    """For sources with no page structure (txt, legacy .doc, failed extractions)."""
    paras = [p for p in re.split(r"\n\s*\n|\n", text) if p.strip()]
    page = {"page": 1, "blocks": [{"type": "text", "text": p, "size": 0, "bold": False, "chars": len(p)} for p in paras],
            "tables": []}
    chunks = chunk_pages([page])
    for c in chunks:
        c.page_start = c.page_end = 0
    return chunks
