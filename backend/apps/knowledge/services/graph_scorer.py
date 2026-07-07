"""
Avora AI — Knowledge Graph Scorer
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AI analyses document text and decides:
  1. Whether it is worth indexing into the Knowledge Graph
  2. What entities it contains
  3. A Graph Score (0-100)

The RAG pipeline (Qdrant) always runs regardless of graph score.
Only documents scoring ≥ GRAPH_THRESHOLD get graph nodes.
"""
import os
import json
import logging
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

# Score at or above this → recommend adding to graph
GRAPH_THRESHOLD = 60

# Entity types that boost the graph score
HIGH_VALUE_TYPES = {"vendor", "customer", "employee", "contract", "invoice",
                    "certificate", "policy", "project", "department"}


def score_document_for_graph(document_id: str, text: str, doc_name: str) -> dict:
    """
    Uses an LLM to extract entities and compute a Knowledge Graph Score.

    Returns:
    {
        "graph_score": 87,
        "recommended": True,
        "document_type": "Vendor Agreement",
        "confidence": 0.94,
        "entities": [
            {"name": "Acme Corp", "type": "vendor"},
            {"name": "Service Agreement #204", "type": "contract"},
        ],
        "relationships": [
            {"from": "Acme Corp", "to": "Service Agreement #204", "rel": "signed_by"},
        ],
        "reason": "Document contains 3 high-value entities with clear business relationships."
    }
    """
    from apps.documents.models import DocumentMetadata
    industry_edition = "generic"
    try:
        meta = DocumentMetadata.objects.filter(document_id=document_id).first()
        if meta:
            industry_edition = meta.extra.get('industry_edition', 'generic')
    except Exception:
        pass
        
    industry_context = ""
    if industry_edition == "healthcare":
        industry_context = "- Healthcare Focus: Extract medical entities, HIPAA compliance details, and patient data references."
    elif industry_edition == "legal":
        industry_context = "- Legal Focus: Extract contracts, specific legal clauses, liability terms, and risk scores."
    elif industry_edition == "finance":
        industry_context = "- Finance Focus: Extract AML, KYC, regulatory reporting entities, and financial instruments."
    elif industry_edition == "manufacturing":
        industry_context = "- Manufacturing Focus: Extract SOP validations, ISO compliance, equipment, and supply chain vendors."
    elif industry_edition == "government":
        industry_context = "- Government Focus: Extract records management protocols, audit trails, and clearance levels."
    else:
        industry_context = "- General Enterprise Focus: Extract standard vendors, contracts, and policies."

    prompt = f"""You are an Enterprise Knowledge Graph AI.

Analyze this document and return ONLY a raw JSON object (no markdown).

Document: {doc_name}
Text (first 6000 chars):
{text[:6000]}

Return this exact JSON structure:
{{
  "document_type": "e.g. Vendor Agreement, Invoice, HR Policy, Python Tutorial",
  "confidence": 0.0 to 1.0,
  "entities": [
    {{"name": "Entity Name", "type": "vendor|customer|employee|contract|invoice|certificate|policy|project|department"}}
  ],
  "relationships": [
    {{"from": "Entity A", "to": "Entity B", "rel": "signed_by|issued_to|belongs_to|related_to|created_by|approved_by"}}
  ],
  "graph_score": 0 to 100,
  "reason": "Short explanation of why this document is or is not suitable for the knowledge graph."
}}

Rules:
- graph_score = 0-100 based on how many high-value entities exist with clear business relationships
- Score 80-100: Rich business document (contracts, vendor agreements, invoices with relationships)
- Score 50-79: Moderate value (policies, HR docs, certificates)
- Score 0-30: Low value (tutorials, notes, generic PDFs with no business entities)
{industry_context}
- ALWAYS return valid JSON. NEVER add text outside the JSON."""

    results_json = "{}"

    try:
        groq_key = getattr(settings, "GROQ_API_KEY", os.getenv("GROQ_API_KEY"))
        from utils.circuit_breaker import groq_cb
        if groq_key and groq_cb.is_healthy():
            resp = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                },
                timeout=20
            )
            if resp.status_code == 200:
                results_json = resp.json()['choices'][0]['message']['content'].strip()
                groq_cb.record_success()
            else:
                groq_cb.record_failure()
                raise Exception("Groq failed")
        else:
            raise Exception("Using local model")
    except Exception as e:
        logger.info(f"[GraphScore] Using local LLM: {e}")
        try:
            host = os.getenv("OLLAMA_HOST", getattr(settings, "OLLAMA_HOST", "http://localhost:11434"))
            model = os.getenv("OLLAMA_CHAT_MODEL", "qwen2.5:7b")
            resp = requests.post(
                f"{host}/api/generate",
                json={"model": model, "prompt": prompt, "stream": False, "format": "json"},
                timeout=60
            )
            resp.raise_for_status()
            results_json = resp.json().get("response", "{}").strip()
        except Exception as local_e:
            logger.error(f"[GraphScore] Local model failed: {local_e}")
            return _fallback_score(doc_name)

    try:
        if "```json" in results_json:
            results_json = results_json.split("```json")[1].split("```")[0].strip()
        elif "```" in results_json:
            results_json = results_json.split("```")[1].split("```")[0].strip()

        data = json.loads(results_json)
        score = int(data.get("graph_score", 0))

        return {
            "graph_score":    score,
            "recommended":    score >= GRAPH_THRESHOLD,
            "document_type":  data.get("document_type", "Unknown"),
            "confidence":     float(data.get("confidence", 0.5)),
            "entities":       data.get("entities", []),
            "relationships":  data.get("relationships", []),
            "reason":         data.get("reason", ""),
        }
    except Exception as e:
        logger.error(f"[GraphScore] Parse error: {e}")
        return _fallback_score(doc_name)


def _fallback_score(doc_name: str) -> dict:
    """Rule-based fallback when LLM is unavailable."""
    name_lower = doc_name.lower()
    keywords = ["contract", "agreement", "invoice", "vendor", "certificate", "policy", "nda", "sla"]
    score = 30
    found = [k for k in keywords if k in name_lower]
    if found:
        score = min(95, 50 + len(found) * 15)

    return {
        "graph_score":   score,
        "recommended":   score >= GRAPH_THRESHOLD,
        "document_type": "Unknown (fallback)",
        "confidence":    0.3,
        "entities":      [],
        "relationships": [],
        "reason":        f"Fallback heuristic. Detected keywords: {found}" if found else "No business entities detected in document name.",
    }


def build_graph_from_score_result(document_id: str, owner, doc_name: str, score_result: dict):
    """
    Persists the graph nodes and relationships from a scored document.
    Called after the user confirms 'Add to Graph'.
    """
    from apps.knowledge.models import KnowledgeNode, KnowledgeRelationship

    entities   = score_result.get("entities", [])
    rels       = score_result.get("relationships", [])
    doc_type   = score_result.get("document_type", "document")
    score      = score_result.get("graph_score", 0)

    TYPE_MAP = {
        "vendor":      KnowledgeNode.NodeType.VENDOR,
        "customer":    KnowledgeNode.NodeType.CUSTOMER,
        "employee":    KnowledgeNode.NodeType.EMPLOYEE,
        "contract":    KnowledgeNode.NodeType.CONTRACT,
        "invoice":     KnowledgeNode.NodeType.INVOICE,
        "certificate": KnowledgeNode.NodeType.CERTIFICATE,
        "policy":      KnowledgeNode.NodeType.POLICY,
        "project":     KnowledgeNode.NodeType.PROJECT,
        "department":  KnowledgeNode.NodeType.DEPARTMENT,
    }

    from apps.documents.models import DocumentMetadata
    from apps.organizations.models import OrgMember, Department
    
    # Try to fetch department and uploader from metadata
    meta = DocumentMetadata.objects.filter(document_id=document_id).first()
    uploader_name = owner.get_full_name() or owner.email
    dept_name = meta.department if meta else "Unknown Department"
    
    # 1. Create / update the document node
    doc_node, _ = KnowledgeNode.objects.update_or_create(
        owner=owner, name=doc_name[:490], node_type=KnowledgeNode.NodeType.DOCUMENT,
        defaults={
            "document_id": document_id,
            "properties": {
                "document_type": doc_type,
                "graph_score":   score,
                "ai_scored":     True,
                "uploaded_by":   uploader_name,
                "department":    dept_name
            }
        }
    )

    # 1.5. Create Uploader and Department Nodes and Link them
    if uploader_name:
        emp_node, _ = KnowledgeNode.objects.get_or_create(
            owner=owner, name=uploader_name[:490], node_type=KnowledgeNode.NodeType.EMPLOYEE,
            defaults={"properties": {"role": "Uploader"}}
        )
        KnowledgeRelationship.objects.get_or_create(
            source_node=emp_node, target_node=doc_node,
            relationship_type="created_by", defaults={"confidence": 1.0}
        )
    
    if dept_name and dept_name != "Unknown Department":
        dept_node, _ = KnowledgeNode.objects.get_or_create(
            owner=owner, name=dept_name[:490], node_type=KnowledgeNode.NodeType.DEPARTMENT,
            defaults={"properties": {}}
        )
        KnowledgeRelationship.objects.get_or_create(
            source_node=doc_node, target_node=dept_node,
            relationship_type="belongs_to", defaults={"confidence": 1.0}
        )

    # 2. Create entity nodes and link them to the document
    node_cache = {}
    for entity in entities:
        etype = TYPE_MAP.get(entity.get("type", "").lower(), KnowledgeNode.NodeType.DOCUMENT)
        ename = (entity.get("name") or "")[:490]
        if not ename:
            continue
        node, _ = KnowledgeNode.objects.get_or_create(
            owner=owner, name=ename, node_type=etype,
            defaults={"properties": {"source_doc": str(document_id)}}
        )
        node_cache[ename] = node
        try:
            KnowledgeRelationship.objects.get_or_create(
                source_node=doc_node, target_node=node,
                relationship_type="related_to",
                defaults={"confidence": score_result.get("confidence", 0.8)}
            )
        except Exception:
            pass

    # 3. Build inter-entity relationships
    REL_MAP = {
        "signed_by":   "signed_by",
        "issued_to":   "issued_to",
        "belongs_to":  "belongs_to",
        "related_to":  "related_to",
        "created_by":  "created_by",
        "approved_by": "approved_by",
    }
    for rel in rels:
        src_name = rel.get("from", "")
        tgt_name = rel.get("to", "")
        rel_type = REL_MAP.get(rel.get("rel", ""), "related_to")
        src_node = node_cache.get(src_name)
        tgt_node = node_cache.get(tgt_name)
        if src_node and tgt_node:
            try:
                KnowledgeRelationship.objects.get_or_create(
                    source_node=src_node, target_node=tgt_node,
                    relationship_type=rel_type,
                    defaults={"confidence": 0.85}
                )
            except Exception:
                pass

    logger.info(f"[GraphScore] Built {len(entities)} entities for {doc_name}")
    return {"entities_created": len(entities), "rels_created": len(rels)}
