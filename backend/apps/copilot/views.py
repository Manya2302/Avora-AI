"""Avora AI Phase 4 — Copilot API Views"""
import time
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import generics, status
from django.utils import timezone
from .models import (CopilotConversation, CopilotMessage, DocumentReference,
                     PromptTemplate, AIReport, AIRecommendation, ReasoningLog)
from .serializers import (CopilotConversationSerializer, ConversationDetailSerializer,
                          CopilotMessageSerializer, PromptTemplateSerializer,
                          AIReportSerializer, AIRecommendationSerializer)


class CopilotQueryView(APIView):
    """POST /api/copilot/query/  — Main RAG query endpoint."""

    def post(self, request):
        question    = request.data.get("question","").strip()
        conv_id     = request.data.get("conversation_id")
        mode        = request.data.get("mode","document")
        template_id = request.data.get("template_id")

        if not question:
            return Response({"error": "Question required."}, status=400)

        # Expand from template
        if template_id:
            try:
                tpl = PromptTemplate.objects.get(id=template_id)
                question = tpl.prompt + " " + question
                PromptTemplate.objects.filter(id=template_id).update(
                    use_count=tpl.use_count+1)
            except: pass

        # Get or create conversation
        if conv_id:
            try: conv = CopilotConversation.objects.get(id=conv_id, owner=request.user)
            except: conv = self._new_conversation(request.user, mode, question)
        else:
            conv = self._new_conversation(request.user, mode, question)

        # Build conversation history
        history = list(conv.messages.order_by("created_at").values("role","content")[:8])

        # Run RAG
        from .services.rag_engine import AvoraRAGEngine
        result = AvoraRAGEngine().query(
            question=question,
            owner_id=str(request.user.id),
            mode=mode,
            conversation_history=history,
        )

        # Save user message
        user_msg = CopilotMessage.objects.create(
            conversation=conv, role="user", content=question)

        # Save assistant message
        asst_msg = CopilotMessage.objects.create(
            conversation=conv, role="assistant",
            content=result["answer"],
            thinking=result.get("thinking",""),
            confidence_score=result.get("confidence", 0.0),
            sources_count=result.get("sources_count", 0),
            latency_ms=result.get("latency_ms", 0),
        )

        # Save document references
        for ref in result.get("sources", []):
            DocumentReference.objects.create(
                message=asst_msg,
                document_id=ref["document_id"],
                document_name=ref["document_name"],
                relevance=ref["relevance"],
                excerpt=ref.get("excerpt",""),
            )

        # Save reasoning log
        ReasoningLog.objects.create(
            message=asst_msg,
            query_analysis=result.get("query_expanded",""),
            docs_retrieved=result.get("docs_retrieved",0),
            hallucination_flags=result.get("hallucination_flags",[]),
        )

        # Update conversation
        CopilotConversation.objects.filter(pk=conv.pk).update(
            message_count=conv.messages.count(),
            updated_at=timezone.now(),
        )

        return Response({
            "conversation_id": str(conv.id),
            "message_id":      str(asst_msg.id),
            "answer":          result["answer"],
            "confidence":      result.get("confidence", 0.0),
            "sources":         result.get("sources", []),
            "sources_count":   result.get("sources_count", 0),
            "latency_ms":      result.get("latency_ms", 0),
            "hallucination_flags": result.get("hallucination_flags", []),
            "mode":            mode,
        })

    def _new_conversation(self, user, mode, question):
        title = question[:80] + ("…" if len(question) > 80 else "")
        return CopilotConversation.objects.create(owner=user, mode=mode, title=title)


class ConversationListView(generics.ListAPIView):
    """GET /api/copilot/conversations/"""
    serializer_class = CopilotConversationSerializer
    def get_queryset(self):
        qs = CopilotConversation.objects.filter(owner=self.request.user, is_archived=False)
        if p := self.request.query_params.get("pinned"): qs = qs.filter(is_pinned=True)
        return qs.order_by("-updated_at")[:50]


class ConversationDetailView(generics.RetrieveDestroyAPIView):
    """GET /DELETE /api/copilot/conversations/<id>/"""
    serializer_class = ConversationDetailSerializer
    def get_queryset(self):
        return CopilotConversation.objects.filter(owner=self.request.user)


class PinConversationView(APIView):
    """POST /api/copilot/conversations/<id>/pin/"""
    def post(self, request, pk):
        try:
            conv = CopilotConversation.objects.get(pk=pk, owner=request.user)
            conv.is_pinned = not conv.is_pinned; conv.save()
            return Response({"pinned": conv.is_pinned})
        except: return Response(status=404)


class PromptLibraryView(generics.ListAPIView):
    """GET /api/copilot/prompts/"""
    serializer_class = PromptTemplateSerializer
    def get_queryset(self):
        qs = PromptTemplate.objects.filter(is_builtin=True) | PromptTemplate.objects.filter(owner=self.request.user)
        if cat := self.request.query_params.get("category"): qs = qs.filter(category=cat)
        return qs.distinct().order_by("-use_count")[:50]


class CreatePromptView(generics.CreateAPIView):
    """POST /api/copilot/prompts/create/"""
    serializer_class = PromptTemplateSerializer
    def perform_create(self, serializer):
        serializer.save(owner=self.request.user, is_builtin=False)


class SeedPromptsView(APIView):
    """POST /api/copilot/prompts/seed/"""
    def post(self, request):
        from .services.prompt_library import seed_builtin_prompts
        count = seed_builtin_prompts()
        return Response({"message": f"Seeded {count} built-in prompts."})


class GenerateReportView(APIView):
    """POST /api/copilot/reports/generate/"""
    def post(self, request):
        report_type   = request.data.get("report_type", "custom")
        doc_ids       = request.data.get("document_ids", [])
        custom_prompt = request.data.get("custom_prompt", "")

        if not doc_ids:
            from apps.documents.models import Document
            doc_ids = list(Document.objects.filter(
                owner=request.user, is_deleted=False, status="ai_ready"
            ).values_list("id", flat=True)[:20])
            doc_ids = [str(d) for d in doc_ids]

        from .services.report_generator import generate_ai_report
        result = generate_ai_report(request.user, report_type, doc_ids, custom_prompt)
        return Response(result, status=201)


class ReportListView(generics.ListAPIView):
    """GET /api/copilot/reports/"""
    serializer_class = AIReportSerializer
    def get_queryset(self):
        return AIReport.objects.filter(owner=self.request.user)


class ReportDetailView(generics.RetrieveAPIView):
    """GET /api/copilot/reports/<id>/"""
    serializer_class = AIReportSerializer
    def get_queryset(self):
        return AIReport.objects.filter(owner=self.request.user)


class RecommendationsView(generics.ListAPIView):
    """GET /api/copilot/recommendations/"""
    serializer_class = AIRecommendationSerializer
    def get_queryset(self):
        return AIRecommendation.objects.filter(owner=self.request.user, is_dismissed=False)


class DismissRecommendationView(APIView):
    """PATCH /api/copilot/recommendations/<pk>/dismiss/"""
    def patch(self, request, pk):
        try:
            r = AIRecommendation.objects.get(pk=pk, owner=request.user)
            r.is_dismissed = True; r.save()
            return Response({"status": "dismissed"})
        except: return Response(status=404)


class CopilotDashboardView(APIView):
    """GET /api/copilot/dashboard/  — AI usage metrics."""
    def get(self, request):
        from django.db.models import Count, Avg
        convs = CopilotConversation.objects.filter(owner=request.user)
        msgs  = CopilotMessage.objects.filter(conversation__owner=request.user, role="assistant")
        return Response({
            "total_conversations": convs.count(),
            "total_questions":     msgs.count(),
            "reports_generated":   AIReport.objects.filter(owner=request.user, status="ready").count(),
            "avg_confidence":      round((msgs.aggregate(a=Avg("confidence_score"))["a"] or 0)*100, 1),
            "pinned_convs":        convs.filter(is_pinned=True).count(),
            "recommendations":     AIRecommendation.objects.filter(owner=request.user, is_dismissed=False).count(),
            "recent_convs":        list(convs.order_by("-updated_at").values("id","title","mode","updated_at","message_count")[:5]),
        })


class MultiDocAnalysisView(APIView):
    """POST /api/copilot/analyze/  — Multi-document cross-analysis."""
    def post(self, request):
        doc_ids  = request.data.get("document_ids", [])
        question = request.data.get("question", "Analyze these documents and identify key insights, risks, and relationships.")
        if not doc_ids:
            return Response({"error": "document_ids required."}, status=400)

        from .services.rag_engine import AvoraRAGEngine
        from apps.documents.models import Document
        docs = Document.objects.filter(id__in=doc_ids, owner=request.user)
        result = AvoraRAGEngine().query(
            question=f"Multi-document analysis: {question}",
            owner_id=str(request.user.id),
            mode="knowledge",
        )
        return Response({
            "analysis":    result["answer"],
            "docs_count":  docs.count(),
            "sources":     result.get("sources",[]),
            "confidence":  result.get("confidence",0),
        })
