"""
Organizations App - Enterprise AI Governance Layer
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Models:
  - Department          : Org units (Finance, HR, IT, Legal)
  - OrgRole             : Named roles with a hierarchy level
  - OrgMember           : User ↔ Department ↔ Role membership
  - DocumentVisibility  : Per-document access policy (ABAC + RBAC)
"""
import uuid
from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


# ── Department ────────────────────────────────────────────────
class Department(models.Model):
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name        = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    parent      = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name='children',
                                    help_text="Parent department for nested hierarchies")
    color       = models.CharField(max_length=7, default='#1A3DAF',
                                   help_text="Hex color for org-chart display")
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'org_departments'
        ordering = ['name']

    def __str__(self):
        return self.name


# ── OrgRole ───────────────────────────────────────────────────
class OrgRole(models.Model):
    """Named hierarchical role.
    level 1 = highest authority (MD/CEO), level 10 = entry-level.
    Users at a lower numeric level can see documents from higher numeric levels
    if inherit_upward is True on the document.
    """
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name        = models.CharField(max_length=100)       # e.g. "Finance Director"
    level       = models.PositiveIntegerField(default=5, help_text="1=highest, 10=lowest")
    department  = models.ForeignKey(Department, null=True, blank=True,
                                    on_delete=models.SET_NULL, related_name='roles')
    description = models.TextField(blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table  = 'org_roles'
        ordering  = ['level', 'name']

    def __str__(self):
        return f"{self.name} (L{self.level})"


# ── OrgMember ─────────────────────────────────────────────────
class OrgMember(models.Model):
    """Binds a user to a department and a role inside the organization."""
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user       = models.OneToOneField(User, on_delete=models.CASCADE, related_name='org_member')
    department = models.ForeignKey(Department, on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name='members')
    role       = models.ForeignKey(OrgRole, on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name='members')
    manager    = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='direct_reports',
                                   help_text="Immediate manager in the org tree")
    joined_at  = models.DateTimeField(auto_now_add=True)
    is_active  = models.BooleanField(default=True)

    class Meta:
        db_table = 'org_members'

    def __str__(self):
        return f"{self.user.email} → {self.department} / {self.role}"


# ── DocumentVisibility ────────────────────────────────────────
class DocumentVisibility(models.Model):
    """
    Per-document ABAC access policy.

    Visibility levels (in ascending breadth):
      private      – owner only
      user_share   – owner + specific named users
      department   – everyone in allowed_departments
      organization – every registered user
      custom       – union of allowed_users + allowed_departments + allowed_roles
    """
    class Level(models.TextChoices):
        PRIVATE      = 'private',      'Private'
        USER_SHARE   = 'user_share',   'User Share'
        DEPARTMENT   = 'department',   'Department'
        ORGANIZATION = 'organization', 'Organization'
        CUSTOM       = 'custom',       'Custom'

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document_id = models.UUIDField(unique=True, db_index=True)
    owner       = models.ForeignKey(User, on_delete=models.CASCADE, related_name='doc_visibility')

    visibility  = models.CharField(max_length=20, choices=Level.choices, default=Level.PRIVATE)

    # Fine-grained allow-lists (used when visibility = user_share, department, or custom)
    allowed_users       = models.ManyToManyField(User, blank=True, related_name='shared_with_me')
    allowed_departments = models.ManyToManyField(Department, blank=True, related_name='visible_docs')
    allowed_roles       = models.ManyToManyField(OrgRole, blank=True, related_name='visible_docs')

    # Hierarchical upward inheritance
    # If True: anyone above the owner in the department chain can also read this doc.
    inherit_upward = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'document_visibility'

    def __str__(self):
        return f"Doc {self.document_id} → {self.visibility}"
