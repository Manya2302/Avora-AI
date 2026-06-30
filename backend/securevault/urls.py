from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

try:
    from drf_yasg.views import get_schema_view
    from drf_yasg import openapi
    from rest_framework import permissions
    schema_view = get_schema_view(
        openapi.Info(title="Avora AI API", default_version='v1',
            description="Avora AI — Phase 1+2+3"),
        public=True, permission_classes=[permissions.AllowAny],
    )
    swagger_urls = [
        path('api/docs/', schema_view.with_ui('swagger', cache_timeout=0), name='schema-swagger'),
        path('api/redoc/', schema_view.with_ui('redoc', cache_timeout=0), name='schema-redoc'),
    ]
except ImportError:
    swagger_urls = []

urlpatterns = [
    path('django-admin/', admin.site.urls),
    # Phase 1
    path('api/auth/',        include('apps.users.urls.auth_urls')),
    path('api/users/',       include('apps.users.urls.user_urls')),
    path('api/documents/',   include('apps.documents.urls')),
    path('api/audit/',       include('apps.audit.urls')),
    path('api/admin-panel/', include('apps.admin_panel.urls')),
    # Phase 2
    path('api/ai/',          include('apps.ai.urls')),
    # Phase 3
    path('api/compliance/',  include('apps.compliance.urls')),
    path('api/contracts/',   include('apps.contracts.urls')),
    # Phase 4
    path('api/copilot/',     include('apps.copilot.urls')),
    path('api/knowledge/',   include('apps.knowledge.urls')),
] + swagger_urls + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
