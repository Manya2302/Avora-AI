from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import generics
from .models import KnowledgeNode, KnowledgeRelationship


class KnowledgeGraphView(APIView):
    """GET /api/knowledge/graph/ — permission-filtered graph data"""
    def get(self, request):
        from .services.graph_builder import get_knowledge_graph_data
        return Response(get_knowledge_graph_data(request.user))


class BuildGraphView(APIView):
    """POST /api/knowledge/build/"""
    def post(self, request):
        from .services.graph_builder import build_knowledge_graph
        result = build_knowledge_graph(request.user)
        return Response({**result, "message": "Knowledge graph built successfully."})


class KnowledgeSearchView(APIView):
    """GET /api/knowledge/search/?q=<query>"""
    def get(self, request):
        q = request.query_params.get("q","").strip()
        if not q: return Response({"nodes": []})
        nodes = KnowledgeNode.objects.filter(
            owner=request.user, name__icontains=q).values(
            "id","name","node_type","document_id")[:20]
        return Response({"nodes": list(nodes), "query": q})


class VendorProfileView(APIView):
    """GET /api/knowledge/vendor/<name>/"""
    def get(self, request, name):
        try:
            vendor = KnowledgeNode.objects.get(
                owner=request.user, name=name, node_type=KnowledgeNode.NodeType.VENDOR)
            linked = list(vendor.incoming.select_related("source_node").values(
                "source_node__name","source_node__node_type","source_node__document_id",
                "relationship_type","confidence")[:20])
            return Response({"vendor": name, "linked_documents": linked,
                             "doc_count": len(linked)})
        except KnowledgeNode.DoesNotExist:
            return Response({"vendor": name, "linked_documents": [], "doc_count": 0})


# ── Graph Scorer ──────────────────────────────────────────────

class GraphScoreView(APIView):
    """POST /api/knowledge/score/  — AI scores a document for graph suitability."""
    def post(self, request):
        document_id = request.data.get('document_id', '')
        doc_name    = request.data.get('doc_name', 'Untitled')
        text        = request.data.get('text', '')

        if not text:
            # Try to load OCR text from DB
            try:
                from apps.ai.models import DocumentOCR
                ocr = DocumentOCR.objects.get(document_id=document_id)
                text = ocr.cleaned_text or ocr.raw_text or ''
            except Exception:
                text = ''

        if not text:
            return Response({'error': 'No text available to score.'}, status=400)

        from .services.graph_scorer import score_document_for_graph
        result = score_document_for_graph(document_id, text, doc_name)
        return Response(result)


class GraphConfirmView(APIView):
    """POST /api/knowledge/confirm/  — User confirms adding doc to graph."""
    def post(self, request):
        document_id  = request.data.get('document_id', '')
        doc_name     = request.data.get('doc_name', 'Untitled')
        score_result = request.data.get('score_result', {})

        if not document_id or not score_result:
            return Response({'error': 'document_id and score_result are required.'}, status=400)

        from .services.graph_scorer import build_graph_from_score_result
        result = build_graph_from_score_result(
            document_id=document_id,
            owner=request.user,
            doc_name=doc_name,
            score_result=score_result,
        )
        return Response({'message': 'Document added to Knowledge Graph.', **result})
