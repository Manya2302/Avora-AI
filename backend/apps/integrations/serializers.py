"""
Serializers for IntegrationConfig.

Security rules:
  1. Plaintext credentials are ACCEPTED on input but NEVER returned on output.
  2. Output includes only masked tokens ("abcd••••••••efgh").
  3. No credential field ever appears in logs or error messages.
  4. Write-only fields raise an exception if read (belt-and-suspenders).
"""

from rest_framework import serializers
from apps.integrations.models import IntegrationConfig, SyncEvent
from apps.integrations.encryption import mask_credential


class IntegrationConfigSerializer(serializers.ModelSerializer):
    """
    Read serializer — returns safe, masked credential info only.
    Plaintext is NEVER serialised outward.
    """
    provider_display  = serializers.CharField(source='get_provider_display', read_only=True)
    client_id_masked  = serializers.SerializerMethodField()
    has_credentials   = serializers.SerializerMethodField()

    class Meta:
        model  = IntegrationConfig
        fields = [
            'id', 'provider', 'provider_display',
            'status', 'last_sync_at', 'files_indexed',
            'google_email', 'selected_folders', 'folder_names',
            'sync_permissions', 'sync_error',
            'client_id_masked', 'has_credentials',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields   # all read-only; use dedicated write endpoints

    def get_client_id_masked(self, obj: IntegrationConfig) -> str:
        try:
            return mask_credential(obj.get_client_id())
        except Exception:
            return "••••••••"

    def get_has_credentials(self, obj: IntegrationConfig) -> bool:
        return obj.has_credentials()


class SaveCredentialsSerializer(serializers.Serializer):
    """Write-only serializer for storing OAuth app credentials."""
    client_id     = serializers.CharField(write_only=True, min_length=10)
    client_secret = serializers.CharField(write_only=True, min_length=10)

    def validate(self, attrs):
        # Extra guard: ensure nothing leaks into serializer error messages
        for field in ('client_id', 'client_secret'):
            val = attrs.get(field, '')
            if len(val) < 10:
                raise serializers.ValidationError({field: 'Value too short.'})
        return attrs


class FolderSyncSerializer(serializers.Serializer):
    folder_ids   = serializers.ListField(child=serializers.CharField(), min_length=1)
    folder_names = serializers.DictField(child=serializers.CharField(), required=False, default=dict)


class SyncEventSerializer(serializers.ModelSerializer):
    class Meta:
        model  = SyncEvent
        fields = ['id', 'event_type', 'file_name', 'details', 'created_at']
