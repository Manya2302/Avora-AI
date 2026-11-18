"""Where a cited document came from (uploaded vs synced from an integration).

Derived from existing data only: Google Drive sync stores ``gdrive_file_id`` in
``DocumentMetadata.extra`` (see apps/integrations/tasks.py); everything else is a
direct upload (apps/documents/views.py is the only other Document creator).
"""
from __future__ import annotations


def document_origins(doc_ids) -> dict[str, str]:
    """Return {document_id: 'google_drive' | 'uploads'} for the given ids (one query)."""
    ids = {str(d) for d in doc_ids if d}
    if not ids:
        return {}
    origins = {d: "uploads" for d in ids}
    try:
        from apps.documents.models import DocumentMetadata
        for doc_id, extra in DocumentMetadata.objects.filter(document_id__in=ids).values_list("document_id", "extra"):
            if isinstance(extra, dict) and extra.get("gdrive_file_id"):
                origins[str(doc_id)] = "google_drive"
    except Exception:
        pass
    return origins


def annotate_origins(refs: list) -> list:
    """Add an ``origin`` key to each citation dict in place; returns the list."""
    if not refs:
        return refs
    origins = document_origins(r.get("document_id") for r in refs if isinstance(r, dict))
    for r in refs:
        if isinstance(r, dict):
            r["origin"] = origins.get(str(r.get("document_id")), "uploads")
    return refs
