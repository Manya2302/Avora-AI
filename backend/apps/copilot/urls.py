from django.urls import path
from . import views
urlpatterns = [
    path("query/",                            views.CopilotQueryView.as_view(),          name="copilot-query"),
    path("conversations/",                    views.ConversationListView.as_view(),       name="copilot-convs"),
    path("conversations/<uuid:pk>/",          views.ConversationDetailView.as_view(),     name="copilot-conv-detail"),
    path("conversations/<uuid:pk>/pin/",      views.PinConversationView.as_view(),        name="copilot-pin"),
    path("prompts/",                          views.PromptLibraryView.as_view(),          name="copilot-prompts"),
    path("prompts/create/",                   views.CreatePromptView.as_view(),           name="copilot-prompt-create"),
    path("prompts/seed/",                     views.SeedPromptsView.as_view(),            name="copilot-prompts-seed"),
    path("reports/generate/",                 views.GenerateReportView.as_view(),         name="copilot-report-gen"),
    path("reports/",                          views.ReportListView.as_view(),             name="copilot-reports"),
    path("reports/<uuid:pk>/",                views.ReportDetailView.as_view(),           name="copilot-report-detail"),
    path("recommendations/",                  views.RecommendationsView.as_view(),        name="copilot-recs"),
    path("recommendations/<uuid:pk>/dismiss/",views.DismissRecommendationView.as_view(),  name="copilot-rec-dismiss"),
    path("dashboard/",                        views.CopilotDashboardView.as_view(),       name="copilot-dashboard"),
    path("analyze/",                          views.MultiDocAnalysisView.as_view(),       name="copilot-analyze"),
]
