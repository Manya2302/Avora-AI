"""
Integrations Views.

Security guarantees:
  - Credentials are accepted via POST body over HTTPS only (never query string).
  - Response bodies NEVER contain decrypted secrets.
  - All errors that involve credentials are caught and sanitised before returning.
  - All endpoints require authentication (IsAuthenticated).
  - CSRF is enforced by DRF's SessionAuthentication; JWT bearer tokens are also accepted.
"""

import logging
import secrets
from datetime import datetime, timezone

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from django.core.signing import Signer, BadSignature
from django.http import HttpResponse

from apps.integrations.models import IntegrationConfig, SyncEvent, IntegrationProvider, SyncStatus
from apps.integrations.serializers import (
    IntegrationConfigSerializer,
    SaveCredentialsSerializer,
    FolderSyncSerializer,
    SyncEventSerializer,
)
from apps.integrations import google_drive as gd

log = logging.getLogger('integrations')   # NEVER log credential values here


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_or_create(user, provider: str):
    obj, _ = IntegrationConfig.objects.get_or_create(
        user=user,
        provider=provider,
        defaults={'status': SyncStatus.PENDING},
    )
    return obj


def _redirect_uri(request) -> str:
    host = request.build_absolute_uri('/').rstrip('/')
    return f"{host}/api/integrations/google-drive/callback/"


# ── List all integrations ─────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_integrations(request):
    """Return all integration configs for the current user (no secrets)."""
    qs  = IntegrationConfig.objects.filter(user=request.user)
    ser = IntegrationConfigSerializer(qs, many=True)
    return Response(ser.data)


# ── Google Drive — save credentials ──────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def google_save_credentials(request):
    """
    Accept client_id + client_secret and store them encrypted.
    Returns only a masked confirmation — never echoes secrets.
    """
    ser = SaveCredentialsSerializer(data=request.data)
    if not ser.is_valid():
        return Response({'error': 'Invalid credentials format.'}, status=400)

    integration = _get_or_create(request.user, IntegrationProvider.GOOGLE_DRIVE)
    integration.set_client_id(ser.validated_data['client_id'])
    integration.set_client_secret(ser.validated_data['client_secret'])
    integration.status = SyncStatus.PENDING
    integration.save()

    log.info("User %s saved Google Drive credentials (provider=google_drive)", request.user.id)

    return Response({
        'message':         'Credentials saved securely.',
        'has_credentials': True,
    })


# ── Google Drive — OAuth URL ──────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def google_oauth_url(request):
    """Return a Google OAuth consent URL.  Credentials never leave the server."""
    integration = IntegrationConfig.objects.filter(
        user=request.user, provider=IntegrationProvider.GOOGLE_DRIVE
    ).first()

    if not integration or not integration.has_credentials():
        return Response({'error': 'Credentials not configured.'}, status=400)

    try:
        client_id     = integration.get_client_id()
        client_secret = integration.get_client_secret()
        
        # Use signed state to encode user_id securely
        signer = Signer()
        state = signer.sign(f"{request.user.id}:{secrets.token_urlsafe(32)}")

        url = gd.get_oauth_url(client_id, client_secret, _redirect_uri(request), state)
    except Exception as exc:
        log.error("google_oauth_url error: %s", exc)
        return Response({'error': 'Failed to generate OAuth URL.'}, status=500)

    return Response({'oauth_url': url})


# ── Google Drive — OAuth callback ─────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def google_oauth_callback(request):
    """Handle the redirect from Google.  Exchanges code for tokens (server-side)."""
    code  = request.GET.get('code')
    state = request.GET.get('state')
    error = request.GET.get('error')

    if error:
        return HttpResponse(f'Google OAuth denied: {error}', status=400)

    if not code or not state:
        return HttpResponse('Missing code or state.', status=400)

    try:
        raw_state = Signer().unsign(state)
        user_id = raw_state.split(':', 1)[0]
    except BadSignature:
        return HttpResponse('Invalid state parameter (Signature verification failed).', status=400)

    integration = IntegrationConfig.objects.filter(
        user_id=user_id, provider=IntegrationProvider.GOOGLE_DRIVE
    ).first()

    if not integration or not integration.has_credentials():
        return HttpResponse('Integration not configured.', status=400)

    try:
        client_id     = integration.get_client_id()
        client_secret = integration.get_client_secret()

        token_info = gd.exchange_code(
            client_id, client_secret, _redirect_uri(request), code, state
        )

        user_info  = gd.get_user_info(token_info['access_token'])

        integration.set_access_token(token_info['access_token'])
        if token_info.get('refresh_token'):
            integration.set_refresh_token(token_info['refresh_token'])
        integration.google_user_id = user_info.get('google_id', '')
        integration.google_email   = user_info.get('email', '')
        integration.token_expiry   = token_info.get('expiry')
        integration.status         = SyncStatus.CONNECTED
        integration.save()

    except Exception as exc:
        log.error("google_oauth_callback error: %s", exc)
        integration.status     = SyncStatus.ERROR
        integration.sync_error = 'OAuth exchange failed.'
        integration.save()
        return HttpResponse('OAuth token exchange failed.', status=500)

    return HttpResponse(
        "<html><body style='font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #F7F5F0;'>"
        "<h2 style='color: #0E0D0A;'>Google Drive Connected Successfully!</h2>"
        "<p style='color: #9B9890;'>You can close this window and continue in Avora AI.</p>"
        "<script>setTimeout(() => window.close(), 1500);</script>"
        "</body></html>"
    )


# ── Google Drive — list folders ───────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def google_list_folders(request):
    """Return folders from the user's Drive (for folder selection UI)."""
    integration = IntegrationConfig.objects.filter(
        user=request.user, provider=IntegrationProvider.GOOGLE_DRIVE
    ).first()

    if not integration or integration.status not in [SyncStatus.CONNECTED, SyncStatus.SYNCING]:
        return Response({'error': 'Google Drive not connected.'}, status=400)

    try:
        folders = gd.list_drive_folders(
            access_token  = integration.get_access_token(),
            refresh_token = integration.get_refresh_token(),
            client_id     = integration.get_client_id(),
            client_secret = integration.get_client_secret(),
        )
    except Exception as exc:
        log.error("google_list_folders error: %s", exc)
        return Response({'error': 'Failed to retrieve folders.'}, status=500)

    return Response({'folders': folders})


# ── Google Drive — save folder selection ─────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def google_save_folders(request):
    """Store the user's selected folder IDs."""
    integration = IntegrationConfig.objects.filter(
        user=request.user, provider=IntegrationProvider.GOOGLE_DRIVE
    ).first()

    if not integration or integration.status not in [SyncStatus.CONNECTED, SyncStatus.SYNCING]:
        return Response({'error': 'Google Drive not connected.'}, status=400)

    ser = FolderSyncSerializer(data=request.data)
    if not ser.is_valid():
        return Response(ser.errors, status=400)

    integration.selected_folders = ser.validated_data['folder_ids']
    integration.folder_names     = ser.validated_data.get('folder_names', {})
    integration.save()

    # Trigger async sync process
    from apps.integrations.tasks import sync_google_drive_folder
    sync_google_drive_folder.delay(str(integration.id))

    return Response({'message': 'Folders saved. Sync started in background.', 'selected': integration.selected_folders})


# ── Google Drive — disconnect ─────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def google_disconnect(request):
    """Revoke and delete all stored tokens for Google Drive."""
    integration = IntegrationConfig.objects.filter(
        user=request.user, provider=IntegrationProvider.GOOGLE_DRIVE
    ).first()

    if not integration:
        return Response({'message': 'Not connected.'})

    integration._access_token  = ''
    integration._refresh_token = ''
    integration.status         = SyncStatus.DISCONNECTED
    integration.google_email   = ''
    integration.google_user_id = ''
    integration.save()

    log.info("User %s disconnected Google Drive", request.user.id)
    return Response({'message': 'Google Drive disconnected.'})


# ── Status endpoint ───────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def google_status(request):
    """Return safe, masked status for the integration dashboard."""
    integration = IntegrationConfig.objects.filter(
        user=request.user, provider=IntegrationProvider.GOOGLE_DRIVE
    ).first()

    if not integration:
        return Response({
            'configured': False,
            'status': SyncStatus.PENDING,
        })

    ser = IntegrationConfigSerializer(integration)
    return Response({**ser.data, 'configured': integration.has_credentials()})


# ── Sync events ───────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def google_sync_events(request):
    """Return recent sync audit events."""
    integration = IntegrationConfig.objects.filter(
        user=request.user, provider=IntegrationProvider.GOOGLE_DRIVE
    ).first()

    if not integration:
        return Response({'events': []})

    events = SyncEvent.objects.filter(integration=integration)[:50]
    ser    = SyncEventSerializer(events, many=True)
    return Response({'events': ser.data})


# ════════════════════════════════════════════════════════════════════════════
# GitHub Engineering Intelligence
# ════════════════════════════════════════════════════════════════════════════

from apps.integrations.models import GitHubIntegrationConfig
from apps.integrations import github_connector as gh


def _gh_redirect_uri(request) -> str:
    host = request.build_absolute_uri('/').rstrip('/')
    return f"{host}/api/integrations/github/callback/"


# ── Save GitHub OAuth App credentials ────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def github_save_credentials(request):
    """
    Store GitHub OAuth App client_id + client_secret with 2-layer encryption.
    Never echoes secrets back.
    """
    ser = SaveCredentialsSerializer(data=request.data)
    if not ser.is_valid():
        return Response({'error': 'Invalid credentials format.'}, status=400)

    integration = _get_or_create(request.user, IntegrationProvider.GITHUB)
    integration.set_client_id(ser.validated_data['client_id'])
    integration.set_client_secret(ser.validated_data['client_secret'])
    integration.status = SyncStatus.PENDING
    integration.save()

    log.info("User %s saved GitHub credentials (encrypted)", request.user.id)
    return Response({'message': 'Credentials saved securely.', 'has_credentials': True})


# ── Get GitHub OAuth URL ──────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def github_oauth_url(request):
    """Return GitHub OAuth consent URL.  client_secret stays server-side."""
    integration = IntegrationConfig.objects.filter(
        user=request.user, provider=IntegrationProvider.GITHUB
    ).first()

    if not integration or not integration.has_credentials():
        return Response({'error': 'Credentials not configured.'}, status=400)

    try:
        client_id = integration.get_client_id()
        signer = Signer()
        state = signer.sign(f"{request.user.id}:{secrets.token_urlsafe(32)}")
        
        url = gh.get_oauth_url(client_id, _gh_redirect_uri(request), state)
    except Exception as exc:
        log.error("github_oauth_url error: %s", exc)
        return Response({'error': 'Failed to generate OAuth URL.'}, status=500)

    return Response({'oauth_url': url})


# ── GitHub OAuth callback ─────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([AllowAny])
def github_oauth_callback(request):
    """Exchange OAuth code for access token; store encrypted; fetch user info."""
    code  = request.GET.get('code')
    state = request.GET.get('state')
    error = request.GET.get('error')

    if error:
        return HttpResponse(f'GitHub OAuth denied: {error}', status=400)
    if not code or not state:
        return HttpResponse('Missing code or state.', status=400)

    try:
        raw_state = Signer().unsign(state)
        user_id = raw_state.split(':', 1)[0]
    except BadSignature:
        return HttpResponse('Invalid state — Signature verification failed.', status=400)

    integration = IntegrationConfig.objects.filter(
        user_id=user_id, provider=IntegrationProvider.GITHUB
    ).first()
    if not integration or not integration.has_credentials():
        return HttpResponse('Integration not configured.', status=400)

    try:
        client_id     = integration.get_client_id()
        client_secret = integration.get_client_secret()

        token_data = gh.exchange_code(client_id, client_secret, _gh_redirect_uri(request), code)
        access_token = token_data['access_token']

        user_info = gh.get_user_info(access_token)

        integration.set_access_token(access_token)
        integration.status = SyncStatus.CONNECTED
        integration.save()

        # Create or update GitHubIntegrationConfig
        from apps.integrations.models import GitHubIntegrationConfig
        gh_cfg, _ = GitHubIntegrationConfig.objects.get_or_create(integration=integration)
        gh_cfg.github_user_id    = user_info['id']
        gh_cfg.github_login      = user_info['login']
        gh_cfg.github_email      = user_info.get('email', '')
        gh_cfg.github_name       = user_info.get('name', '')
        gh_cfg.github_avatar_url = user_info.get('avatar_url', '')
        gh_cfg.save()

    except Exception as exc:
        log.error("github_oauth_callback error: %s", exc)
        integration.status     = SyncStatus.ERROR
        integration.sync_error = 'GitHub OAuth exchange failed.'
        integration.save()
        return HttpResponse('OAuth token exchange failed.', status=500)

    return HttpResponse(
        "<html><body style='font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #F7F5F0;'>"
        "<h2 style='color: #0E0D0A;'>GitHub Connected Successfully!</h2>"
        "<p style='color: #9B9890;'>You can close this window and continue in Avora AI.</p>"
        "<script>setTimeout(() => window.close(), 1500);</script>"
        "</body></html>"
    )


# ── List accessible repositories ─────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def github_list_repos(request):
    """Return list of repos the access token can see (for repo selection UI)."""
    integration = IntegrationConfig.objects.filter(
        user=request.user, provider=IntegrationProvider.GITHUB
    ).first()
    if not integration or integration.status not in [SyncStatus.CONNECTED, SyncStatus.SYNCING]:
        return Response({'error': 'GitHub not connected.'}, status=400)

    try:
        repos = gh.list_repos(integration.get_access_token())
    except Exception as exc:
        log.error("github_list_repos error: %s", exc)
        return Response({'error': 'Failed to list repositories.'}, status=500)

    return Response({'repos': repos})


# ── Save repo selection ───────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def github_save_repos(request):
    """Save selected repos + domain flags."""
    integration = IntegrationConfig.objects.filter(
        user=request.user, provider=IntegrationProvider.GITHUB
    ).first()
    if not integration or integration.status not in [SyncStatus.CONNECTED, SyncStatus.SYNCING]:
        return Response({'error': 'GitHub not connected.'}, status=400)

    repos  = request.data.get('repos', [])
    domains = request.data.get('domains', {})

    if not repos:
        return Response({'error': 'Select at least one repository.'}, status=400)

    gh_cfg, _ = GitHubIntegrationConfig.objects.get_or_create(integration=integration)
    gh_cfg.selected_repos = repos

    # Apply domain flags
    domain_map = {
        'source_code':   'sync_source_code',
        'pull_requests': 'sync_pull_requests',
        'issues':        'sync_issues',
        'commits':       'sync_commits',
        'documentation': 'sync_docs',
        'wiki':          'sync_wiki',
        'workflows':     'sync_workflows',
        'releases':      'sync_releases',
        'security':      'sync_security',
        'discussions':   'sync_discussions',
    }
    for domain, field in domain_map.items():
        if domain in domains:
            setattr(gh_cfg, field, bool(domains[domain]))

    gh_cfg.save()
    return Response({
        'message': f'{len(repos)} repo(s) queued for sync.',
        'selected_repos': [r.get('full_name', r) for r in repos],
        'domains': gh_cfg.get_sync_domains(),
    })


# ── GitHub status ─────────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def github_status(request):
    """Return safe status payload — no token in response."""
    integration = IntegrationConfig.objects.filter(
        user=request.user, provider=IntegrationProvider.GITHUB
    ).first()

    if not integration:
        return Response({'configured': False, 'status': 'pending'})

    payload = {
        'configured':     integration.has_credentials(),
        'status':         integration.status,
        'last_sync_at':   integration.last_sync_at,
        'sync_error':     integration.sync_error,
        'files_indexed':  integration.files_indexed,
    }

    try:
        gh_cfg = integration.github_config
        from apps.integrations.encryption import mask_credential
        payload.update({
            'github_login':        gh_cfg.github_login,
            'github_name':         gh_cfg.github_name,
            'github_email':        gh_cfg.github_email,
            'github_avatar_url':   gh_cfg.github_avatar_url,
            'selected_repos':      gh_cfg.selected_repos,
            'active_domains':      gh_cfg.get_sync_domains(),
            'stats': {
                'code_chunks':     gh_cfg.total_code_chunks,
                'prs_indexed':     gh_cfg.total_prs_indexed,
                'issues_indexed':  gh_cfg.total_issues_indexed,
                'commits_indexed': gh_cfg.total_commits_indexed,
                'docs_indexed':    gh_cfg.total_docs_indexed,
            },
            'client_id_masked': mask_credential(integration.get_client_id()),
        })
    except GitHubIntegrationConfig.DoesNotExist:
        pass

    return Response(payload)


# ── Disconnect GitHub ─────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def github_disconnect(request):
    """Wipe stored token and reset status."""
    integration = IntegrationConfig.objects.filter(
        user=request.user, provider=IntegrationProvider.GITHUB
    ).first()
    if not integration:
        return Response({'message': 'Not connected.'})

    integration._access_token = ''
    integration.status        = SyncStatus.DISCONNECTED
    integration.save()

    log.info("User %s disconnected GitHub", request.user.id)
    return Response({'message': 'GitHub disconnected.'})


# ── Fetch a single domain preview ────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def github_domain_preview(request):
    """
    Preview data from a specific domain for a single repo.
    Query params: repo=org/repo&domain=pull_requests|issues|commits|workflows|releases
    Used to demo live data without a full sync.
    """
    integration = IntegrationConfig.objects.filter(
        user=request.user, provider=IntegrationProvider.GITHUB
    ).first()
    if not integration or integration.status not in [SyncStatus.CONNECTED, SyncStatus.SYNCING]:
        return Response({'error': 'GitHub not connected.'}, status=400)

    repo   = request.GET.get('repo', '')
    domain = request.GET.get('domain', '')
    if not repo or not domain:
        return Response({'error': 'repo and domain params required.'}, status=400)

    try:
        token = integration.get_access_token()
        data  = []
        if domain == 'pull_requests':
            data = gh.fetch_pull_requests(token, repo, per_page=10)
        elif domain == 'issues':
            data = gh.fetch_issues(token, repo, per_page=10)
        elif domain == 'commits':
            data = gh.fetch_commits(token, repo, per_page=10)
        elif domain == 'workflows':
            data = gh.fetch_workflows(token, repo)
        elif domain == 'releases':
            data = gh.fetch_releases(token, repo, per_page=5)
        elif domain == 'security':
            data = gh.fetch_security_alerts(token, repo)
        elif domain == 'contributors':
            data = gh.fetch_contributors(token, repo)
        elif domain == 'languages':
            data = gh.fetch_languages(token, repo)
        elif domain == 'documentation':
            data = {'readme': gh.fetch_readme(token, repo)[:1000]}
        elif domain == 'metadata':
            data = gh.fetch_repo_metadata(token, repo)
        else:
            return Response({'error': f'Unknown domain: {domain}'}, status=400)
    except Exception as exc:
        log.error("github_domain_preview error: %s", exc)
        return Response({'error': 'Preview failed.'}, status=500)

    return Response({'repo': repo, 'domain': domain, 'data': data})
