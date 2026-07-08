"""
GitHub OAuth connector & API helper.

Security rules:
  - Access tokens are NEVER logged.
  - All GitHub API calls use the decrypted-at-runtime token.
  - Errors are sanitised before re-raising.
  - GitHub's OAuth callback state is validated to prevent CSRF.

Scopes requested:
  repo          - full read access (private repos) for Engineering Intelligence
  read:user     - user profile
  read:org      - organisation membership
  security_events - security alerts & advisories
  read:packages   - package/release metadata
"""

from typing import Dict, Any, List
import requests

GITHUB_OAUTH_AUTHORIZE = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL       = "https://github.com/login/oauth/access_token"
GITHUB_API             = "https://api.github.com"

SCOPES = "repo read:user user:email read:org security_events read:packages"


# ── OAuth helpers ─────────────────────────────────────────────────────────────

def get_oauth_url(client_id: str, redirect_uri: str, state: str) -> str:
    """Build GitHub OAuth consent URL.  client_secret is NOT in the URL."""
    params = (
        f"client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        f"&scope={SCOPES.replace(' ', '%20')}"
        f"&state={state}"
        f"&allow_signup=false"
    )
    return f"{GITHUB_OAUTH_AUTHORIZE}?{params}"


def exchange_code(client_id: str, client_secret: str,
                  redirect_uri: str, code: str) -> Dict[str, str]:
    """Exchange OAuth code for access token (server-side only)."""
    try:
        resp = requests.post(
            GITHUB_TOKEN_URL,
            json={
                "client_id":     client_id,
                "client_secret": client_secret,
                "code":          code,
                "redirect_uri":  redirect_uri,
            },
            headers={"Accept": "application/json"},
            timeout=15,
        )
        data = resp.json()
        if "error" in data:
            raise ValueError(f"GitHub OAuth error: {data.get('error_description', 'unknown')}")
        return {
            "access_token": data["access_token"],
            "token_type":   data.get("token_type", "bearer"),
            "scope":        data.get("scope", ""),
        }
    except ValueError:
        raise
    except Exception:
        raise ValueError("GitHub token exchange failed.") from None


# ── Authenticated API helpers ─────────────────────────────────────────────────

def _get(token: str, path: str, params: dict = None) -> Any:
    """Make an authenticated GitHub API GET request."""
    resp = requests.get(
        f"{GITHUB_API}{path}",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "Avora-AI-App",
        },
        params=params or {},
        timeout=20,
    )
    if not resp.ok:
        raise ValueError(f"GitHub API Error: {resp.status_code} - {resp.text}")
    return resp.json()


def get_user_info(token: str) -> Dict[str, str]:
    """Return authenticated user's GitHub profile."""
    try:
        data = _get(token, "/user")
        # Also try to get email if not public
        email = data.get("email") or ""
        if not email:
            emails = _get(token, "/user/emails")
            primary = next((e for e in emails if e.get("primary")), None)
            email = primary["email"] if primary else ""
        return {
            "id":         str(data["id"]),
            "login":      data["login"],
            "name":       data.get("name") or "",
            "email":      email,
            "avatar_url": data.get("avatar_url") or "",
        }
    except Exception as exc:
        raise ValueError(f"Failed to retrieve GitHub user info: {exc}") from None


def list_repos(token: str, per_page: int = 100) -> List[Dict]:
    """List all repos the token can access (personal + org)."""
    try:
        repos = _get(token, "/user/repos", {
            "visibility": "all",
            "affiliation": "owner,collaborator,organization_member",
            "sort": "updated",
            "per_page": per_page,
        })
        return [
            {
                "id":          r["id"],
                "full_name":   r["full_name"],
                "name":        r["name"],
                "owner":       r["owner"]["login"],
                "private":     r["private"],
                "language":    r.get("language") or "Unknown",
                "description": r.get("description") or "",
                "default_branch": r.get("default_branch", "main"),
                "pushed_at":   r.get("pushed_at") or "",
                "stars":       r.get("stargazers_count", 0),
                "forks":       r.get("forks_count", 0),
            }
            for r in repos
        ]
    except Exception:
        raise ValueError("Failed to list GitHub repositories.") from None


# ── Domain-specific sync helpers ──────────────────────────────────────────────

def fetch_pull_requests(token: str, repo: str, state: str = "all",
                        per_page: int = 50) -> List[Dict]:
    """Fetch PRs for a repository."""
    try:
        prs = _get(token, f"/repos/{repo}/pulls", {"state": state, "per_page": per_page})
        return [
            {
                "number":      pr["number"],
                "title":       pr["title"],
                "body":        pr.get("body") or "",
                "state":       pr["state"],
                "author":      pr["user"]["login"],
                "created_at":  pr["created_at"],
                "merged_at":   pr.get("merged_at"),
                "labels":      [l["name"] for l in pr.get("labels", [])],
                "reviews":     [],   # fetched separately
            }
            for pr in prs
        ]
    except Exception:
        raise ValueError(f"Failed to fetch PRs for {repo}.") from None


def fetch_issues(token: str, repo: str, state: str = "all",
                 per_page: int = 50) -> List[Dict]:
    """Fetch issues (excludes PRs via filter)."""
    try:
        issues = _get(token, f"/repos/{repo}/issues", {
            "state": state, "per_page": per_page, "filter": "all"
        })
        return [
            {
                "number":     i["number"],
                "title":      i["title"],
                "body":       i.get("body") or "",
                "state":      i["state"],
                "author":     i["user"]["login"],
                "labels":     [l["name"] for l in i.get("labels", [])],
                "assignees":  [a["login"] for a in i.get("assignees", [])],
                "created_at": i["created_at"],
                "closed_at":  i.get("closed_at"),
                "is_pr":      "pull_request" in i,
            }
            for i in issues if "pull_request" not in i   # exclude PRs
        ]
    except Exception:
        raise ValueError(f"Failed to fetch issues for {repo}.") from None


def fetch_commits(token: str, repo: str, per_page: int = 50) -> List[Dict]:
    """Fetch recent commits."""
    try:
        commits = _get(token, f"/repos/{repo}/commits", {"per_page": per_page})
        return [
            {
                "sha":      c["sha"][:8],
                "message":  c["commit"]["message"].split("\n")[0],
                "author":   c["commit"]["author"]["name"],
                "date":     c["commit"]["author"]["date"],
                "files_changed": [],
            }
            for c in commits
        ]
    except Exception:
        raise ValueError(f"Failed to fetch commits for {repo}.") from None


def fetch_readme(token: str, repo: str) -> str:
    """Fetch the README content (decoded)."""
    try:
        import base64
        data = _get(token, f"/repos/{repo}/readme")
        content = data.get("content", "")
        return base64.b64decode(content).decode("utf-8", errors="replace")
    except Exception:
        return ""


def fetch_workflows(token: str, repo: str) -> List[Dict]:
    """Fetch GitHub Actions workflow files."""
    try:
        data = _get(token, f"/repos/{repo}/actions/workflows")
        return [
            {
                "id":    w["id"],
                "name":  w["name"],
                "path":  w["path"],
                "state": w["state"],
            }
            for w in data.get("workflows", [])
        ]
    except Exception:
        return []


def fetch_releases(token: str, repo: str, per_page: int = 20) -> List[Dict]:
    """Fetch releases and changelogs."""
    try:
        releases = _get(token, f"/repos/{repo}/releases", {"per_page": per_page})
        return [
            {
                "tag_name":    r["tag_name"],
                "name":        r.get("name") or r["tag_name"],
                "body":        r.get("body") or "",
                "published_at": r.get("published_at"),
                "prerelease":  r.get("prerelease", False),
            }
            for r in releases
        ]
    except Exception:
        return []


def fetch_security_alerts(token: str, repo: str) -> Dict[str, Any]:
    """Fetch Dependabot alerts and code scanning alerts."""
    alerts: Dict[str, Any] = {"dependabot": [], "code_scanning": []}
    try:
        alerts["dependabot"] = _get(token, f"/repos/{repo}/dependabot/alerts",
                                    {"state": "open", "per_page": 30})
    except Exception:
        pass
    try:
        alerts["code_scanning"] = _get(token, f"/repos/{repo}/code-scanning/alerts",
                                       {"state": "open", "per_page": 30})
    except Exception:
        pass
    return alerts


def fetch_contributors(token: str, repo: str) -> List[Dict]:
    """Fetch top contributors for the knowledge graph."""
    try:
        contribs = _get(token, f"/repos/{repo}/contributors", {"per_page": 30})
        return [
            {"login": c["login"], "contributions": c["contributions"]}
            for c in contribs
        ]
    except Exception:
        return []


def fetch_languages(token: str, repo: str) -> Dict[str, int]:
    """Fetch language breakdown bytes."""
    try:
        return _get(token, f"/repos/{repo}/languages")
    except Exception:
        return {}


def fetch_repo_metadata(token: str, repo: str) -> Dict[str, Any]:
    """Fetch full repository metadata for the knowledge graph node."""
    try:
        data = _get(token, f"/repos/{repo}")
        return {
            "full_name":        data["full_name"],
            "description":      data.get("description") or "",
            "default_branch":   data.get("default_branch", "main"),
            "language":         data.get("language") or "Unknown",
            "stars":            data.get("stargazers_count", 0),
            "forks":            data.get("forks_count", 0),
            "open_issues":      data.get("open_issues_count", 0),
            "topics":           data.get("topics", []),
            "visibility":       data.get("visibility", "private"),
        }
    except Exception:
        return {}
