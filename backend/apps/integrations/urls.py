from django.urls import path
from apps.integrations import views

urlpatterns = [
    # Integration list
    path('',                               views.list_integrations,        name='integrations-list'),

    # ── Google Drive ──────────────────────────────────────────────────────────
    path('google-drive/credentials/',      views.google_save_credentials,  name='gdrive-credentials'),
    path('google-drive/oauth-url/',        views.google_oauth_url,         name='gdrive-oauth-url'),
    path('google-drive/callback/',         views.google_oauth_callback,    name='gdrive-callback'),
    path('google-drive/folders/',          views.google_list_folders,      name='gdrive-folders'),
    path('google-drive/folders/save/',     views.google_save_folders,      name='gdrive-folders-save'),
    path('google-drive/disconnect/',       views.google_disconnect,        name='gdrive-disconnect'),
    path('google-drive/status/',           views.google_status,            name='gdrive-status'),
    path('google-drive/events/',           views.google_sync_events,       name='gdrive-events'),

    # ── GitHub Engineering Intelligence ───────────────────────────────────────
    path('github/credentials/',            views.github_save_credentials,  name='github-credentials'),
    path('github/oauth-url/',              views.github_oauth_url,         name='github-oauth-url'),
    path('github/callback/',               views.github_oauth_callback,    name='github-callback'),
    path('github/repos/',                  views.github_list_repos,        name='github-repos'),
    path('github/repos/save/',             views.github_save_repos,        name='github-repos-save'),
    path('github/disconnect/',             views.github_disconnect,        name='github-disconnect'),
    path('github/status/',                 views.github_status,            name='github-status'),
    path('github/preview/',               views.github_domain_preview,    name='github-preview'),
]
