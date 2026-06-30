from django.urls import path
from . import views
urlpatterns = [
    path("graph/",           views.KnowledgeGraphView.as_view(),  name="knowledge-graph"),
    path("build/",           views.BuildGraphView.as_view(),       name="knowledge-build"),
    path("search/",          views.KnowledgeSearchView.as_view(),  name="knowledge-search"),
    path("vendor/<str:name>/",views.VendorProfileView.as_view(),   name="knowledge-vendor"),
]
