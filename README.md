# google-ads-cmo-skill

**OpenClaw skill** that gives an AI CMO agent full operational access to Google Ads — read intelligence, campaign management, search term analysis, quality score diagnostics, and executive reporting via Telegram.

## What this does

| Domain | Capabilities |
|--------|-------------|
| **Campaigns** | List, insights (spend, CTR, CPC, CPA, impression share), pause, enable, budget update |
| **Ad Groups** | Performance breakdown by ad group |
| **Keywords** | Performance + quality score (1–10), creative quality, landing quality, expected CTR |
| **Search Terms** | Full search term report, trash detection, negative keyword recommendations |
| **Conversions** | Conversion action catalog + per-campaign conversion metrics |
| **Ad Strength** | EXCELLENT/GOOD/POOR/NO_ADS breakdown per ad |
| **Executive Report** | Automated CMO 1-pager (`ads.report`) with diagnostics, decisions, and risks in Spanish |
| **Telegram Delivery** | Auto-send `ads.report` to Telegram with `--send-telegram true` |

## Architecture

```
scripts/google-ads-cmo.mjs           ← single CLI entry point, all commands routed here
  ├── Google Ads REST API (v19)      ← GAQL search + mutate via plain fetch (no SDK)
  └── OAuth2 token refresh           ← cached in-process, refreshed automatically

src/core/creds/google-ads.mjs        ← credential loader
src/core/util/sleep.mjs              ← retry backoff helper
src/google/ads/client.mjs            ← REST client (OAuth2 + pagination + retry)
src/google/ads/insights.mjs          ← GAQL query functions (all reads)
src/google/ads/mutate.mjs            ← campaign/budget/keyword mutations
src/google/ads/report.mjs            ← executive report builder

SKILL.md                             ← agent-facing skill definition (OpenClaw runtime)
references/
  ├── output-formats.md              ← JSON schema for every command output
  ├── permissions.md                 ← Google Ads API credential + scope checklist
  └── troubleshooting.md             ← common errors + fixes
```

**Design principles:**
- **No SDK, no dependencies** — pure Node.js ESM (Node 18+), plain `fetch` only
- **Single CLI entry point** — `scripts/google-ads-cmo.mjs` is the stable router
- **Snapshot-based** — every command writes timestamped JSON to `ops/roles/cmo/inputs/`
- **Read-by-default** — all reads are side-effect-free. Mutations require `--confirm true`
- **Retry with backoff** — API calls retry on 429/5xx with exponential backoff (up to 3 attempts)
- **Token caching** — OAuth2 access token cached in-process, never logged or persisted

## Repo layout

This repo **is** the skill folder. `SKILL.md` lives at the repo root.

When cloned into an OpenClaw workspace:
```
{workspace}/skills/google-ads-cmo/    ← this repo
```

Runtime outputs go to (gitignored):
```
ops/roles/cmo/inputs/           ← snapshots, mutations log
```

## Credentials

Create `~/.openclaw/credentials/google_ads.json`:

```json
{
  "developer_token": "YOUR_DEVELOPER_TOKEN",
  "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
  "client_secret": "YOUR_CLIENT_SECRET",
  "refresh_token": "YOUR_REFRESH_TOKEN",
  "customer_id": "1234567890"
}
```

- **developer_token**: from Google Ads API Center (ads.google.com/aw/apicenter)
- **client_id / client_secret**: from Google Cloud Console OAuth2 credentials
- **refresh_token**: from OAuth2 authorization flow with `https://www.googleapis.com/auth/adwords` scope
- **customer_id**: your Google Ads account ID (digits only, no dashes)

Optional — Telegram delivery:

```json
// ~/.openclaw/credentials/telegram.json
{
  "botToken": "...",
  "defaultChatId": "123456789"
}
```

## Smoke test

```bash
# Validate credentials + API connectivity
node scripts/google-ads-cmo.mjs check-credentials

# List campaigns
node scripts/google-ads-cmo.mjs campaigns.list --datePreset LAST_7_DAYS

# Executive report
node scripts/google-ads-cmo.mjs ads.report --datePreset LAST_7_DAYS
```

## Usage

```bash
# --- Intelligence reads ---
node scripts/google-ads-cmo.mjs campaigns.insights --datePreset LAST_7_DAYS
node scripts/google-ads-cmo.mjs keywords.insights --since 2026-02-01 --until 2026-02-28
node scripts/google-ads-cmo.mjs search-terms.report --datePreset LAST_30_DAYS
node scripts/google-ads-cmo.mjs conversions.report --datePreset LAST_7_DAYS

# --- Executive report ---
node scripts/google-ads-cmo.mjs ads.report --datePreset LAST_7_DAYS
node scripts/google-ads-cmo.mjs ads.report --datePreset LAST_7_DAYS --send-telegram true

# --- Mutations (require --confirm true) ---
node scripts/google-ads-cmo.mjs campaigns.pause --campaignId 123456789 --confirm true
node scripts/google-ads-cmo.mjs campaigns.enable --campaignId 123456789 --confirm true
node scripts/google-ads-cmo.mjs campaigns.set-budget --campaignId 123456789 --dailyBudget 500 --confirm true
node scripts/google-ads-cmo.mjs keywords.pause --adGroupId 111 --criterionId 222 --confirm true

# --- Dry run ---
node scripts/google-ads-cmo.mjs campaigns.pause --campaignId 123456789 --confirm true --dry-run true
```

Full command reference: see [SKILL.md](SKILL.md).

## Safety model

- **Read commands** have zero side effects.
- **Mutations** (pause, enable, budget) require `--confirm true`. Use `--dry-run true` to preview.
- **Audit log** — all mutations are appended to `ops/roles/cmo/inputs/google-ads-cmo-mutations-{date}.json`.
- **Token safety** — OAuth2 tokens are never logged or written to snapshot files.
- **Permission scope** — see [references/permissions.md](references/permissions.md).

## References

| File | Purpose |
|------|---------|
| [SKILL.md](SKILL.md) | Agent-facing skill definition with full command reference |
| [references/output-formats.md](references/output-formats.md) | JSON schema for every command output |
| [references/permissions.md](references/permissions.md) | Google Ads API credential + scope checklist |
| [references/troubleshooting.md](references/troubleshooting.md) | Common errors and fixes |
