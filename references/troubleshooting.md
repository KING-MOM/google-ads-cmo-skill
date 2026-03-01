# Troubleshooting Guide

## Credential errors

### `Missing credentials: ~/.openclaw/credentials/google_ads.json`
Create the file with all required fields. See [permissions.md](permissions.md).

### `google_ads.json missing refresh_token`
Re-run the OAuth2 flow. Refresh tokens don't expire unless:
- The user revokes access in Google account settings
- The app is deleted from Google Cloud Console
- The token is unused for 6+ months (Google policy)

### `OAuth token refresh failed 400: invalid_grant`
The refresh token is invalid or expired. Generate a new one via the OAuth2 authorization flow.

### `OAuth token refresh failed 403: access_denied`
The OAuth2 app may be in "Testing" mode with limited authorized users. Go to Google Cloud Console → OAuth consent screen → Add your email to test users. Or publish the app.

---

## API errors

### `Google Ads API HTTP 403`
Full error typically includes:
- `DEVELOPER_TOKEN_NOT_APPROVED` — Apply for Standard access at ads.google.com/aw/apicenter
- `CUSTOMER_NOT_ENABLED` — The customer account is not active or doesn't exist
- `AUTHORIZATION_ERROR` — The refresh token doesn't have access to this customer ID

### `Google Ads API HTTP 400: INVALID_ARGUMENT`
Usually a GAQL syntax error. Check:
- Field names are correct (use snake_case in GAQL, e.g. `metrics.cost_micros`)
- Resource compatibility — not all fields are compatible in the same FROM clause
- Date filter syntax: `segments.date DURING LAST_7_DAYS` (not `last_7_days`)

### `Google Ads API HTTP 400: metrics.search_impression_share is not compatible`
Impression share metrics can't be used with `segments.date` in the SELECT clause.
This skill avoids this by not selecting `segments.date` — only filtering by it in WHERE.

### `Google Ads API HTTP 429` (rate limit)
The client automatically retries up to 3 times with exponential backoff. If it persists:
- Wait a few minutes and retry
- You may be hitting the daily quota limit (15,000 operations for Standard access)

### `Campaign X not found` (campaigns.set-budget)
Verify the campaign ID with `campaigns.list`. IDs change only if campaigns are deleted and recreated.

### `Campaign X has no linked budget resource`
Shared budgets may not have a directly accessible budget resource. Check if the campaign uses a shared budget in Google Ads UI.

---

## Data interpretation

### `impression_share_pct: null` in campaigns.insights
Google returns `"--"` for IS when there's insufficient data (very low impressions, < 10% IS, or new campaigns). This is treated as `null` — not a bug.

### Quality score is `null` for some keywords
Keywords need at least ~1,000 impressions over a few days to show a quality score. New or rarely-triggered keywords may have `null`.

### Conversions show as 0 but you see them in Google Ads UI
Check that the conversion action's `include_in_conversions_metric` is `true` (visible in `conversions.report`). Some conversion types (All Conversions) may differ from the primary metric.

### IS metrics not matching Google Ads UI
IS is an average across the date range. Google Ads UI may show IS differently depending on campaign type (Search vs Display vs Performance Max). This skill only fetches Search IS.

---

## Mutation issues

### `--confirm true required for mutation commands`
Intentional safety gate. Always pass `--confirm true` explicitly.

### Budget update succeeds but Google Ads UI shows old budget
Budget changes may take a few minutes to reflect in the UI. The API call returned successfully — the change is queued.

### `keywords.pause` throws resource not found
Verify `ad_group_id` and `criterion_id` from a fresh `keywords.insights` run. These IDs are stable unless the keyword is removed and re-added.

---

## Node.js requirements

This skill uses native `fetch` (available in Node.js 18+) and ES modules (`.mjs`).

```bash
node --version  # must be >= 18.0.0
```

If you see `fetch is not defined`, upgrade Node.js.
