"""Avora AI Phase 4 — Knowledge Graph Builder"""
import re, logging
from django.db import models
from apps.knowledge.models import KnowledgeNode, KnowledgeRelationship
logger = logging.getLogger(__name__)


def build_knowledge_graph(owner) -> dict:
    """
    (Re)build graph nodes for the documents `owner` is allowed to access.

    v1 iterated EVERY document in the system for any caller (cross-tenant writes, and
    2 lookups + up to 6 get_or_create per document inside the HTTP request). Now the
    scope is the caller's accessible set (owned + RBAC-granted), and classification /
    metadata / owners are bulk-loaded in 3 queries.
    """
    from apps.documents.models import Document
    from apps.ai.models import DocumentClassification, DocumentMetadataAI
    from apps.organizations.permissions import get_accessible_document_ids

    ids = list(get_accessible_document_ids(owner))
    docs = []
    for i in range(0, len(ids), 900):
        docs += list(Document.objects.filter(id__in=ids[i:i + 900], is_deleted=False)
                     .select_related("owner").only("id", "original_name", "status", "owner__id",
                                                   "owner__full_name", "owner__email"))
    doc_ids = [d.id for d in docs]
    cls_map, meta_map = {}, {}
    for i in range(0, len(doc_ids), 900):
        part = doc_ids[i:i + 900]
        cls_map.update({c.document_id: c.category for c in
                        DocumentClassification.objects.filter(document_id__in=part).only("document_id", "category")})
        meta_map.update({m.document_id: m for m in DocumentMetadataAI.objects.filter(document_id__in=part)})

    nodes_created = rels_created = 0
    for doc in docs:
        meta = meta_map.get(doc.id)
        category = cls_map.get(doc.id) or "general"
        doc_node, _ = KnowledgeNode.objects.update_or_create(
            owner=doc.owner, name=doc.original_name, node_type=KnowledgeNode.NodeType.DOCUMENT,
            defaults={"document_id": doc.id, "properties": {"category": category, "status": doc.status}})
        nodes_created += 1

        uploader_name = doc.owner.full_name or doc.owner.email or "Unknown User"
        user_node, _ = KnowledgeNode.objects.get_or_create(
            owner=doc.owner, name=uploader_name[:200], node_type=KnowledgeNode.NodeType.EMPLOYEE,
            defaults={"properties": {"email": doc.owner.email}})
        _create_rel(user_node, doc_node, "uploaded")
        rels_created += 1

        if meta:
            links = []
            if meta.vendor:
                links.append((meta.vendor, KnowledgeNode.NodeType.VENDOR, "belongs_to", {"source_doc": str(doc.id)}))
            if meta.client:
                links.append((meta.client, KnowledgeNode.NodeType.CUSTOMER, "issued_to", {"source_doc": str(doc.id)}))
            if meta.organization:
                t = (KnowledgeNode.NodeType.VENDOR if category in ("invoice", "purchase_order", "vendor_agreement")
                     else KnowledgeNode.NodeType.CUSTOMER)
                links.append((meta.organization, t, "related_to", {}))
            if meta.department:
                links.append((meta.department, KnowledgeNode.NodeType.DEPARTMENT, "belongs_to", {}))
            for name, ntype, rel, props in links:
                node, _ = KnowledgeNode.objects.get_or_create(
                    owner=doc.owner, name=str(name)[:200], node_type=ntype, defaults={"properties": props})
                _create_rel(doc_node, node, rel)
                rels_created += 1

    _link_contract_invoices(owner)

    logger.info(f"[KnowledgeGraph] {nodes_created} nodes, {rels_created} rels rebuilt for {owner.id}")
    return {"nodes_created": nodes_created, "rels_created": rels_created,
            "total_nodes": KnowledgeNode.objects.filter(owner=owner).count(),
            "total_rels": KnowledgeRelationship.objects.filter(source_node__owner=owner).count()}


MAX_GRAPH_NODES = 2000


def get_knowledge_graph_data(user) -> dict:
    """Graph data for visualisation, restricted to what `user` may access (org graph).
    Uses id-only queries (no select_related row explosion), one GROUP BY for stats,
    and caps the node count so very large orgs don't produce multi-MB responses."""
    from collections import Counter
    from apps.organizations.permissions import get_accessible_document_ids
    accessible = list(get_accessible_document_ids(user))

    doc_node_ids = set()
    for i in range(0, len(accessible), 900):
        doc_node_ids |= set(KnowledgeNode.objects.filter(
            node_type=KnowledgeNode.NodeType.DOCUMENT, document_id__in=accessible[i:i + 900]
        ).values_list("id", flat=True))
    if not doc_node_ids:
        return {"nodes": [], "edges": [], "stats": {"total_nodes": 0, "total_edges": 0,
                "by_type": {t: 0 for t in ["vendor", "customer", "contract", "invoice", "certificate",
                                           "policy", "department", "document"]}}}

    fields = ("id", "source_node_id", "target_node_id", "relationship_type", "confidence")
    edges, seen = [], set()
    dn = list(doc_node_ids)
    for i in range(0, len(dn), 450):
        part = dn[i:i + 450]
        for e in KnowledgeRelationship.objects.filter(
                models.Q(source_node_id__in=part) | models.Q(target_node_id__in=part)).values(*fields):
            if e["id"] not in seen:
                seen.add(e["id"]); edges.append(e)

    visible = set(doc_node_ids)
    for e in edges:
        visible.add(e["source_node_id"]); visible.add(e["target_node_id"])

    vis = list(visible)
    for i in range(0, len(vis), 450):
        part = vis[i:i + 450]
        for e in KnowledgeRelationship.objects.filter(source_node_id__in=part,
                                                      target_node_id__in=visible).values(*fields):
            if e["id"] not in seen:
                seen.add(e["id"]); edges.append(e)

    nodes = []
    for i in range(0, len(vis), 900):
        nodes += list(KnowledgeNode.objects.filter(id__in=vis[i:i + 900])
                      .values("id", "name", "node_type", "document_id"))
    truncated = len(nodes) > MAX_GRAPH_NODES
    if truncated:
        keep = {n["id"] for n in nodes if n["id"] in doc_node_ids}
        for n in nodes:
            if len(keep) >= MAX_GRAPH_NODES:
                break
            keep.add(n["id"])
        nodes = [n for n in nodes if n["id"] in keep]
        edges = [e for e in edges if e["source_node_id"] in keep and e["target_node_id"] in keep]

    by_type = Counter(n["node_type"] for n in nodes)
    return {
        "nodes": [{"id": str(n["id"]), "name": n["name"][:50], "type": n["node_type"],
                   "doc_id": str(n["document_id"]) if n["document_id"] else None} for n in nodes],
        "edges": [{"source": str(e["source_node_id"]), "target": str(e["target_node_id"]),
                   "type": e["relationship_type"], "conf": e["confidence"]} for e in edges],
        "stats": {
            "total_nodes": len(nodes),
            "total_edges": len(edges),
            "truncated": truncated,
            "by_type": {t: by_type.get(t, 0) for t in
                        ["vendor", "customer", "contract", "invoice", "certificate", "policy", "department", "document"]},
        },
    }


def _create_rel(source, target, rel_type, confidence=0.9):
    try:
        KnowledgeRelationship.objects.get_or_create(
            source_node=source, target_node=target, relationship_type=rel_type,
            defaults={"confidence": confidence})
    except Exception: pass


def _link_contract_invoices(owner):
    """Link contracts to invoices that share a vendor. One query for all vendor edges
    instead of 2 queries per (contract x invoice) pair."""
    from collections import defaultdict
    docs = {n.id: n for n in KnowledgeNode.objects.filter(
        owner=owner, node_type=KnowledgeNode.NodeType.DOCUMENT,
        properties__category__in=["contract", "invoice"])}
    if not docs:
        return
    vendors = defaultdict(set)
    for src, name in KnowledgeRelationship.objects.filter(
            source_node_id__in=list(docs), target_node__node_type=KnowledgeNode.NodeType.VENDOR
    ).values_list("source_node_id", "target_node__name"):
        vendors[src].add(name)
    contracts = [n for n in docs.values() if (n.properties or {}).get("category") == "contract"]
    invoices = [n for n in docs.values() if (n.properties or {}).get("category") == "invoice"]
    by_vendor = defaultdict(list)
    for inv in invoices:
        for v in vendors.get(inv.id, ()):
            by_vendor[v].append(inv)
    for c in contracts:
        linked = set()
        for v in vendors.get(c.id, ()):
            for inv in by_vendor.get(v, ()):
                if inv.id not in linked:
                    linked.add(inv.id)
                    _create_rel(c, inv, "linked_to", confidence=0.8)
