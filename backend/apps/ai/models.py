"""
Avora AI — Phase 2 Database Models
AI Processing Pipeline, Classification, Summaries, Embeddings,
Relationships, Smart Collections, Search Analytics
"""
import uuid
from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class AIProcessingQueue(models.Model):
    """Tracks every document through the Avora AI pipeline."""

    class Stage(models.TextChoices):
        QUEUED          = 'queued',          'Queued'
        OCR             = 'ocr',             'OCR Processing'
        TEXT_EXTRACTION = 'text_extraction', 'Text Extraction'
        TEXT_CLEANING   = 'text_cleaning',   'Text Cleaning'
        CLASSIFICATION  = 'classification',  'Classification'
        METADATA        = 'metadata',        'Metadata Generation'
        SUMMARY         = 'summary',         'Summary Generation'
        EMBEDDING       = 'embedding',       'Embedding Generation'
        STORING         = 'storing',         'Storing Vectors'
        COMPLETED       = 'completed',       'Completed'
        FAILED          = 'failed',          'Failed'

    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document_id    = models.UUIDField(db_index=True)
    stage          = models.CharField(max_length=30, choices=Stage.choices, default=Stage.QUEUED)
    progress       = models.IntegerField(default=0)             # 0–100
    error_message  = models.TextField(blank=True)
    retry_count    = models.IntegerField(default=0)
    started_at     = models.DateTimeField(null=True, blank=True)
    completed_at   = models.DateTimeField(null=True, blank=True)
    duration_ms    = models.IntegerField(null=True, blank=True)
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'ai_processing_queue'
        ordering = ['-created_at']
        indexes  = [models.Index(fields=['document_id']), models.Index(fields=['stage'])]

    def __str__(self):
        return f"Queue[{self.document_id}] → {self.stage}"


class DocumentOCR(models.Model):
    """Stores OCR extraction results per document."""

    class Status(models.TextChoices):
        PENDING    = 'pending',    'Pending'
        PROCESSING = 'processing', 'Processing'
        COMPLETED  = 'completed',  'Completed'
        FAILED     = 'failed',     'Failed'

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document_id     = models.UUIDField(unique=True, db_index=True)
    status          = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    raw_text        = models.TextField(blank=True)
    cleaned_text    = models.TextField(blank=True)
    page_count      = models.IntegerField(default=0)
    word_count      = models.IntegerField(default=0)
    confidence_score = models.FloatField(default=0.0)   # 0.0 – 1.0
    engine_used     = models.CharField(max_length=50, default='paddleocr')
    language        = models.CharField(max_length=20, default='en')
    processing_ms   = models.IntegerField(null=True, blank=True)
    error_message   = models.TextField(blank=True)
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'document_ocr'


class DocumentClassification(models.Model):
    """AI-generated document category classification."""

    class Category(models.TextChoices):
        INVOICE           = 'invoice',           'Invoice'
        CONTRACT          = 'contract',           'Contract'
        TAX_FILING        = 'tax_filing',         'Tax Filing'
        MEDICAL_RECORD    = 'medical_record',     'Medical Record'
        BANK_STATEMENT    = 'bank_statement',     'Bank Statement'
        LEGAL_AGREEMENT   = 'legal_agreement',    'Legal Agreement'
        INSURANCE_POLICY  = 'insurance_policy',   'Insurance Policy'
        AUDIT_REPORT      = 'audit_report',       'Audit Report'
        CERTIFICATE       = 'certificate',        'Certificate'
        PURCHASE_ORDER    = 'purchase_order',     'Purchase Order'
        EMPLOYEE_RECORD   = 'employee_record',    'Employee Record'
        VENDOR_AGREEMENT  = 'vendor_agreement',   'Vendor Agreement'
        BUSINESS_LICENSE  = 'business_license',   'Business License'
        COMPLIANCE_REPORT = 'compliance_report',  'Compliance Report'
        OTHER             = 'other',              'Other'

    class Confidentiality(models.TextChoices):
        PUBLIC       = 'public',       'Public'
        INTERNAL     = 'internal',     'Internal'
        CONFIDENTIAL = 'confidential', 'Confidential'
        RESTRICTED   = 'restricted',   'Restricted'

    id                 = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document_id        = models.UUIDField(unique=True, db_index=True)
    category           = models.CharField(max_length=50, choices=Category.choices, default=Category.OTHER)
    subcategory        = models.CharField(max_length=100, blank=True)
    confidence_score   = models.FloatField(default=0.0)
    confidentiality    = models.CharField(max_length=20, choices=Confidentiality.choices, default=Confidentiality.INTERNAL)
    risk_score         = models.FloatField(default=0.0)   # 0.0 – 1.0
    ai_model_version   = models.CharField(max_length=50, default='avora-v2')
    raw_response       = models.JSONField(default=dict)
    created_at         = models.DateTimeField(auto_now_add=True)
    updated_at         = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'document_classifications'


class DocumentMetadataAI(models.Model):
    """Rich AI-extracted metadata from document content."""

    document_id    = models.UUIDField(unique=True, db_index=True)
    # Identity
    vendor         = models.CharField(max_length=255, blank=True)
    client         = models.CharField(max_length=255, blank=True)
    organization   = models.CharField(max_length=255, blank=True)
    department     = models.CharField(max_length=100, blank=True)
    # Temporal
    document_date  = models.DateField(null=True, blank=True)
    year           = models.CharField(max_length=10, blank=True)
    expiry_date    = models.DateField(null=True, blank=True)
    # Financial
    amount         = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    currency       = models.CharField(max_length=10, blank=True)
    # Geo
    country        = models.CharField(max_length=100, blank=True)
    # Keywords
    keywords       = models.JSONField(default=list)
    entities       = models.JSONField(default=dict)   # {persons, orgs, locations}
    # Extra
    extra_fields   = models.JSONField(default=dict)
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'document_metadata_ai'


class DocumentSummary(models.Model):
    """AI-generated document summaries at multiple lengths."""

    document_id    = models.UUIDField(unique=True, db_index=True)
    short_summary  = models.CharField(max_length=300, blank=True)   # 1–2 sentences
    medium_summary = models.TextField(blank=True)                    # 1 paragraph
    long_summary   = models.TextField(blank=True)                    # Full analysis
    key_points     = models.JSONField(default=list)                  # Bullet points
    model_used     = models.CharField(max_length=100, blank=True)
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'document_summaries'


class DocumentEmbedding(models.Model):
    """Tracks which documents have been vectorised in Qdrant."""

    document_id      = models.UUIDField(unique=True, db_index=True)
    qdrant_point_id  = models.UUIDField(unique=True)
    model_name       = models.CharField(max_length=100, default='nomic-embed-text')
    vector_size      = models.IntegerField(default=768)
    text_chunk_count = models.IntegerField(default=1)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'document_embeddings'


class DocumentTag(models.Model):
    """AI-generated tags for a document."""

    document_id = models.UUIDField(db_index=True)
    tag         = models.CharField(max_length=100)
    source      = models.CharField(max_length=20, default='ai')   # ai | user
    confidence  = models.FloatField(default=1.0)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'document_tags'
        unique_together = ('document_id', 'tag')
        ordering = ['-confidence']


class DocumentRelationship(models.Model):
    """AI-detected relationships between documents."""

    class RelType(models.TextChoices):
        REVISION   = 'revision',   'Revision / Updated Version'
        DUPLICATE  = 'duplicate',  'Potential Duplicate'
        RELATED    = 'related',    'Related Document'
        PARENT     = 'parent',     'Parent Document'
        CHILD      = 'child',      'Child Document'
        REFERENCE  = 'reference',  'Referenced Document'

    source_document_id = models.UUIDField(db_index=True)
    target_document_id = models.UUIDField(db_index=True)
    relationship_type  = models.CharField(max_length=20, choices=RelType.choices)
    similarity_score   = models.FloatField(default=0.0)   # 0.0 – 1.0
    ai_confidence      = models.FloatField(default=0.0)
    notes              = models.TextField(blank=True)
    created_at         = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'document_relationships'
        unique_together = ('source_document_id', 'target_document_id')


class DocumentRecommendation(models.Model):
    """Documents recommended after viewing another document."""

    document_id           = models.UUIDField(db_index=True)
    recommended_document_id = models.UUIDField(db_index=True)
    score                 = models.FloatField(default=0.0)
    reason                = models.CharField(max_length=200, blank=True)
    created_at            = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'document_recommendations'
        ordering = ['-score']


class SmartCollection(models.Model):
    """Auto-generated collections by Avora AI. Users never create folders."""

    class CollectionType(models.TextChoices):
        AI_GENERATED = 'ai_generated', 'AI Generated'
        USER_CREATED = 'user_created', 'User Created'

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner           = models.ForeignKey(User, on_delete=models.CASCADE, related_name='smart_collections')
    name            = models.CharField(max_length=200)
    description     = models.TextField(blank=True)
    icon            = models.CharField(max_length=50, default='folder')
    color           = models.CharField(max_length=20, default='blue')
    collection_type = models.CharField(max_length=20, choices=CollectionType.choices, default=CollectionType.AI_GENERATED)
    category_filter = models.CharField(max_length=50, blank=True)
    rules           = models.JSONField(default=dict)
    document_count  = models.IntegerField(default=0)
    is_auto_updated = models.BooleanField(default=True)
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'smart_collections'
        ordering = ['name']


class SmartCollectionDocument(models.Model):
    """M2M: which documents belong to which smart collection."""

    collection  = models.ForeignKey(SmartCollection, on_delete=models.CASCADE, related_name='items')
    document_id = models.UUIDField(db_index=True)
    added_at    = models.DateTimeField(auto_now_add=True)
    relevance   = models.FloatField(default=1.0)

    class Meta:
        db_table = 'smart_collection_documents'
        unique_together = ('collection', 'document_id')


class SearchHistory(models.Model):
    """Every search query logged for analytics + suggestions."""

    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user         = models.ForeignKey(User, on_delete=models.CASCADE, related_name='searches')
    query        = models.CharField(max_length=500)
    result_count = models.IntegerField(default=0)
    top_result_id = models.UUIDField(null=True, blank=True)
    filters      = models.JSONField(default=dict)
    search_ms    = models.IntegerField(default=0)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'search_history'
        ordering = ['-created_at']


class SearchAnalytics(models.Model):
    """Aggregated search analytics per query term."""

    query        = models.CharField(max_length=500, unique=True)
    search_count = models.IntegerField(default=0)
    avg_results  = models.FloatField(default=0.0)
    avg_score    = models.FloatField(default=0.0)
    last_searched = models.DateTimeField(auto_now=True)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'search_analytics'
        ordering = ['-search_count']
