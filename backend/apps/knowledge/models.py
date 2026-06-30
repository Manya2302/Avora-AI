"""Avora AI Phase 4 — Knowledge Graph Models"""
import uuid
from django.db import models
from django.contrib.auth import get_user_model
User = get_user_model()


class KnowledgeNode(models.Model):
    """An entity in the organizational knowledge graph."""
    class NodeType(models.TextChoices):
        VENDOR     = "vendor",    "Vendor"
        CUSTOMER   = "customer",  "Customer"
        EMPLOYEE   = "employee",  "Employee"
        CONTRACT   = "contract",  "Contract"
        INVOICE    = "invoice",   "Invoice"
        CERTIFICATE= "certificate","Certificate"
        POLICY     = "policy",    "Policy"
        DEPARTMENT = "department","Department"
        PROJECT    = "project",   "Project"
        DOCUMENT   = "document",  "Document"

    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner        = models.ForeignKey(User, on_delete=models.CASCADE, related_name="knowledge_nodes")
    name         = models.CharField(max_length=500)
    node_type    = models.CharField(max_length=20, choices=NodeType.choices)
    document_id  = models.UUIDField(null=True, blank=True, db_index=True)
    properties   = models.JSONField(default=dict)
    embedding_id = models.UUIDField(null=True, blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "knowledge_nodes"
        unique_together = ("owner", "name", "node_type")
        ordering = ["node_type", "name"]


class KnowledgeRelationship(models.Model):
    """A directed relationship between two knowledge nodes."""
    class RelType(models.TextChoices):
        SIGNED_BY    = "signed_by",   "Signed By"
        ISSUED_TO    = "issued_to",   "Issued To"
        RELATED_TO   = "related_to",  "Related To"
        PARENT_OF    = "parent_of",   "Parent Of"
        BELONGS_TO   = "belongs_to",  "Belongs To"
        CREATED_BY   = "created_by",  "Created By"
        APPROVED_BY  = "approved_by", "Approved By"
        LINKED_TO    = "linked_to",   "Linked To"
        REFERENCES   = "references",  "References"
        SUPERSEDES   = "supersedes",  "Supersedes"

    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    source_node  = models.ForeignKey(KnowledgeNode, on_delete=models.CASCADE, related_name="outgoing")
    target_node  = models.ForeignKey(KnowledgeNode, on_delete=models.CASCADE, related_name="incoming")
    relationship_type = models.CharField(max_length=20, choices=RelType.choices)
    confidence   = models.FloatField(default=0.9)
    properties   = models.JSONField(default=dict)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "knowledge_relationships"
        unique_together = ("source_node", "target_node", "relationship_type")
