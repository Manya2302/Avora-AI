from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import generics
from .models import KnowledgeNode, KnowledgeRelationship


class KnowledgeGraphView(APIView):
    """GET /api/knowledge/graph/"""
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
