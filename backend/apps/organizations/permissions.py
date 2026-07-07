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


def get_accessible_document_ids(user) -> set:
    """
    Returns a set of document UUIDs (as strings) that `user` is allowed to access.

    Permission rules evaluated in order:
      1. Owner always has access.
      2. visibility = organization  → all users
      3. visibility = department    → owner's department members + upward hierarchy
      4. visibility = user_share    → allowed_users
      5. visibility = custom        → union of allowed_users + allowed_departments + allowed_roles
      6. visibility = private       → owner only
      7. inherit_upward = True      → managers above the owner in the hierarchy also gain access
    """
    from apps.organizations.models import DocumentVisibility, OrgMember

    try:
        member = OrgMember.objects.select_related('department', 'role').get(user=user)
        user_dept = member.department
        user_role = member.role
        user_level = member.role.level if member.role else 99
    except OrgMember.DoesNotExist:
        member = None
        user_dept = None
        user_role = None
        user_level = 99

    accessible = set()
    user_id_str = str(user.id)

    for vis in DocumentVisibility.objects.prefetch_related(
        'allowed_users', 'allowed_departments', 'allowed_roles', 'owner'
    ).all():
        doc_id = str(vis.document_id)
        granted = False

        # 1. Owner always has access
        if str(vis.owner_id) == user_id_str:
            granted = True

        # 2. Organization-wide
        elif vis.visibility == DocumentVisibility.Level.ORGANIZATION:
            granted = True

        # 3. Department visibility
        elif vis.visibility == DocumentVisibility.Level.DEPARTMENT:
            if user_dept and vis.allowed_departments.filter(id=user_dept.id).exists():
                granted = True

        # 4. User-share
        elif vis.visibility == DocumentVisibility.Level.USER_SHARE:
            if vis.allowed_users.filter(id=user.id).exists():
                granted = True

        # 5. Custom
        elif vis.visibility == DocumentVisibility.Level.CUSTOM:
            if vis.allowed_users.filter(id=user.id).exists():
                granted = True
            if not granted and user_dept and vis.allowed_departments.filter(id=user_dept.id).exists():
                granted = True
            if not granted and user_role and vis.allowed_roles.filter(id=user_role.id).exists():
                granted = True

        # 6. Private — no additional grants

        # 7. Upward inheritance: if the requester is a manager/senior
        #    above the document owner, they may also see it.
        if not granted and vis.inherit_upward and member and user_level <= 3:
            # Level ≤3 means senior leadership (MD, CEO, Director)
            # They can see all department documents below them
            try:
                owner_member = OrgMember.objects.select_related('department', 'role').get(user=vis.owner)
                if owner_member.department and user_dept == owner_member.department:
                    # same department, requester is at a higher level
                    if user_level < (owner_member.role.level if owner_member.role else 99):
                        granted = True
                elif user_level <= 2:
                    # Level 1-2 (MD/CEO) see everything with upward inheritance
                    granted = True
            except OrgMember.DoesNotExist:
                pass

        if granted:
            accessible.add(doc_id)

    logger.debug(f"[Permission] User {user.email} → {len(accessible)} accessible documents")
    return accessible


def can_access_document(user, document_id: str) -> bool:
    """Quick check: can this user access one specific document?"""
    return document_id in get_accessible_document_ids(user)


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
