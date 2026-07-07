from rest_framework import serializers
from .models import Department, OrgRole, OrgMember, DocumentVisibility


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Department
        fields = ['id', 'name', 'description', 'parent', 'color', 'created_at']


class OrgRoleSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True)

    class Meta:
        model  = OrgRole
        fields = ['id', 'name', 'level', 'department', 'department_name', 'description', 'created_at']


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
