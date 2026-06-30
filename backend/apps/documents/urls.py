from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'', views.DocumentViewSet, basename='document')

urlpatterns = [
    path('upload/initiate/', views.InitiateUploadView.as_view(),  name='doc-initiate'),
    path('upload/chunk/',    views.UploadChunkView.as_view(),     name='doc-chunk'),
    path('<uuid:pk>/metadata/', views.DocumentMetadataView.as_view(), name='doc-meta'),
    path('', include(router.urls)),
]
