"""Invalidate cached ACLs and keep vector payloads in sync when access policy changes."""
from django.db.models.signals import post_save, post_delete, m2m_changed
from django.dispatch import receiver

from .models import DocumentVisibility, OrgMember, OrgRole, Department, Organization
from .permissions import bump_acl_version


for _model in (DocumentVisibility, OrgMember, OrgRole, Department, Organization):
    post_save.connect(bump_acl_version, sender=_model, dispatch_uid=f"acl_save_{_model.__name__}")
    post_delete.connect(bump_acl_version, sender=_model, dispatch_uid=f"acl_del_{_model.__name__}")

for _through in (DocumentVisibility.allowed_users.through,
                 DocumentVisibility.allowed_departments.through,
                 DocumentVisibility.allowed_roles.through):
    m2m_changed.connect(bump_acl_version, sender=_through, dispatch_uid=f"acl_m2m_{_through.__name__}")
