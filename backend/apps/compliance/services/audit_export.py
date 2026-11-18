"""Audit package ZIP export.

Bundles the package's documents (decrypted with the same loader the AI pipeline
uses — apps.ai.services.ingestion.load_document_bytes — no crypto here) plus a
manifest.json and a summary.csv. Only documents still owned by the requester and
not deleted are included; anything that cannot be read is listed in the manifest.
"""
from __future__ import annotations

import csv
import io
import json
import logging
import re
import tempfile
import zipfile

from django.utils import timezone

logger = logging.getLogger(__name__)

# Keep the archive bounded; anything past this is listed in the manifest as skipped.
MAX_EXPORT_BYTES = 500 * 1024 * 1024


def _safe_name(name: str) -> str:
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', "_", name or "").strip(" .")
    return name[:180] or "document"


def build_audit_package_zip(package, user):
    """Return (file_obj positioned at 0, filename, included_docs list)."""
    from apps.documents.models import Document
    from apps.ai.services.ingestion import load_document_bytes

    ids = [str(d) for d in (package.document_ids or [])]
    docs = {str(d.id): d for d in Document.objects.filter(id__in=ids, owner=user, is_deleted=False)
                                             .select_related("encryption_key")}

    included, skipped = [], []
    used_names: set[str] = set()
    total = 0
    tmp = tempfile.SpooledTemporaryFile(max_size=32 * 1024 * 1024)
    with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for doc_id in ids:
            doc = docs.get(doc_id)
            if doc is None:
                skipped.append({"document_id": doc_id, "reason": "No longer available (deleted or not yours)."})
                continue
            if total + (doc.original_size or 0) > MAX_EXPORT_BYTES:
                skipped.append({"document_id": doc_id, "name": doc.original_name,
                                "reason": "Package size limit reached."})
                continue
            try:
                data = load_document_bytes(doc)
            except Exception as exc:
                logger.warning("[AuditExport] could not load %s: %s", doc_id, exc)
                skipped.append({"document_id": doc_id, "name": doc.original_name,
                                "reason": "Stored file could not be read."})
                continue
            base = _safe_name(doc.original_name)
            arc = f"documents/{base}"
            n = 1
            while arc.lower() in used_names:
                stem, dot, ext = base.rpartition(".")
                arc = f"documents/{stem or base} ({n}){dot}{ext if stem else ''}"
                n += 1
            used_names.add(arc.lower())
            zf.writestr(arc, data)
            total += len(data)
            included.append({"document_id": doc_id, "name": doc.original_name, "path": arc,
                             "size_bytes": len(data), "uploaded_at": doc.created_at.isoformat() if doc.created_at else None})

        manifest = {
            "package_id": str(package.id),
            "name": package.name,
            "generated_at": package.generated_at.isoformat() if package.generated_at else None,
            "exported_at": timezone.now().isoformat(),
            "readiness_score": package.readiness_score,
            "gaps": package.gaps or [],
            "documents_included": included,
            "documents_skipped": skipped,
        }
        zf.writestr("manifest.json", json.dumps(manifest, indent=2, default=str))

        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["section", "name", "detail"])
        w.writerow(["readiness", package.name, f"{round(package.readiness_score or 0)}%"])
        for d in included:
            w.writerow(["included", d["name"], d["path"]])
        for d in skipped:
            w.writerow(["skipped", d.get("name", d["document_id"]), d["reason"]])
        for g in package.gaps or []:
            w.writerow(["gap", g, "Missing document"])
        zf.writestr("summary.csv", buf.getvalue())

    tmp.seek(0)
    filename = f"{_safe_name(package.name)}.zip".replace(" ", "_")
    return tmp, filename, included
