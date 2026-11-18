"""
Enterprise Permission Engine  —  apps/organizations/permissions.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The single source of truth for "can user X access document Y?"

Used by:
  - Search (hybrid_search) to filter Qdrant queries
  - Document retrieval endpoints
  - AI / Copilot / RAG engine
"""
import logging
from functools import lru_cache

logger = logging.getLogger(__name__)


ACL_CACHE_TTL = 300
_ACL_VERSION_KEY = "acl:version"


def _acl_version() -> int:
    from django.core.cache import cache
    v = cache.get(_ACL_VERSION_KEY)
    if v is None:
        v = 1
        cache.set(_ACL_VERSION_KEY, v, None)
    return v


def bump_acl_version(*args, **kwargs):
    """Invalidate every cached ACL (called by signals on visibility/membership/role changes)."""
    from django.core.cache import cache
    try:
        cache.incr(_ACL_VERSION_KEY)
    except ValueError:
        cache.set(_ACL_VERSION_KEY, 2, None)


def _visibility_grants(user) -> set:
    """
    Document ids granted through DocumentVisibility rules. Same rules as before,
    but evaluated as a handful of indexed queries instead of a Python loop over
    every visibility row in the database with 3-4 queries per row.

      1. Owner                                   (handled by caller via Document.owner too)
      2. visibility = organization               → everyone
      3. visibility = department                 → members of allowed_departments
      4. visibility = user_share                 → allowed_users
      5. visibility = custom                     → allowed_users ∪ allowed_departments ∪ allowed_roles
      6. visibility = private                    → owner only
      7. inherit_upward & requester level ≤ 3:
           same department, requester ranks above the owner  → granted
           requester level ≤ 2 (MD/CEO), owner in another dept → granted
    """
    from django.db.models import Q
    from apps.organizations.models import DocumentVisibility, OrgMember

    L = DocumentVisibility.Level
    from .tenancy import get_user_org_id
    org_id = get_user_org_id(user)
    member = OrgMember.objects.select_related('department', 'role').filter(user=user).first()
    dept = member.department if member else None
    role = member.role if member else None
    level = role.level if role else 99

    # "Organization" visibility = members of the OWNER's organization (tenant boundary),
    # not every account in the system.
    q = Q(owner_id=user.id) | Q(visibility=L.ORGANIZATION, owner__org_member__organization_id=org_id)
    q |= Q(visibility__in=[L.USER_SHARE, L.CUSTOM], allowed_users=user)
    if dept:
        q |= Q(visibility__in=[L.DEPARTMENT, L.CUSTOM], allowed_departments=dept)
    if role:
        q |= Q(visibility=L.CUSTOM, allowed_roles=role)
    ids = set(DocumentVisibility.objects.filter(q).values_list('document_id', flat=True).distinct())

    if member and level <= 3:
        lower_ranked = Q(role__isnull=True) | Q(role__level__gt=level)
        owners = OrgMember.objects.none()
        if dept:
            owners = OrgMember.objects.filter(Q(department=dept) & lower_ranked)
        if level <= 2:
            # MD/CEO inherit across departments — of their own organization only
            in_org = OrgMember.objects.filter(organization_id=org_id)
            other = in_org.exclude(department=dept) if dept else in_org
            owners = owners | other
        owner_ids = owners.values_list('user_id', flat=True)
        ids |= set(DocumentVisibility.objects.filter(inherit_upward=True, owner_id__in=owner_ids)
                   .values_list('document_id', flat=True))
    return {str(i) for i in ids}


def get_accessible_document_ids(user, use_cache: bool = True) -> set:
    """
    Returns the set of document UUIDs (strings) `user` may access: documents they
    own + everything granted by DocumentVisibility rules, minus deleted documents.
    Visibility grants are cached per user and invalidated on any policy change.
    """
    from django.core.cache import cache
    from apps.documents.models import Document

    key = f"acl:{_acl_version()}:{user.id}"
    grants = cache.get(key) if use_cache else None
    if grants is None:
        try:
            grants = _visibility_grants(user)
        except Exception as e:
            logger.error(f"[Permission] grant evaluation failed for {user.id}: {e}")
            grants = set()
        if use_cache:
            cache.set(key, grants, ACL_CACHE_TTL)

    owned = {str(i) for i in Document.objects.filter(owner=user, is_deleted=False).values_list('id', flat=True)}
    others = list(grants - owned)
    live = set()
    for i in range(0, len(others), 900):  # stay under SQLite's bound-parameter limit
        live |= {str(x) for x in Document.objects.filter(id__in=others[i:i + 900], is_deleted=False)
                 .values_list('id', flat=True)}
    accessible = owned | live
    logger.debug(f"[Permission] User {user.id} → {len(accessible)} accessible documents")
    return accessible


def can_access_document(user, document_id: str) -> bool:
    """Quick check: can this user access one specific document?"""
    return str(document_id) in get_accessible_document_ids(user)


def get_qdrant_filter_for_user(user) -> dict | None:
    """
    Returns a Qdrant-compatible filter dict that restricts search to documents
    the user may see.  Returns None if we should fall back to owner-only filter.
    """
    try:
        accessible_ids = get_accessible_document_ids(user)
        return accessible_ids  # caller will build the qdrant MatchAny filter
    except Exception as e:
        logger.error(f"[Permission] Failed to build filter: {e}")
        return None


def ensure_visibility(document_id, owner, visibility='private'):
    """
    Create a default DocumentVisibility record when a document is first uploaded.
    Called from the document upload pipeline.
    """
    from apps.organizations.models import DocumentVisibility
    DocumentVisibility.objects.get_or_create(
        document_id=document_id,
        defaults={'owner': owner, 'visibility': visibility, 'inherit_upward': True}
    )
