# Roadmap

## v1.0 — Initial release (current)

- **Credentials**: OAuth2 token refresh, `google_ads.json` loader, in-process token cache
- **REST client**: `gaqlSearch` with pagination, `gaqlMutate`, retry/backoff on 429/5xx
- **Read commands**: `campaigns.list`, `campaigns.insights`, `adgroups.insights`, `keywords.insights`, `search-terms.report`, `conversions.report`
- **Executive report**: `ads.report` — aggregated totals, campaign breakdown, winning keywords, trash terms, IS diagnostics, ad strength, `executive_text` in Spanish
- **Telegram delivery**: `--send-telegram true` on `ads.report`
- **Mutations**: `campaigns.pause`, `campaigns.enable`, `campaigns.set-budget`, `keywords.pause`
- **Safety**: `--confirm true` gate, `--dry-run true` preview, mutation audit log
- **Snapshots**: every command saves timestamped JSON to `ops/roles/cmo/inputs/`
- **Diagnostics**: `check-credentials`, `version-active`

## Planned / Future

### v1.1 — Trend + delta comparison
- `trend` command: compare today's snapshot vs most recent previous for any `kind` (campaigns, keywords)
- WoW deltas: spend, conversions, CPA, IS, QS
- `briefing` multi-call roll-up: campaigns + keywords + search terms + ad strength in one structured output

### v1.2 — Ad group mutations
- `adgroups.pause`, `adgroups.enable`
- `adgroups.set-bid` — update ad group default CPC bid

### v1.3 — Negative keyword management
- `negatives.list` — list campaign and ad group negatives
- `negatives.add` — add negative keywords (campaign or ad group level, requires `--confirm true`)
- Auto-suggest negatives from `trash_search_terms` in `ads.report`

### v2.0 — Search term actions
- One-step `search-terms.add-negative` — from search term directly to negative list
- Batch workflow: review trash terms, approve, add all in one command

### v2.1 — PDF / detailed audit report
- `ads.pdf-report` — extended HTML report published to Telegra.ph, URL sent via Telegram
- Sections: account health, campaign ranking, keyword audit, search term heatmap, QS breakdown

### v2.2 — Multi-client (MCC) support
- `morning-matrix` — scan `~/.openclaw/credentials/clients/` for multiple `google_ads.json` files
- Per-client health score (CPA vs target, IS, QS, conversion trend)
- Single Telegram message with all-client dashboard
