from rest_framework import serializers
from .models import AuditLog

class AuditLogSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source='user.email', read_only=True, default='—')
    user_name  = serializers.CharField(source='user.full_name', read_only=True, default='—')

    class Meta:
        model  = AuditLog
        fields = ['id','user_email','user_name','action','document_id',
                  'resource','ip_address','is_flagged','created_at']
