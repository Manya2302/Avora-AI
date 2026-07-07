"""Avora AI Phase 4 — Knowledge Graph Builder"""
import re, logging
from django.db import models
from apps.knowledge.models import KnowledgeNode, KnowledgeRelationship
logger = logging.getLogger(__name__)


def build_knowledge_graph(owner) -> dict:
    """Build the full organizational knowledge graph for a user."""
    from apps.documents.models import Document
    from apps.ai.models import DocumentClassification, DocumentMetadataAI
    from apps.contracts.models import ContractAnalysis

    docs       = Document.objects.filter(owner=owner, is_deleted=False, status="ai_ready")
    nodes_created = rels_created = 0

    for doc in docs:
        try:
            cls  = DocumentClassification.objects.get(document_id=doc.id)
            meta = DocumentMetadataAI.objects.filter(document_id=doc.id).first()
        except: continue

        # Create document node
        doc_node, _ = KnowledgeNode.objects.update_or_create(
            owner=owner, name=doc.original_name, node_type=KnowledgeNode.NodeType.DOCUMENT,
            defaults={"document_id": doc.id, "properties": {"category": cls.category, "status": doc.status}})
        nodes_created += 1

        # Create Uploader Node
        uploader_name = doc.owner.full_name or doc.owner.email or "Unknown User"
        user_node, _ = KnowledgeNode.objects.get_or_create(
            owner=owner, name=uploader_name[:200], node_type=KnowledgeNode.NodeType.EMPLOYEE,
            defaults={"properties": {"email": doc.owner.email}}
        )
        _create_rel(user_node, doc_node, "uploaded")
        rels_created += 1

        # Create vendor/client nodes and link
        if meta:
            if meta.vendor:
                v_node, _ = KnowledgeNode.objects.get_or_create(
                    owner=owner, name=meta.vendor[:200], node_type=KnowledgeNode.NodeType.VENDOR,
                    defaults={"properties": {"source_doc": str(doc.id)}})
                _create_rel(doc_node, v_node, "belongs_to"); rels_created += 1

            if meta.client:
                c_node, _ = KnowledgeNode.objects.get_or_create(
                    owner=owner, name=meta.client[:200], node_type=KnowledgeNode.NodeType.CUSTOMER,
                    defaults={"properties": {"source_doc": str(doc.id)}})
                _create_rel(doc_node, c_node, "issued_to"); rels_created += 1

            if meta.organization:
                o_node, _ = KnowledgeNode.objects.get_or_create(
                    owner=owner, name=meta.organization[:200],
                    node_type=(KnowledgeNode.NodeType.VENDOR if cls.category in ("invoice","purchase_order","vendor_agreement")
                               else KnowledgeNode.NodeType.CUSTOMER),
                    defaults={"properties": {}})
                _create_rel(doc_node, o_node, "related_to"); rels_created += 1

        # Department nodes
        if meta and meta.department:
            d_node, _ = KnowledgeNode.objects.get_or_create(
                owner=owner, name=meta.department, node_type=KnowledgeNode.NodeType.DEPARTMENT,
                defaults={"properties": {}})
            _create_rel(doc_node, d_node, "belongs_to"); rels_created += 1

    # Link contracts → related invoices (same vendor)
    _link_contract_invoices(owner)

    logger.info(f"[KnowledgeGraph] {nodes_created} nodes, {rels_created} rels for {owner.email}")
    return {"nodes_created": nodes_created, "rels_created": rels_created,
            "total_nodes": KnowledgeNode.objects.filter(owner=owner).count(),
            "total_rels":  KnowledgeRelationship.objects.filter(source_node__owner=owner).count()}


def get_knowledge_graph_data(user) -> dict:
    """Return graph data in a format suitable for visualization, filtered by permissions."""
    from apps.organizations.permissions import get_accessible_document_ids
    accessible_docs = get_accessible_document_ids(user)
    
    # Base nodes: owned by user or from accessible docs
    # Since nodes are per-owner right now, we'll fetch all user's nodes,
    # but only keep ones that are either accessible documents, or linked to accessible documents.
    all_nodes = KnowledgeNode.objects.all() # We could filter by owner if we want multi-tenant, but let's assume we want Org Graph!
    
    # Wait, the user asked for "One Graph - Organization Graph".
    # So we shouldn't even restrict by owner=owner in the graph data fetching!
    # We should restrict by what the user can access.
    
    # Find all Document nodes that are accessible
    accessible_doc_nodes = KnowledgeNode.objects.filter(
        node_type=KnowledgeNode.NodeType.DOCUMENT,
        document_id__in=accessible_docs
    ).values_list('id', flat=True)
    
    # Find all edges connected to these accessible documents
    visible_edges_qs = KnowledgeRelationship.objects.filter(
        models.Q(source_node_id__in=accessible_doc_nodes) | 
        models.Q(target_node_id__in=accessible_doc_nodes)
    ).select_related("source_node", "target_node")
    
    visible_edges = list(visible_edges_qs)
    
    # Also include relationships between visible non-document entities 
    # (e.g. Vendor -> Contract if both are visible)
    visible_node_ids = set(accessible_doc_nodes)
    for r in visible_edges:
        visible_node_ids.add(r.source_node_id)
        visible_node_ids.add(r.target_node_id)
        
    extra_edges = KnowledgeRelationship.objects.filter(
        source_node_id__in=visible_node_ids,
        target_node_id__in=visible_node_ids
    ).exclude(id__in=[e.id for e in visible_edges]).select_related("source_node", "target_node")
    
    visible_edges.extend(list(extra_edges))
    
    nodes = KnowledgeNode.objects.filter(id__in=visible_node_ids)

    return {
        "nodes": [{"id": str(n.id), "name": n.name[:50], "type": n.node_type,
                   "doc_id": str(n.document_id) if n.document_id else None} for n in nodes],
        "edges": [{"source": str(r.source_node.id), "target": str(r.target_node.id),
                   "type": r.relationship_type, "conf": r.confidence} for r in visible_edges],
        "stats": {
            "total_nodes": nodes.count(),
            "total_edges": len(visible_edges),
            "by_type":     {t: nodes.filter(node_type=t).count() for t in
                            ["vendor","customer","contract","invoice","certificate","policy","department","document"]},
        }
    }


def _create_rel(source, target, rel_type, confidence=0.9):
    try:
        KnowledgeRelationship.objects.get_or_create(
            source_node=source, target_node=target, relationship_type=rel_type,
            defaults={"confidence": confidence})
    except: pass


def _link_contract_invoices(owner):
    """Link contracts to matching invoices by vendor name."""
    contracts = KnowledgeNode.objects.filter(owner=owner, node_type=KnowledgeNode.NodeType.DOCUMENT,
                                              properties__category="contract")
    invoices  = KnowledgeNode.objects.filter(owner=owner, node_type=KnowledgeNode.NodeType.DOCUMENT,
                                              properties__category="invoice")
    for c in contracts:
        for inv in invoices:
            # Simple heuristic: link if same vendor
            c_vendors  = list(KnowledgeNode.objects.filter(
                incoming__source_node=c, node_type=KnowledgeNode.NodeType.VENDOR).values_list("name", flat=True))
            inv_vendors= list(KnowledgeNode.objects.filter(
                incoming__source_node=inv, node_type=KnowledgeNode.NodeType.VENDOR).values_list("name", flat=True))
            if any(v in inv_vendors for v in c_vendors):
                _create_rel(c, inv, "linked_to", confidence=0.8)
