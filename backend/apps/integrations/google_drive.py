"""
Google Drive OAuth helper.

Builds OAuth URLs and exchanges codes for tokens using the user-supplied
(encrypted-at-rest) client_id / client_secret.

No credential value is ever logged.  All Google API errors are caught and
re-raised as clean Django exceptions without embedding secrets.
"""

import os
from typing import Optional, Dict, Any
import requests
import urllib.parse
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'  # Allow http://localhost for local development

SCOPES = [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive.metadata.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'openid',
]


def _build_client_config(client_id: str, client_secret: str, redirect_uri: str) -> Dict:
    return {
        "web": {
            "client_id":     client_id,
            "client_secret": client_secret,
            "auth_uri":      "https://accounts.google.com/o/oauth2/auth",
            "token_uri":     "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri],
        }
    }


def get_oauth_url(client_id: str, client_secret: str, redirect_uri: str, state: str) -> str:
    """Return the Google consent URL.  client_id / client_secret are NEVER in the URL."""
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    qs = urllib.parse.urlencode(params)
    return f"https://accounts.google.com/o/oauth2/auth?{qs}"


def exchange_code(
    client_id: str,
    client_secret: str,
    redirect_uri: str,
    code: str,
    state: str,
) -> Dict[str, Any]:
    """
    Exchange the OAuth code for access + refresh tokens.
    Returns a dict with token info; never logs the values.
    """
    resp = requests.post("https://oauth2.googleapis.com/token", data={
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri,
    }, timeout=15)
    
    if not resp.ok:
        raise ValueError(f"OAuth token exchange failed: {resp.text}")
        
    data = resp.json()
    
    return {
        'access_token':  data.get('access_token', ''),
        'refresh_token': data.get('refresh_token', ''),
        'expiry':        None, # Google access tokens typically expire in 1hr
        'scopes':        data.get('scope', '').split(' '),
    }


def get_user_info(access_token: str) -> Dict[str, Any]:
    """Fetch user profile and email to identify who connected the account."""
    resp = requests.get(
        "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=15
    )
    if not resp.ok:
        raise ValueError(f"Failed to fetch Google user info: {resp.text}")
    data = resp.json()
    return {
        'google_id': data.get('id', ''),
        'email':     data.get('email', ''),
        'name':      data.get('name', ''),
        'picture':   data.get('picture', ''),
    }


def list_drive_folders(
    access_token: str,
    refresh_token: str,
    client_id: str,
    client_secret: str
) -> list:
    """Return a list of folder IDs and Names from the user's Drive."""
    try:
        creds = Credentials(
            token=access_token,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=client_id,
            client_secret=client_secret
        )
        service = build('drive', 'v3', credentials=creds, cache_discovery=False)

        results = service.files().list(
            q="mimeType='application/vnd.google-apps.folder' and trashed=false",
            fields="nextPageToken, files(id, name)",
            pageSize=100
        ).execute()
        
        items = results.get('files', [])
        return items
    except Exception as exc:
        raise ValueError(f"Failed to list Drive folders: {exc}") from None
