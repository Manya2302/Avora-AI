from django.urls import path
from . import views

urlpatterns = [
    # Search
    path('search/',                     views.SemanticSearchView.as_view(),        name='ai-search'),
    path('search/suggestions/',         views.SearchSuggestionsView.as_view(),     name='ai-suggestions'),
    path('search/history/',             views.SearchHistoryView.as_view(),         name='ai-search-history'),
    path('search/popular/',             views.PopularSearchesView.as_view(),       name='ai-popular'),
    # Insights
    path('insights/<uuid:document_id>/',views.DocumentInsightView.as_view(),       name='ai-insights'),
    path('pipeline/<uuid:document_id>/',views.OrivoPipelineStatusView.as_view(),   name='ai-pipeline-status'),
    path('pipeline/<uuid:document_id>/retrigger/', views.RetriggerPipelineView.as_view(), name='ai-retrigger'),
    # Similarity & Recommendations
    path('similar/<uuid:document_id>/',         views.SimilarDocumentsView.as_view(),  name='ai-similar'),
    path('recommendations/<uuid:document_id>/', views.RecommendationsView.as_view(),   name='ai-recommendations'),
    # Collections
    path('collections/',                        views.SmartCollectionsListView.as_view(),     name='ai-collections'),
    path('collections/seed/',                   views.SeedCollectionsView.as_view(),          name='ai-collections-seed'),
    path('collections/<uuid:pk>/documents/',    views.SmartCollectionDocumentsView.as_view(), name='ai-collection-docs'),
    # Dashboard
    path('dashboard/',                          views.AIDashboardView.as_view(),             name='ai-dashboard'),
]
