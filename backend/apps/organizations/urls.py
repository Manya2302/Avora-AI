from django.urls import path
from . import views

urlpatterns = [
    # Departments
    path('departments/',          views.DepartmentListCreateView.as_view(), name='org-dept-list'),
    path('departments/<uuid:pk>/',views.DepartmentDetailView.as_view(),     name='org-dept-detail'),

    # Roles
    path('roles/',                views.OrgRoleListCreateView.as_view(),    name='org-role-list'),
    path('roles/<uuid:pk>/',      views.OrgRoleDetailView.as_view(),        name='org-role-detail'),

    # Members
    path('members/',              views.OrgMemberListView.as_view(),        name='org-member-list'),
    path('members/assign/',       views.OrgMemberAssignView.as_view(),      name='org-member-assign'),
    path('members/<uuid:pk>/',    views.OrgMemberDetailView.as_view(),      name='org-member-detail'),

    # Org chart
    path('tree/',                 views.OrgTreeView.as_view(),              name='org-tree'),

    # Document visibility
    path('visibility/<uuid:document_id>/', views.DocumentVisibilityView.as_view(), name='org-visibility'),

    # User self-service
    path('my-permissions/',       views.MyPermissionsView.as_view(),        name='org-my-perms'),
]
