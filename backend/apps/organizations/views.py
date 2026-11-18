from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.core.exceptions import ValidationError as DjangoValidationError
from .models import Department, OrgRole, OrgMember, DocumentVisibility
from .serializers import (
    DepartmentSerializer, OrgRoleSerializer,
    OrgMemberSerializer, DocumentVisibilitySerializer
)


from .tenancy import get_user_org_id, is_platform_superuser


class TenantScopedMixin:
    """Every directory query is limited to the requester's organization."""
    def org_id(self):
        return get_user_org_id(self.request.user)

    def scope(self, qs):
        if is_platform_superuser(self.request.user) and self.request.query_params.get("all_orgs") == "1":
            return qs
        return qs.filter(organization_id=self.org_id())


# ── Departments ───────────────────────────────────────────────

class DepartmentListCreateView(TenantScopedMixin, generics.ListCreateAPIView):
    """GET/POST /api/org/departments/"""
    serializer_class = DepartmentSerializer

    def get_queryset(self):
        return self.scope(Department.objects.all()).order_by('name')

    def get_permissions(self):
        if self.request.method == 'POST':
            return [permissions.IsAdminUser()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        serializer.save(organization_id=self.org_id())


class DepartmentDetailView(TenantScopedMixin, generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/org/departments/<pk>/"""
    serializer_class = DepartmentSerializer

    def get_queryset(self):
        return self.scope(Department.objects.all())

    def get_permissions(self):
        if self.request.method in ('PATCH', 'PUT', 'DELETE'):
            return [permissions.IsAdminUser()]
        return [permissions.IsAuthenticated()]


# ── Roles ─────────────────────────────────────────────────────

class OrgRoleListCreateView(TenantScopedMixin, generics.ListCreateAPIView):
    """GET/POST /api/org/roles/"""
    serializer_class = OrgRoleSerializer

    def get_queryset(self):
        return self.scope(OrgRole.objects.select_related('department')).order_by('level', 'name')

    def get_permissions(self):
        if self.request.method == 'POST':
            return [permissions.IsAdminUser()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        serializer.save(organization_id=self.org_id())


class OrgRoleDetailView(TenantScopedMixin, generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/org/roles/<pk>/"""
    serializer_class = OrgRoleSerializer

    def get_queryset(self):
        return self.scope(OrgRole.objects.select_related('department'))

    def get_permissions(self):
        if self.request.method in ('PATCH', 'PUT', 'DELETE'):
            return [permissions.IsAdminUser()]
        return [permissions.IsAuthenticated()]


# ── Members ───────────────────────────────────────────────────

class OrgMemberListView(TenantScopedMixin, generics.ListAPIView):
    """GET /api/org/members/ — the directory of the caller's organization only."""
    serializer_class = OrgMemberSerializer

    def get_queryset(self):
        import uuid
        qs = self.scope(OrgMember.objects.select_related('user', 'department', 'role', 'manager')) \
            .order_by('user__full_name')
        dept = self.request.query_params.get('department')
        if dept:
            try:
                qs = qs.filter(department_id=uuid.UUID(dept))
            except ValueError:
                return OrgMember.objects.none()
        return qs


class OrgMemberAssignView(APIView):
    """POST /api/org/members/assign/ — assign a user (of your organization) to dept+role"""
    permission_classes = [permissions.IsAdminUser]

    def post(self, request):
        import uuid
        from django.contrib.auth import get_user_model
        User = get_user_model()
        org_id = get_user_org_id(request.user)

        def _uuid(v):
            try:
                return uuid.UUID(str(v)) if v not in (None, '') else None
            except ValueError:
                raise ValueError

        try:
            user_id, dept_id, role_id, manager_id = (_uuid(request.data.get(k)) for k in
                                                     ('user_id', 'department_id', 'role_id', 'manager_id'))
        except ValueError:
            return Response({'error': 'Invalid id.'}, status=400)

        user = User.objects.filter(id=user_id).first() if user_id else None
        if user is None:
            return Response({'error': 'User not found.'}, status=404)
        target_org = OrgMember.objects.filter(user=user).values_list('organization_id', flat=True).first()
        superuser = is_platform_superuser(request.user)
        if target_org != org_id and not superuser:
            # moving people between organizations is a platform-level action
            return Response({'error': 'User not found.'}, status=404)
        if dept_id and not Department.objects.filter(id=dept_id, organization_id=org_id).exists():
            return Response({'error': 'Department not found.'}, status=400)
        if role_id and not OrgRole.objects.filter(id=role_id, organization_id=org_id).exists():
            return Response({'error': 'Role not found.'}, status=400)
        if manager_id and not OrgMember.objects.filter(user_id=manager_id, organization_id=org_id).exists():
            return Response({'error': 'Manager not found.'}, status=400)

        member, _ = OrgMember.objects.update_or_create(
            user=user,
            defaults={
                'organization_id': org_id,
                'department_id': dept_id,
                'role_id':       role_id,
                'manager_id':    manager_id,
                'is_active':     True,
            }
        )
        return Response(OrgMemberSerializer(member).data, status=201)


class OrgMemberDetailView(TenantScopedMixin, generics.RetrieveUpdateDestroyAPIView):
    """PATCH /api/org/members/<pk>/"""
    serializer_class = OrgMemberSerializer
    permission_classes = [permissions.IsAdminUser]

    def get_queryset(self):
        return self.scope(OrgMember.objects.select_related('user', 'department', 'role'))


# ── Org Tree ──────────────────────────────────────────────────

class OrgTreeView(APIView):
    """GET /api/org/tree/ — full org hierarchy for graph display"""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # 3 queries total, any depth: departments, roles, active members (was 2+ per department)
        from collections import defaultdict
        from django.db.models import Prefetch
        depts = list(Department.objects.filter(organization_id=get_user_org_id(request.user)).prefetch_related(
            'roles',
            Prefetch('members', queryset=OrgMember.objects.filter(is_active=True).select_related('user', 'role'),
                     to_attr='active_members'),
        ))
        children = defaultdict(list)
        for d in depts:
            children[d.parent_id].append(d)

        def build_node(dept, depth=0):
            return {
                'id':          str(dept.id),
                'name':        dept.name,
                'color':       dept.color,
                'member_count': len(dept.active_members),
                'roles':       [{'id': str(r.id), 'name': r.name, 'level': r.level} for r in dept.roles.all()],
                'members': [
                    {
                        'id':    str(m.user.id),
                        'name':  m.user.full_name,
                        'email': m.user.email,
                        'role':  m.role.name if m.role else None,
                    }
                    for m in dept.active_members
                ],
                'children': [build_node(c, depth + 1) for c in children.get(dept.id, [])] if depth < 20 else [],
            }

        roots = children.get(None, [])
        return Response({'tree': [build_node(d) for d in roots]})


# ── Document Visibility ───────────────────────────────────────

class DocumentVisibilityView(APIView):
    """GET/PATCH /api/org/visibility/<document_id>/"""
    permission_classes = [permissions.IsAuthenticated]

    @staticmethod
    def _owned_document(request, document_id):
        from apps.documents.models import Document
        qs = Document.objects.filter(id=document_id, is_deleted=False)
        if not request.user.is_staff:
            qs = qs.filter(owner=request.user)
        return qs.only('id', 'owner_id').first()

    def get(self, request, document_id):
        doc = self._owned_document(request, document_id)
        if doc is None:
            return Response({'error': 'Document not found.'}, status=404)
        vis = DocumentVisibility.objects.filter(document_id=document_id).first()
        if vis is None:
            return Response({'visibility': 'private', 'document_id': str(document_id)})
        return Response(DocumentVisibilitySerializer(vis).data)

    def patch(self, request, document_id):
        # Ownership is decided by the Document row — never by who touches the policy first.
        doc = self._owned_document(request, document_id)
        if doc is None:
            return Response({'error': 'Document not found.'}, status=404)

        data = request.data
        level = data.get('visibility')
        if level is not None and level not in DocumentVisibility.Level.values:
            return Response({'error': f'visibility must be one of {DocumentVisibility.Level.values}'}, status=400)

        from django.db import transaction
        with transaction.atomic():
            vis, _ = DocumentVisibility.objects.get_or_create(
                document_id=document_id, defaults={'owner_id': doc.owner_id})
            if vis.owner_id != doc.owner_id:  # repair rows created by the old hijackable code path
                vis.owner_id = doc.owner_id
            if level is not None:
                vis.visibility = level
            if 'inherit_upward' in data:
                vis.inherit_upward = str(data['inherit_upward']).lower() in ('1', 'true', 'yes')
            vis.save()

            # Grants can only target people/departments/roles of the owner's organization
            org_id = get_user_org_id(request.user)
            try:
                if 'allowed_user_ids' in data:
                    from django.contrib.auth import get_user_model
                    vis.allowed_users.set(get_user_model().objects.filter(
                        id__in=list(data['allowed_user_ids'] or []), org_member__organization_id=org_id))
                if 'allowed_department_ids' in data:
                    vis.allowed_departments.set(Department.objects.filter(
                        id__in=list(data['allowed_department_ids'] or []), organization_id=org_id))
                if 'allowed_role_ids' in data:
                    vis.allowed_roles.set(OrgRole.objects.filter(
                        id__in=list(data['allowed_role_ids'] or []), organization_id=org_id))
            except (ValueError, TypeError, DjangoValidationError):
                transaction.set_rollback(True)
                return Response({'error': 'Invalid id in allowed_*_ids.'}, status=400)

        return Response(DocumentVisibilitySerializer(vis).data)


class MyPermissionsView(APIView):
    """GET /api/org/my-permissions/ — what can the current user access?"""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from .permissions import get_accessible_document_ids
        doc_ids = get_accessible_document_ids(request.user)

        try:
            member = OrgMember.objects.select_related('department', 'role').get(user=request.user)
            dept   = {'id': str(member.department.id), 'name': member.department.name} if member.department else None
            role   = {'id': str(member.role.id), 'name': member.role.name, 'level': member.role.level} if member.role else None
        except OrgMember.DoesNotExist:
            dept = None
            role = None

        return Response({
            'user_id':              str(request.user.id),
            'department':           dept,
            'role':                 role,
            'accessible_doc_count': len(doc_ids),
        })
