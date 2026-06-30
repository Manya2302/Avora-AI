"""
Avora AI — Smart Collections
Automatically builds and maintains collections.
Users never create folders — Avora does it for them.
"""
import logging
from django.contrib.auth import get_user_model
from apps.ai.models import SmartCollection, SmartCollectionDocument, DocumentClassification
logger = logging.getLogger(__name__)

User = get_user_model()

COLLECTION_DEFS = [
    {'name': 'Finance Documents',    'icon': '💰', 'color': 'green',  'category': 'invoice'},
    {'name': 'Contracts',            'icon': '📝', 'color': 'blue',   'category': 'contract'},
    {'name': 'Invoices',             'icon': '🧾', 'color': 'amber',  'category': 'invoice'},
    {'name': 'HR Documents',         'icon': '👥', 'color': 'purple', 'category': 'employee_record'},
    {'name': 'Tax Filings',          'icon': '📊', 'color': 'red',    'category': 'tax_filing'},
    {'name': 'Legal Documents',      'icon': '⚖️', 'color': 'slate',  'category': 'legal_agreement'},
    {'name': 'Certificates',         'icon': '🏆', 'color': 'gold',   'category': 'certificate'},
    {'name': 'Compliance Reports',   'icon': '✅', 'color': 'teal',   'category': 'compliance_report'},
    {'name': 'Audit Reports',        'icon': '🔍', 'color': 'orange', 'category': 'audit_report'},
    {'name': 'Vendor Agreements',    'icon': '🤝', 'color': 'indigo', 'category': 'vendor_agreement'},
    {'name': 'Bank Statements',      'icon': '🏦', 'color': 'cyan',   'category': 'bank_statement'},
    {'name': 'Insurance Policies',   'icon': '🛡️', 'color': 'pink',   'category': 'insurance_policy'},
]


def seed_smart_collections(user):
    """Create default smart collections for a user (called after registration)."""
    for defn in COLLECTION_DEFS:
        SmartCollection.objects.get_or_create(
            owner=user,
            name=defn['name'],
            defaults={
                'icon':            defn['icon'],
                'color':           defn['color'],
                'category_filter': defn['category'],
                'collection_type': SmartCollection.CollectionType.AI_GENERATED,
                'is_auto_updated': True,
                'rules':           {'category': defn['category']},
            }
        )


def assign_document_to_collections(document_id: str, owner_id: str, category: str):
    """Add a newly processed document to the correct smart collections."""
    try:
        collections = SmartCollection.objects.filter(
            owner_id=owner_id,
            category_filter=category,
            is_auto_updated=True,
        )
        for col in collections:
            SmartCollectionDocument.objects.get_or_create(
                collection=col, document_id=document_id,
                defaults={'relevance': 1.0}
            )
            SmartCollection.objects.filter(pk=col.pk).update(
                document_count=SmartCollectionDocument.objects.filter(collection=col).count()
            )
        logger.info(f"[Avora Collections] doc {document_id} → {collections.count()} collections")
    except Exception as e:
        logger.error(f"[Avora Collections] Error: {e}")


def get_user_collections(user) -> list:
    """Return all smart collections for a user with counts."""
    cols = SmartCollection.objects.filter(owner=user).order_by('name')
    return [{
        'id':             str(c.id),
        'name':           c.name,
        'icon':           c.icon,
        'color':          c.color,
        'document_count': c.document_count,
        'collection_type':c.collection_type,
        'category_filter':c.category_filter,
    } for c in cols]
