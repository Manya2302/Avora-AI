from django.urls import path
from . import views
urlpatterns = [
    path("dashboard/",                views.ComplianceDashboardView.as_view(),   name="compliance-dashboard"),
    path("scan/",                     views.RunComplianceScanView.as_view(),      name="compliance-scan"),
    path("missing/",                  views.MissingDocsView.as_view(),           name="compliance-missing"),
    path("expiry/",                   views.ExpiryAlertsView.as_view(),          name="compliance-expiry"),
    path("expiry/<uuid:pk>/dismiss/", views.DismissExpiryAlertView.as_view(),    name="compliance-dismiss"),
    path("audit-package/generate/",   views.GenerateAuditPackageView.as_view(),  name="compliance-audit-gen"),
    path("audit-packages/",           views.AuditPackageListView.as_view(),      name="compliance-audit-list"),
    path("copilot/",                  views.ComplianceCopilotView.as_view(),     name="compliance-copilot"),
    path("copilot/history/",          views.CopilotHistoryView.as_view(),        name="compliance-copilot-history"),
    path("timeline/",                 views.ComplianceTimelineView.as_view(),    name="compliance-timeline"),
    path("training/correction/",      views.RecordCorrectionView.as_view(),      name="compliance-correction"),
    path("risk/<uuid:pk>/dismiss/",   views.DismissRiskView.as_view(),           name="compliance-dismiss-risk"),
    path("fact/<uuid:pk>/dismiss/",   views.DismissFactView.as_view(),           name="compliance-dismiss-fact"),
]
