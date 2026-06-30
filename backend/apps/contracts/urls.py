from django.urls import path
from . import views
urlpatterns = [
    path("",                            views.ContractListView.as_view(),           name="contracts-list"),
    path("<uuid:pk>/",                  views.ContractDetailView.as_view(),          name="contracts-detail"),
    path("analyze/",                    views.AnalyzeContractView.as_view(),         name="contracts-analyze"),
    path("renewals/",                   views.ContractRenewalCalendarView.as_view(), name="contracts-renewals"),
    path("risk-summary/",               views.ContractRiskSummaryView.as_view(),     name="contracts-risk"),
    path("renewals/<uuid:pk>/action/",  views.UpdateRenewalActionView.as_view(),     name="contracts-renewal-action"),
]
