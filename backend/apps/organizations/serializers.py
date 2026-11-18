from rest_framework import serializers
from .models import Department, OrgRole, OrgMember, DocumentVisibility


def _requester_org(serializer):
    from .tenancy import get_user_org_id
    request = serializer.context.get('request')
    return get_user_org_id(request.user) if request else None


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Department
        fields = ['id', 'name', 'description', 'parent', 'color', 'created_at']

    def validate_parent(self, parent):
        if parent and parent.organization_id != _requester_org(self):
            raise serializers.ValidationError('Parent department not found.')
        if parent and self.instance and parent.pk == self.instance.pk:
            raise serializers.ValidationError('A department cannot be its own parent.')
        return parent


class OrgRoleSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True)

    class Meta:
        model  = OrgRole
        fields = ['id', 'name', 'level', 'department', 'department_name', 'description', 'created_at']

    def validate_department(self, dept):
        if dept and dept.organization_id != _requester_org(self):
            raise serializers.ValidationError('Department not found.')
        return dept

    def validate_level(self, level):
        if not 1 <= level <= 10:
            raise serializers.ValidationError('Level must be between 1 and 10.')
        return level


class OrgMemberSerializer(serializers.ModelSerializer):
    user_email     = serializers.CharField(source='user.email',       read_only=True)
    user_name      = serializers.CharField(source='user.full_name',   read_only=True)
    department_name= serializers.CharField(source='department.name',  read_only=True)
    role_name      = serializers.CharField(source='role.name',        read_only=True)
    role_level     = serializers.IntegerField(source='role.level',    read_only=True)

    class Meta:
        model  = OrgMember
        fields = [
            'id', 'user', 'user_email', 'user_name',
            'department', 'department_name',
            'role', 'role_name', 'role_level',
            'manager', 'is_active', 'joined_at'
        ]
        read_only_fields = ['user', 'joined_at']   # a member row can't be re-pointed at another user

    def validate_department(self, dept):
        if dept and dept.organization_id != _requester_org(self):
            raise serializers.ValidationError('Department not found.')
        return dept

    def validate_role(self, role):
        if role and role.organization_id != _requester_org(self):
            raise serializers.ValidationError('Role not found.')
        return role

    def validate_manager(self, manager):
        from .models import OrgMember
        if manager and not OrgMember.objects.filter(user=manager, organization_id=_requester_org(self)).exists():
            raise serializers.ValidationError('Manager not found.')
        return manager


class DocumentVisibilitySerializer(serializers.ModelSerializer):
    allowed_user_ids       = serializers.PrimaryKeyRelatedField(source='allowed_users',       many=True, read_only=True)
    allowed_department_ids = serializers.PrimaryKeyRelatedField(source='allowed_departments', many=True, read_only=True)
    allowed_role_ids       = serializers.PrimaryKeyRelatedField(source='allowed_roles',       many=True, read_only=True)

    class Meta:
        model  = DocumentVisibility
        fields = [
            'id', 'document_id', 'visibility', 'inherit_upward',
            'allowed_user_ids', 'allowed_department_ids', 'allowed_role_ids',
            'created_at', 'updated_at'
        ]
