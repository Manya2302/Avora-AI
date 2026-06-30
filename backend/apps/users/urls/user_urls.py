from django.urls import path
from apps.users import views

urlpatterns = [
    path('me/',                      views.MeView.as_view(),              name='user-me'),
    path('profile/',                 views.ProfileView.as_view(),          name='user-profile'),
    path('change-password/',         views.ChangePasswordView.as_view(),   name='user-change-pw'),
    path('sessions/',                views.SessionListView.as_view(),       name='user-sessions'),
    path('sessions/revoke-all/',     views.RevokeAllSessionsView.as_view(),name='user-revoke-all'),
    path('sessions/<int:pk>/',       views.RevokeSessionView.as_view(),    name='user-revoke-session'),
]
