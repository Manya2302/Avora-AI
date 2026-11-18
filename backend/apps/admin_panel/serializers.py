"""Serializers used only by the admin console (/api/admin-panel/...)."""
from rest_framework import serializers
from apps.users.serializers import UserSerializer
from apps.documents.serializers import DocumentListSerializer


class AdminUserSerializer(UserSerializer):
    """UserSerializer plus usage counts, with role / is_active writable (admins only —
    the view enforces the self / last-admin guards)."""
    document_count = serializers.IntegerField(read_only=True, default=0)
    storage_bytes  = serializers.IntegerField(read_only=True, default=0)

    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + ['last_login', 'document_count', 'storage_bytes']
        read_only_fields = ['id', 'email', 'is_email_verified', 'created_at', 'last_login']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['storage_bytes'] = data.get('storage_bytes') or 0
        data['document_count'] = data.get('document_count') or 0
        return data


class AdminDocumentSerializer(DocumentListSerializer):
    """Document list row plus who owns it (admins see every user's documents)."""
    owner_id    = serializers.UUIDField(source='owner.id', read_only=True)
    owner_email = serializers.CharField(source='owner.email', read_only=True, default='')
    owner_name  = serializers.CharField(source='owner.full_name', read_only=True, default='')

    class Meta(DocumentListSerializer.Meta):
        fields = DocumentListSerializer.Meta.fields + ['owner_id', 'owner_email', 'owner_name']
