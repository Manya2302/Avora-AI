from rest_framework import serializers
from .models import (
    AIProcessingQueue, DocumentOCR, DocumentClassification,
    DocumentMetadataAI, DocumentSummary, DocumentEmbedding,
    DocumentTag, DocumentRelationship, DocumentRecommendation,
    SmartCollection, SmartCollectionDocument,
    SearchHistory, SearchAnalytics,
)

class AIQueueSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIProcessingQueue
        fields = '__all__'

class DocumentOCRSerializer(serializers.ModelSerializer):
    confidence_pct = serializers.SerializerMethodField()
    def get_confidence_pct(self, obj):
        return f"{round(obj.confidence_score * 100, 1)}%"
    class Meta:
        model = DocumentOCR
        fields = '__all__'

class DocumentClassificationSerializer(serializers.ModelSerializer):
    confidence_pct = serializers.SerializerMethodField()
    def get_confidence_pct(self, obj):
        return f"{round(obj.confidence_score * 100, 1)}%"
    class Meta:
        model = DocumentClassification
        fields = '__all__'

class DocumentMetadataAISerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentMetadataAI
        fields = '__all__'

class DocumentSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentSummary
        fields = '__all__'

class DocumentTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentTag
        fields = '__all__'

class DocumentRelationshipSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentRelationship
        fields = '__all__'

class DocumentRecommendationSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentRecommendation
        fields = '__all__'

class SmartCollectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SmartCollection
        fields = '__all__'
        read_only_fields = ['owner', 'document_count', 'created_at', 'updated_at']

class SearchHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = SearchHistory
        fields = '__all__'
        read_only_fields = ['user', 'created_at']

class SearchAnalyticsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SearchAnalytics
        fields = '__all__'

class DocumentInsightSerializer(serializers.Serializer):
    """Full insight bundle for a single document."""
    document_id    = serializers.UUIDField()
    ocr            = DocumentOCRSerializer(allow_null=True)
    classification = DocumentClassificationSerializer(allow_null=True)
    metadata       = DocumentMetadataAISerializer(allow_null=True)
    summary        = DocumentSummarySerializer(allow_null=True)
    tags           = DocumentTagSerializer(many=True)
    relationships  = DocumentRelationshipSerializer(many=True)
    recommendations = DocumentRecommendationSerializer(many=True)
    queue_status   = AIQueueSerializer(allow_null=True)
