"""Avora AI Phase 4 — Knowledge Graph Builder"""
import re, logging
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


def get_knowledge_graph_data(owner) -> dict:
    """Return graph data in a format suitable for visualization."""
    nodes = KnowledgeNode.objects.filter(owner=owner)
    rels  = KnowledgeRelationship.objects.filter(source_node__owner=owner).select_related("source_node","target_node")

    return {
        "nodes": [{"id": str(n.id), "name": n.name[:50], "type": n.node_type,
                   "doc_id": str(n.document_id) if n.document_id else None} for n in nodes],
        "edges": [{"source": str(r.source_node.id), "target": str(r.target_node.id),
                   "type": r.relationship_type, "conf": r.confidence} for r in rels],
        "stats": {
            "total_nodes": nodes.count(),
            "total_edges": rels.count(),
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
