from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import Department, OrgRole, OrgMember, DocumentVisibility
from .serializers import (
    DepartmentSerializer, OrgRoleSerializer,
    OrgMemberSerializer, DocumentVisibilitySerializer
)


# ── Departments ───────────────────────────────────────────────

class DepartmentListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/org/departments/"""
    serializer_class = DepartmentSerializer
    queryset = Department.objects.all()

    def get_permissions(self):
        if self.request.method == 'POST':
            return [permissions.IsAdminUser()]
        return [permissions.IsAuthenticated()]


class DepartmentDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/org/departments/<pk>/"""
    serializer_class = DepartmentSerializer
    queryset = Department.objects.all()

    def get_permissions(self):
        if self.request.method in ('PATCH', 'PUT', 'DELETE'):
            return [permissions.IsAdminUser()]
        return [permissions.IsAuthenticated()]


# ── Roles ─────────────────────────────────────────────────────

class OrgRoleListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/org/roles/"""
    serializer_class = OrgRoleSerializer
    queryset = OrgRole.objects.all()

    def get_permissions(self):
        if self.request.method == 'POST':
            return [permissions.IsAdminUser()]
        return [permissions.IsAuthenticated()]


class OrgRoleDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/org/roles/<pk>/"""
    serializer_class = OrgRoleSerializer
    queryset = OrgRole.objects.all()

    def get_permissions(self):
        if self.request.method in ('PATCH', 'PUT', 'DELETE'):
            return [permissions.IsAdminUser()]
        return [permissions.IsAuthenticated()]


# ── Members ───────────────────────────────────────────────────

class OrgMemberListView(generics.ListAPIView):
    """GET /api/org/members/"""
    serializer_class = OrgMemberSerializer

    def get_queryset(self):
        qs = OrgMember.objects.select_related('user', 'department', 'role', 'manager')
        dept = self.request.query_params.get('department')
        if dept:
            qs = qs.filter(department_id=dept)
        return qs


class OrgMemberAssignView(APIView):
    """POST /api/org/members/assign/ — assign a user to dept+role"""
    permission_classes = [permissions.IsAdminUser]

    def post(self, request):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        user_id    = request.data.get('user_id')
        dept_id    = request.data.get('department_id')
        role_id    = request.data.get('role_id')
        manager_id = request.data.get('manager_id')

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found.'}, status=404)

        member, _ = OrgMember.objects.update_or_create(
            user=user,
            defaults={
                'department_id': dept_id,
                'role_id':       role_id,
                'manager_id':    manager_id,
                'is_active':     True,
            }
        )
        return Response(OrgMemberSerializer(member).data, status=201)


class OrgMemberDetailView(generics.RetrieveUpdateDestroyAPIView):
    """PATCH /api/org/members/<pk>/"""
    serializer_class = OrgMemberSerializer
    permission_classes = [permissions.IsAdminUser]
    queryset = OrgMember.objects.all()


# ── Org Tree ──────────────────────────────────────────────────

class OrgTreeView(APIView):
    """GET /api/org/tree/ — full org hierarchy for graph display"""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        depts = Department.objects.prefetch_related('children', 'roles', 'members__user').all()

        def build_node(dept):
            return {
                'id':          str(dept.id),
                'name':        dept.name,
                'color':       dept.color,
                'member_count': dept.members.filter(is_active=True).count(),
                'roles':       [{'id': str(r.id), 'name': r.name, 'level': r.level} for r in dept.roles.all()],
                'members': [
                    {
                        'id':    str(m.user.id),
                        'name':  m.user.full_name,
                        'email': m.user.email,
                        'role':  m.role.name if m.role else None,
                    }
                    for m in dept.members.filter(is_active=True).select_related('user', 'role')
                ],
                'children': [build_node(c) for c in dept.children.all()],
            }

        roots = depts.filter(parent=None)
        return Response({'tree': [build_node(d) for d in roots]})


# ── Document Visibility ───────────────────────────────────────

class DocumentVisibilityView(APIView):
    """GET/PATCH /api/org/visibility/<document_id>/"""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, document_id):
        try:
            vis = DocumentVisibility.objects.get(document_id=document_id, owner=request.user)
            return Response(DocumentVisibilitySerializer(vis).data)
        except DocumentVisibility.DoesNotExist:
            return Response({'visibility': 'private', 'document_id': str(document_id)})

    def patch(self, request, document_id):
        vis, _ = DocumentVisibility.objects.get_or_create(
            document_id=document_id,
            defaults={'owner': request.user}
        )
        if vis.owner != request.user and not request.user.is_staff:
            return Response({'error': 'You do not own this document.'}, status=403)

        data = request.data
        vis.visibility     = data.get('visibility', vis.visibility)
        vis.inherit_upward = data.get('inherit_upward', vis.inherit_upward)
        vis.save()

        if 'allowed_user_ids' in data:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            vis.allowed_users.set(User.objects.filter(id__in=data['allowed_user_ids']))

        if 'allowed_department_ids' in data:
            vis.allowed_departments.set(Department.objects.filter(id__in=data['allowed_department_ids']))

        if 'allowed_role_ids' in data:
            vis.allowed_roles.set(OrgRole.objects.filter(id__in=data['allowed_role_ids']))

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
