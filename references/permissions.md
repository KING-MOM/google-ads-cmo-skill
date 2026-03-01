# Google Ads CMO — Credentials & Permissions Checklist

## Required credentials (`~/.openclaw/credentials/google_ads.json`)

| Field | Description | Where to get it |
|-------|-------------|-----------------|
| `developer_token` | 22-char token, required for every API call | ads.google.com/aw/apicenter |
| `client_id` | OAuth2 client ID | console.cloud.google.com → APIs & Services → Credentials |
| `client_secret` | OAuth2 client secret | Same as above |
| `refresh_token` | Long-lived token for offline access | OAuth2 authorization flow (see below) |
| `customer_id` | Google Ads account ID (digits only, no dashes) | Google Ads UI → top-right account number |

Optional:
| Field | Description |
|-------|-------------|
| `api_version` | Defaults to `v19`. Override if needed (e.g. `"v20"`) |

## OAuth2 scope required

```
https://www.googleapis.com/auth/adwords
```

This single scope covers all read and write operations on Google Ads.

## Getting a refresh token (one-time setup)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project (or use existing)
3. Enable **Google Ads API**
4. Create **OAuth2 credentials** (type: Desktop app or Web app)
5. Note your `client_id` and `client_secret`
6. Use the OAuth2 Playground or a local script to authorize with scope `https://www.googleapis.com/auth/adwords`
7. Exchange the authorization code for tokens — save the `refresh_token` (it doesn't expire unless revoked)

**Quick CLI approach using curl:**
```bash
# Step 1: Open this URL in a browser and authorize
https://accounts.google.com/o/oauth2/auth?client_id=YOUR_CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob&scope=https://www.googleapis.com/auth/adwords&response_type=code&access_type=offline

# Step 2: Exchange the code for tokens
curl -X POST https://oauth2.googleapis.com/token \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "redirect_uri=urn:ietf:wg:oauth:2.0:oob" \
  -d "code=AUTHORIZATION_CODE" \
  -d "grant_type=authorization_code"
```

## Developer token access levels

| Level | What it allows |
|-------|---------------|
| Basic access (test) | Test accounts only, limited data |
| Standard access | Production accounts, up to 15,000 ops/day |

Apply for Standard access at: ads.google.com/aw/apicenter

## Read vs. write operations

This skill uses a **single scope** for all operations. Read operations are always safe. Write operations require `--confirm true` in the CLI.

| Operation | Read/Write |
|-----------|-----------|
| `campaigns.list`, `campaigns.insights` | Read |
| `adgroups.insights` | Read |
| `keywords.insights` | Read |
| `search-terms.report` | Read |
| `conversions.report` | Read |
| `ads.report` | Read |
| `campaigns.pause`, `campaigns.enable` | Write |
| `campaigns.set-budget` | Write |
| `keywords.pause` | Write |

## Token safety
- Tokens are loaded from disk at startup and kept in memory only
- Access tokens are cached in-process and refreshed automatically (never persisted to disk)
- Tokens are never included in snapshot files or logs
