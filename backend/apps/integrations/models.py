"""
Integrations models.

All sensitive fields (client_id, client_secret, access_token, refresh_token)
are stored as two-layer AES-256-GCM + PBKDF2-SHA256 encrypted blobs.
Plain values are NEVER stored.  The model never exposes decrypted data via
__str__, __repr__, or any auto-serialiser field.
"""

import uuid
from django.db import models
from django.conf import settings
from apps.users.models import User


class IntegrationProvider(models.TextChoices):
    GOOGLE_DRIVE  = 'google_drive',  'Google Drive'
    GITHUB        = 'github',        'GitHub'
    ONEDRIVE      = 'onedrive',      'Microsoft OneDrive'
    SHAREPOINT    = 'sharepoint',    'Microsoft SharePoint'
    DROPBOX       = 'dropbox',       'Dropbox'
    SLACK         = 'slack',         'Slack'
    NOTION        = 'notion',        'Notion'


class SyncStatus(models.TextChoices):
    PENDING       = 'pending',    'Pending'
    CONNECTED     = 'connected',  'Connected'
    SYNCING       = 'syncing',    'Syncing'
    ERROR         = 'error',      'Error'
    DISCONNECTED  = 'disconnected', 'Disconnected'


class IntegrationConfig(models.Model):
    """
    Stores per-user integration settings.

    Credentials fields contain ENCRYPTED blobs — never plaintext.
    Use .get_client_id(user) / .get_client_secret(user) for decryption.
    """
    id               = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user             = models.ForeignKey(User, on_delete=models.CASCADE, related_name='integrations')
    provider         = models.CharField(max_length=30, choices=IntegrationProvider.choices)

    # ── Encrypted credential storage ─────────────────────────────
    # These fields store opaque blobs — NEVER plaintext.
    _client_id       = models.TextField(blank=True, db_column='client_id_enc')
    _client_secret   = models.TextField(blank=True, db_column='client_secret_enc')
    _access_token    = models.TextField(blank=True, db_column='access_token_enc')
    _refresh_token   = models.TextField(blank=True, db_column='refresh_token_enc')

    # ── OAuth metadata (non-sensitive) ────────────────────────────
    google_user_id   = models.CharField(max_length=100, blank=True)
    google_email     = models.CharField(max_length=200, blank=True)
    token_expiry     = models.DateTimeField(null=True, blank=True)

    # ── Sync state ────────────────────────────────────────────────
    status           = models.CharField(max_length=20, choices=SyncStatus.choices, default=SyncStatus.PENDING)
    last_sync_at     = models.DateTimeField(null=True, blank=True)
    sync_error       = models.TextField(blank=True)
    files_indexed    = models.IntegerField(default=0)

    # ── Selected folder IDs (JSON list) ──────────────────────────
    selected_folders = models.JSONField(default=list)
    folder_names     = models.JSONField(default=dict)   # {folder_id: name}

    # ── Permissions sync ──────────────────────────────────────────
    sync_permissions = models.BooleanField(default=True)
    allowed_users    = models.JSONField(default=list)
    allowed_groups   = models.JSONField(default=list)

    # ── Timestamps ────────────────────────────────────────────────
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        db_table         = 'integration_configs'
        unique_together  = ('user', 'provider')
        ordering         = ['-created_at']

    def __str__(self):
        # Deliberately omit any credential info from string representation
        return f"IntegrationConfig({self.provider}, user={self.user_id}, status={self.status})"

    # ── Credential accessors (encrypt / decrypt) ──────────────────
    def set_client_id(self, value: str):
        from apps.integrations.encryption import encrypt_credential
        self._client_id = encrypt_credential(value, str(self.user_id))

    def get_client_id(self) -> str:
        from apps.integrations.encryption import decrypt_credential
        return decrypt_credential(self._client_id, str(self.user_id))

    def set_client_secret(self, value: str):
        from apps.integrations.encryption import encrypt_credential
        self._client_secret = encrypt_credential(value, str(self.user_id))

    def get_client_secret(self) -> str:
        from apps.integrations.encryption import decrypt_credential
        return decrypt_credential(self._client_secret, str(self.user_id))

    def set_access_token(self, value: str):
        from apps.integrations.encryption import encrypt_credential
        self._access_token = encrypt_credential(value, str(self.user_id))

    def get_access_token(self) -> str:
        from apps.integrations.encryption import decrypt_credential
        return decrypt_credential(self._access_token, str(self.user_id))

    def set_refresh_token(self, value: str):
        from apps.integrations.encryption import encrypt_credential
        self._refresh_token = encrypt_credential(value, str(self.user_id))

    def get_refresh_token(self) -> str:
        from apps.integrations.encryption import decrypt_credential
        return decrypt_credential(self._refresh_token, str(self.user_id))

    def has_credentials(self) -> bool:
        return bool(self._client_id and self._client_secret)


class SyncEvent(models.Model):
    """Audit trail for every sync operation."""
    id            = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    integration   = models.ForeignKey(IntegrationConfig, on_delete=models.CASCADE, related_name='sync_events')
    event_type    = models.CharField(max_length=30)   # 'sync_start', 'file_indexed', 'file_deleted', 'error'
    file_id       = models.CharField(max_length=200, blank=True)
    file_name     = models.CharField(max_length=500, blank=True)
    details       = models.JSONField(default=dict)
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'integration_sync_events'
        ordering = ['-created_at']


# ═══════════════════════════════════════════════════════════════════════
# GitHub Engineering Intelligence
# ═══════════════════════════════════════════════════════════════════════

GITHUB_SYNC_DOMAINS = [
    'source_code', 'pull_requests', 'issues', 'commits',
    'documentation', 'wiki', 'workflows', 'releases',
    'security', 'discussions',
]


class GitHubIntegrationConfig(models.Model):
    """
    Extended GitHub-specific config attached to an IntegrationConfig.

    Stores which repositories and which engineering domains are synced.
    Token lives encrypted in the parent IntegrationConfig._access_token.
    """
    id                = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    integration       = models.OneToOneField(
        IntegrationConfig, on_delete=models.CASCADE, related_name='github_config'
    )

    # ── GitHub identity ──────────────────────────────────────────
    github_user_id    = models.CharField(max_length=50, blank=True)
    github_login      = models.CharField(max_length=150, blank=True)    # username
    github_email      = models.CharField(max_length=200, blank=True)
    github_name       = models.CharField(max_length=255, blank=True)
    github_avatar_url = models.URLField(blank=True)
    github_org        = models.CharField(max_length=150, blank=True)    # org if org-level OAuth

    # ── Repository selection ─────────────────────────────────────
    # [{"id": 123, "full_name": "org/repo", "private": true, "language": "Python"}]
    selected_repos    = models.JSONField(default=list)
    # Per-repo permissions: {"repo_full_name": ["user_id1", ...]}
    repo_permissions  = models.JSONField(default=dict)

    # ── Sync domain flags ────────────────────────────────────────
    # Which engineering knowledge domains to index per repo
    sync_source_code  = models.BooleanField(default=True)
    sync_pull_requests= models.BooleanField(default=True)
    sync_issues       = models.BooleanField(default=True)
    sync_commits      = models.BooleanField(default=True)
    sync_docs         = models.BooleanField(default=True)
    sync_wiki         = models.BooleanField(default=False)
    sync_workflows    = models.BooleanField(default=True)
    sync_releases     = models.BooleanField(default=True)
    sync_security     = models.BooleanField(default=True)
    sync_discussions  = models.BooleanField(default=False)

    # ── Index stats ───────────────────────────────────────────────
    total_code_chunks    = models.IntegerField(default=0)
    total_prs_indexed    = models.IntegerField(default=0)
    total_issues_indexed = models.IntegerField(default=0)
    total_commits_indexed= models.IntegerField(default=0)
    total_docs_indexed   = models.IntegerField(default=0)

    # ── Knowledge graph ───────────────────────────────────────────
    graph_built_at    = models.DateTimeField(null=True, blank=True)

    # ── Timestamps ───────────────────────────────────────────────
    created_at        = models.DateTimeField(auto_now_add=True)
    updated_at        = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'github_integration_configs'

    def __str__(self):
        return f"GitHubConfig(login={self.github_login}, repos={len(self.selected_repos)})"

    def get_sync_domains(self) -> list:
        return [
            d for d, flag in [
                ('source_code',   self.sync_source_code),
                ('pull_requests', self.sync_pull_requests),
                ('issues',        self.sync_issues),
                ('commits',       self.sync_commits),
                ('documentation', self.sync_docs),
                ('wiki',          self.sync_wiki),
                ('workflows',     self.sync_workflows),
                ('releases',      self.sync_releases),
                ('security',      self.sync_security),
                ('discussions',   self.sync_discussions),
            ] if flag
        ]
