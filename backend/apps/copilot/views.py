"""Avora AI Phase 4 — Copilot API Views"""
import time
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import generics, status
from django.utils import timezone
from django.db import transaction
from django.db.models import F, Q
from apps.admin_panel.permissions import IsAdminRole


def _is_uuid(v) -> bool:
    import uuid
    try:
        uuid.UUID(str(v))
        return True
    except (ValueError, TypeError, AttributeError):
        return False
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
        question = question[:4000]
        if template_id:
            # Only built-in, public, or the caller's own templates (no reading others' prompts)
            tpl = (PromptTemplate.objects
                   .filter(Q(is_builtin=True) | Q(is_public=True) | Q(owner=request.user), id=template_id)
                   .only("id", "prompt").first() if _is_uuid(template_id) else None)
            if tpl:
                question = tpl.prompt + " " + question
                PromptTemplate.objects.filter(id=tpl.id).update(use_count=F("use_count") + 1)

        # Get or create conversation
        conv = None
        if conv_id and _is_uuid(conv_id):
            conv = CopilotConversation.objects.filter(id=conv_id, owner=request.user).first()
        if conv is None:
            conv = self._new_conversation(request.user, mode, question)

        # Build conversation history
        # The LAST 8 messages, oldest→newest (previously took the FIRST 8 of the conversation)
        history = list(conv.messages.order_by("-created_at").values("role", "content")[:8])[::-1]

        # Run RAG
        from .services.rag_engine import AvoraRAGEngine
        result = AvoraRAGEngine().query(
            question=question,
            owner_id=str(request.user.id),
            user=request.user,
            mode=mode,
            conversation_history=history,
        )

        with transaction.atomic():
            asst_msg = self._persist(conv, question, result)

        # Tag each citation with where its document came from (uploads / google_drive)
        from .services.source_origin import annotate_origins
        annotate_origins(result.get("sources") or [])


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
            "active_agent":    result.get("active_agent", "Search Agent"),
            "agent_reason":    result.get("agent_reason", ""),
        })

    @staticmethod
    def _persist(conv, question, result):
        """All writes for one Q&A turn in one transaction, references bulk-inserted."""
        CopilotMessage.objects.create(conversation=conv, role="user", content=question)
        asst_msg = CopilotMessage.objects.create(
            conversation=conv, role="assistant",
            content=result["answer"],
            thinking=result.get("thinking", ""),
            confidence_score=result.get("confidence", 0.0),
            sources_count=result.get("sources_count", 0),
            latency_ms=result.get("latency_ms", 0),
        )
        DocumentReference.objects.bulk_create([
            DocumentReference(message=asst_msg, document_id=ref["document_id"],
                              document_name=ref.get("document_name", ""), relevance=ref.get("relevance", 0),
                              excerpt=ref.get("excerpt", ""))
            for ref in result.get("sources", [])
        ])
        ReasoningLog.objects.create(
            message=asst_msg,
            query_analysis=result.get("query_expanded", ""),
            docs_retrieved=result.get("docs_retrieved", 0),
            hallucination_flags=result.get("hallucination_flags", []),
        )
        CopilotConversation.objects.filter(pk=conv.pk).update(
            message_count=F("message_count") + 2, updated_at=timezone.now())
        return asst_msg

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
        return (CopilotConversation.objects.filter(owner=self.request.user)
                .prefetch_related("messages__references"))


class PinConversationView(APIView):
    """POST /api/copilot/conversations/<id>/pin/"""
    def post(self, request, pk):
        try:
            conv = CopilotConversation.objects.get(pk=pk, owner=request.user)
            conv.is_pinned = not conv.is_pinned; conv.save()
            return Response({"pinned": conv.is_pinned})
        except Exception: return Response(status=404)


class PromptLibraryView(generics.ListAPIView):
    """GET /api/copilot/prompts/"""
    serializer_class = PromptTemplateSerializer
    def get_queryset(self):
        qs = PromptTemplate.objects.filter(Q(is_builtin=True) | Q(owner=self.request.user))
        if cat := self.request.query_params.get("category"): qs = qs.filter(category=cat)
        return qs.order_by("-use_count")[:50]


class UsePromptView(APIView):
    """POST /api/copilot/prompts/<id>/use/ — fetch one template to open in Copilot and count the use.
    Visible templates only: built-in, public, or the caller's own (same rule as the query endpoint)."""
    def post(self, request, pk):
        tpl = (PromptTemplate.objects
               .filter(Q(is_builtin=True) | Q(is_public=True) | Q(owner=request.user), id=pk).first())
        if not tpl:
            return Response({"error": "Prompt not found."}, status=404)
        PromptTemplate.objects.filter(id=tpl.id).update(use_count=F("use_count") + 1)
        tpl.refresh_from_db(fields=["use_count"])
        return Response(PromptTemplateSerializer(tpl).data)


class CreatePromptView(generics.CreateAPIView):
    """POST /api/copilot/prompts/create/"""
    serializer_class = PromptTemplateSerializer
    def perform_create(self, serializer):
        serializer.save(owner=self.request.user, is_builtin=False)


class SeedPromptsView(APIView):
    """POST /api/copilot/prompts/seed/  (admins only — writes global built-ins)"""
    permission_classes = [IsAdminRole]
    def post(self, request):
        from .services.prompt_library import seed_builtin_prompts
        count = seed_builtin_prompts()
        return Response({"message": f"Seeded {count} built-in prompts."})


class GenerateReportView(APIView):
    """POST /api/copilot/reports/generate/"""
    def post(self, request):
        report_type   = request.data.get("report_type", "custom")
        doc_ids       = request.data.get("document_ids", []) or []
        custom_prompt = str(request.data.get("custom_prompt", ""))[:4000]
        if not isinstance(doc_ids, list):
            return Response({"error": "document_ids must be a list."}, status=400)
        doc_ids = [str(d) for d in doc_ids if _is_uuid(d)][:50]

        if not doc_ids:
            from apps.documents.models import Document
            doc_ids = list(Document.objects.filter(
                owner=request.user, is_deleted=False, status="ai_ready"
            ).values_list("id", flat=True)[:20])
            doc_ids = [str(d) for d in doc_ids]

        # Returns immediately; the LLM work runs in the background.
        # Poll GET /api/copilot/reports/<report_id>/ until status is "ready" or "failed".
        from .services.report_generator import create_report
        from .tasks import generate_report_task
        from apps.ai.services.dispatch import dispatch
        report = create_report(request.user, report_type, doc_ids, custom_prompt)
        dispatch(generate_report_task, str(report.id))
        return Response({"report_id": str(report.id), "status": report.status, "title": report.title,
                         "doc_count": report.doc_count,
                         "poll_url": f"/api/copilot/reports/{report.id}/"}, status=202)


class ReportListView(generics.ListAPIView):
    """GET /api/copilot/reports/"""
    serializer_class = AIReportSerializer
    def get_queryset(self):
        return AIReport.objects.filter(owner=self.request.user).order_by("-created_at")


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
        except Exception: return Response(status=404)


class CopilotDashboardView(APIView):
    """GET /api/copilot/dashboard/  — AI usage metrics."""
    def get(self, request):
        from django.db.models import Count, Avg
        convs = CopilotConversation.objects.filter(owner=request.user)
        c = convs.aggregate(total=Count("id"), pinned=Count("id", filter=Q(is_pinned=True)))
        m = CopilotMessage.objects.filter(conversation__owner=request.user, role="assistant").aggregate(
            n=Count("id"), avg=Avg("confidence_score"))
        return Response({
            "total_conversations": c["total"],
            "total_questions":     m["n"],
            "reports_generated":   AIReport.objects.filter(owner=request.user, status="ready").count(),
            # null (not 0) when nothing has been answered yet — the UI shows "—"
            "avg_confidence":      round(m["avg"] * 100, 1) if m["avg"] is not None else None,
            "pinned_convs":        c["pinned"],
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
            user=request.user,
            mode="knowledge",
        )
        return Response({
            "analysis":    result["answer"],
            "docs_count":  docs.count(),
            "sources":     result.get("sources",[]),
            "confidence":  result.get("confidence",0),
        })
