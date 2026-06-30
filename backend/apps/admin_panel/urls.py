from django.urls import path
from . import views

urlpatterns = [
    # Core
    path('dashboard/',              views.AdminDashboardView.as_view(),           name='admin-dashboard'),
    path('users/',                  views.AdminUserListView.as_view(),            name='admin-users'),
    path('users/<uuid:pk>/',        views.AdminUserDetailView.as_view(),          name='admin-user-detail'),
    path('documents/',              views.AdminDocumentListView.as_view(),         name='admin-documents'),
    path('audits/',                 views.AdminAuditLogView.as_view(),            name='admin-audits'),
    path('security/',               views.AdminSecurityAlertsView.as_view(),      name='admin-security'),
    path('storage/',                views.AdminStorageStatsView.as_view(),         name='admin-storage'),
    # Phase 2 — AI Monitoring
    path('ai/monitor/',             views.AdminAIMonitorView.as_view(),           name='admin-ai-monitor'),
    path('ai/ocr-queue/',           views.AdminAIOCRQueueView.as_view(),          name='admin-ai-ocr-queue'),
    path('ai/failed/',              views.AdminAIFailedQueueView.as_view(),       name='admin-ai-failed'),
    path('ai/retrigger-failed/',    views.AdminRetriggerFailedView.as_view(),     name='admin-ai-retrigger'),
    path('ai/search-analytics/',    views.AdminSearchAnalyticsView.as_view(),     name='admin-ai-search'),
    path('ai/classification-metrics/', views.AdminClassificationMetricsView.as_view(), name='admin-ai-classify'),

    # Phase 4 — AI Governance
    path('ai-governance/',     views.AdminAIGovernanceView.as_view(),     name='admin-ai-governance'),
    path('prompts/',           views.AdminPromptManagementView.as_view(), name='admin-prompts'),
    path('knowledge-stats/',   views.AdminKnowledgeStatsView.as_view(),   name='admin-knowledge-stats'),
    path('flagged-responses/', views.AdminFlaggedResponsesView.as_view(), name='admin-flagged'),
]
