"""
Avora AI — Phase 2 API Views
Semantic Search, Collections, Insights, Similarity, Recommendations, Analytics
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import generics, status, permissions
from django.db.models import Count, Avg, Sum
from .models import (
    AIProcessingQueue, DocumentOCR, DocumentClassification,
    DocumentSummary, DocumentMetadataAI, DocumentTag, DocumentRelationship,
    DocumentRecommendation, SmartCollection, SmartCollectionDocument,
    SearchHistory, SearchAnalytics,
)
from .serializers import (
    AIQueueSerializer, SmartCollectionSerializer,
    SearchHistorySerializer, SearchAnalyticsSerializer,
)


# ── Semantic Search ───────────────────────────────────────────

class SemanticSearchView(APIView):
    """POST /api/ai/search/"""
    def post(self, request):
        query = request.data.get('query', '').strip()
        if not query:
            return Response({'error': 'Query is required.'}, status=400)
        from .services.search import semantic_search
        result = semantic_search(
            query    = query,
            owner_id = str(request.user.id),
            top_k    = int(request.data.get('top_k', 10)),
            filters  = request.data.get('filters', {}),
            user     = request.user,
        )

        # Run RAG engine to generate the AI response for the search query
        from apps.copilot.services.rag_engine import AvoraRAGEngine
        try:
            rag_result = AvoraRAGEngine().query(
                question=query,
                owner_id=str(request.user.id),
                mode="document"
            )
            result['ai_answer'] = rag_result.get('answer', '')
            result['ai_confidence'] = rag_result.get('confidence', 0.0)
        except Exception as e:
            result['ai_answer'] = ''
            result['ai_confidence'] = 0.0

        return Response(result)


class SearchSuggestionsView(APIView):
    """GET /api/ai/search/suggestions/?q=<partial>"""
    def get(self, request):
        partial = request.query_params.get('q', '').strip()
        if len(partial) < 2:
            return Response({'suggestions': []})
        from .services.search import get_search_suggestions
        suggestions = get_search_suggestions(partial, str(request.user.id))
        return Response({'suggestions': suggestions})


class SearchHistoryView(generics.ListAPIView):
    """GET /api/ai/search/history/"""
    serializer_class = SearchHistorySerializer
    def get_queryset(self):
        return SearchHistory.objects.filter(user=self.request.user)[:50]


class PopularSearchesView(APIView):
    """GET /api/ai/search/popular/"""
    def get(self, request):
        popular = SearchAnalytics.objects.order_by('-search_count')[:10]
        return Response({'popular': [{'query': p.query, 'count': p.search_count} for p in popular]})


# ── Document Intelligence ─────────────────────────────────────

class DocumentInsightView(APIView):
    """GET /api/ai/insights/<document_id>/  — Full AI insight bundle."""
    def get(self, request, document_id):
        def _get(Model, **kw):
            try: return Model.objects.get(**kw)
            except Model.DoesNotExist: return None

        ocr            = _get(DocumentOCR,            document_id=document_id)
        classification = _get(DocumentClassification, document_id=document_id)
        metadata       = _get(DocumentMetadataAI,     document_id=document_id)
        summary        = _get(DocumentSummary,         document_id=document_id)
        queue          = AIProcessingQueue.objects.filter(document_id=document_id).first()
        tags           = list(DocumentTag.objects.filter(document_id=document_id).values('tag', 'confidence'))
        relationships  = list(DocumentRelationship.objects.filter(
            source_document_id=document_id).values('target_document_id','relationship_type','similarity_score')[:8])
        recommendations = list(DocumentRecommendation.objects.filter(
            document_id=document_id).order_by('-score').values('recommended_document_id','score','reason')[:6])

        return Response({
            'document_id':    str(document_id),
            'queue':          AIQueueSerializer(queue).data if queue else None,
            'ocr':            {'status': ocr.status, 'confidence': ocr.confidence_score, 'word_count': ocr.word_count, 'page_count': ocr.page_count, 'engine': ocr.engine_used} if ocr else None,
            'classification': {'category': classification.category, 'confidence': classification.confidence_score, 'confidentiality': classification.confidentiality, 'risk_score': classification.risk_score} if classification else None,
            'metadata':       {'vendor': metadata.vendor, 'client': metadata.client, 'department': metadata.department, 'year': metadata.year, 'amount': str(metadata.amount) if metadata.amount else None, 'currency': metadata.currency, 'country': metadata.country, 'keywords': metadata.keywords, 'entities': metadata.entities} if metadata else None,
            'summary':        {'short': summary.short_summary, 'medium': summary.medium_summary, 'long': summary.long_summary, 'key_points': summary.key_points} if summary else None,
            'tags':           tags,
            'relationships':  relationships,
            'recommendations':recommendations,
        })


class OrivoPipelineStatusView(APIView):
    """GET /api/ai/pipeline/<document_id>/"""
    def get(self, request, document_id):
        queue = AIProcessingQueue.objects.filter(document_id=document_id).first()
        if not queue:
            return Response({'stage': 'not_started', 'progress': 0})
        return Response(AIQueueSerializer(queue).data)


class RetriggerPipelineView(APIView):
    """POST /api/ai/pipeline/<document_id>/retrigger/"""
    def post(self, request, document_id):
        from .tasks import run_ai_pipeline
        AIProcessingQueue.objects.filter(document_id=document_id).update(
            stage='queued', progress=0, error_message='', retry_count=0
        )
        run_ai_pipeline.delay(str(document_id), str(request.user.id))
        return Response({'message': 'Pipeline retriggered.'})


# ── Similar Documents ─────────────────────────────────────────

class SimilarDocumentsView(APIView):
    """GET /api/ai/similar/<document_id>/"""
    def get(self, request, document_id):
        from .services.similarity import find_similar_documents
        results = find_similar_documents(str(document_id), str(request.user.id))
        return Response({'document_id': str(document_id), 'similar': results})


# ── Recommendations ───────────────────────────────────────────

class RecommendationsView(APIView):
    """GET /api/ai/recommendations/<document_id>/"""
    def get(self, request, document_id):
        cached = DocumentRecommendation.objects.filter(
            document_id=document_id).order_by('-score')[:6]
        if cached.exists():
            return Response({'recommendations': list(cached.values('recommended_document_id','score','reason'))})
        from .services.recommendations import generate_recommendations
        recs = generate_recommendations(str(document_id), str(request.user.id))
        return Response({'recommendations': recs})


# ── Smart Collections ─────────────────────────────────────────

class SmartCollectionsListView(generics.ListAPIView):
    """GET /api/ai/collections/"""
    serializer_class = SmartCollectionSerializer
    def get_queryset(self):
        return SmartCollection.objects.filter(owner=self.request.user)


class SmartCollectionDocumentsView(APIView):
    """GET /api/ai/collections/<id>/documents/"""
    def get(self, request, pk):
        try:
            col  = SmartCollection.objects.get(pk=pk, owner=request.user)
            docs = SmartCollectionDocument.objects.filter(collection=col).values('document_id', 'added_at', 'relevance')[:100]
            return Response({'collection': col.name, 'documents': list(docs)})
        except SmartCollection.DoesNotExist:
            return Response(status=404)


class SeedCollectionsView(APIView):
    """POST /api/ai/collections/seed/  — seed default collections for the user."""
    def post(self, request):
        from .services.collections import seed_smart_collections
        seed_smart_collections(request.user)
        return Response({'message': 'Smart collections seeded.'})


# ── AI Activity Dashboard ─────────────────────────────────────

class AIDashboardView(APIView):
    """GET /api/ai/dashboard/  — Per-user AI activity metrics."""
    def get(self, request):
        uid = request.user.id
        queue_qs = AIProcessingQueue.objects.filter(document_id__in=self._user_doc_ids(request.user))
        return Response({
            'total_processed': queue_qs.filter(stage='completed').count(),
            'processing':      queue_qs.filter(stage__in=['queued','ocr','embedding','classification']).count(),
            'failed':          queue_qs.filter(stage='failed').count(),
            'search_count':    SearchHistory.objects.filter(user=request.user).count(),
            'collections':     SmartCollection.objects.filter(owner=request.user).count(),
            'top_categories':  self._top_categories(request.user),
            'recent_searches': list(SearchHistory.objects.filter(user=request.user).values('query','created_at')[:5]),
        })

    def _user_doc_ids(self, user):
        from apps.documents.models import Document
        return Document.objects.filter(owner=user).values_list('id', flat=True)

    def _top_categories(self, user):
        doc_ids = self._user_doc_ids(user)
        return list(
            DocumentClassification.objects.filter(document_id__in=doc_ids)
            .values('category').annotate(count=Count('id')).order_by('-count')[:5]
        )
