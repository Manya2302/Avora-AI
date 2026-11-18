"""
Tenant resolution.

Every user belongs to one Organization (via OrgMember). Directory endpoints, org
structure, and organization-wide document visibility are scoped to it.

SIGNUP_ORGANIZATION_MODE
  default   new users join the shared "Default Organization" (single-company install;
            identical to the previous behaviour)
  isolated  each new user gets their own organization (multi-tenant SaaS). Moving a
            user between organizations is a superuser operation.
"""
from django.conf import settings
from django.core.cache import cache
from django.db import transaction

DEFAULT_ORG_NAME = "Default Organization"


def _mode() -> str:
    return getattr(settings, "SIGNUP_ORGANIZATION_MODE", "default")


def default_organization():
    from .models import Organization
    org = Organization.objects.filter(name=DEFAULT_ORG_NAME).order_by("created_at").first()
    return org or Organization.objects.create(name=DEFAULT_ORG_NAME)


@transaction.atomic
def ensure_membership(user, company_name: str = ""):
    """Return the user's OrgMember, creating one (and an organization if isolated)."""
    from .models import OrgMember, Organization
    member = OrgMember.objects.select_for_update().filter(user=user).select_related("organization").first()
    if member and member.organization_id:
        return member
    if _mode() == "isolated":
        org = Organization.objects.create(name=(company_name or f"{user.full_name or user.email}'s organization")[:200])
    else:
        org = default_organization()
    if member:
        member.organization = org
        member.save(update_fields=["organization"])
        return member
    return OrgMember.objects.create(user=user, organization=org)


def _version():
    from .permissions import _acl_version
    return _acl_version()


def get_user_org_id(user):
    """Organization id for `user` (cached; invalidated with the ACL version on any membership change)."""
    if user is None or not getattr(user, "is_authenticated", False):
        return None
    key = f"tenant:{_version()}:{user.id}"
    org_id = cache.get(key)
    if org_id is None:
        from .models import OrgMember
        org_id = OrgMember.objects.filter(user=user).values_list("organization_id", flat=True).first()
        if org_id is None:
            org_id = ensure_membership(user).organization_id
        cache.set(key, org_id, 300)
    return org_id


def is_platform_superuser(user) -> bool:
    return bool(getattr(user, "is_superuser", False))


def same_org_user_ids(user, ids) -> list:
    """Filter a list of user ids down to members of `user`'s organization."""
    from .models import OrgMember
    org_id = get_user_org_id(user)
    return list(OrgMember.objects.filter(organization_id=org_id, user_id__in=list(ids or []))
                .values_list("user_id", flat=True))
