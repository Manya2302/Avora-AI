from rest_framework import serializers
from .models import CopilotConversation, CopilotMessage, DocumentReference, PromptTemplate, AIReport, AIRecommendation

class DocumentReferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentReference
        fields = "__all__"

class CopilotMessageSerializer(serializers.ModelSerializer):
    references = DocumentReferenceSerializer(many=True, read_only=True)
    class Meta:
        model = CopilotMessage
        fields = "__all__"

class CopilotConversationSerializer(serializers.ModelSerializer):
    class Meta:
        model = CopilotConversation
        fields = "__all__"
        read_only_fields = ["owner","message_count","summary","created_at","updated_at"]

class ConversationDetailSerializer(serializers.ModelSerializer):
    messages = CopilotMessageSerializer(many=True, read_only=True)
    class Meta:
        model = CopilotConversation
        fields = "__all__"

class PromptTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = PromptTemplate
        fields = "__all__"
        read_only_fields = ["use_count","created_at"]

class AIReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIReport
        fields = "__all__"
        read_only_fields = ["owner","generated_at","created_at"]

class AIRecommendationSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIRecommendation
        fields = "__all__"
        read_only_fields = ["owner","created_at"]
