from django.urls import path
from . import views

urlpatterns = [
    path('logs/', views.AuditLogListView.as_view(), name='audit-logs'),
    path('logs/export/', views.AuditLogExportView.as_view(), name='audit-logs-export'),
]
