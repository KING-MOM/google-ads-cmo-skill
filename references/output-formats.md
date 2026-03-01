# Output Formats — JSON Schemas

All commands output JSON to stdout. Snapshots are saved to `ops/roles/cmo/inputs/`.

---

## check-credentials
```json
{
  "status": "ok",
  "customer_id": "1234567890",
  "customer_name": "Mi Empresa",
  "currency": "MXN",
  "api_version": "v19"
}
```

---

## campaigns.list
```json
{
  "command": "campaigns.list",
  "datePreset": "LAST_7_DAYS",
  "since": null,
  "until": null,
  "count": 3,
  "campaigns": [
    {
      "id": "987654321",
      "name": "Campaña Principal",
      "status": "ENABLED",
      "channel": "SEARCH",
      "spend": 1234.56,
      "impressions": 45000,
      "clicks": 1350,
      "conversions": 42
    }
  ]
}
```

---

## campaigns.insights
```json
{
  "command": "campaigns.insights",
  "datePreset": "LAST_7_DAYS",
  "count": 3,
  "data": [
    {
      "campaign_id": "987654321",
      "campaign_name": "Campaña Principal",
      "status": "ENABLED",
      "channel": "SEARCH",
      "spend": 1234.56,
      "impressions": 45000,
      "clicks": 1350,
      "ctr_pct": 3.0,
      "avg_cpc": 0.91,
      "conversions": 42,
      "cpa": 29.39,
      "impression_share_pct": 62.5,
      "is_lost_budget_pct": 18.3,
      "is_lost_rank_pct": 9.1
    }
  ]
}
```
Notes:
- `impression_share_pct` / `is_lost_*_pct` are `null` when Google returns `"--"` (insufficient data)
- All monetary values in account currency (MXN unless overridden)

---

## adgroups.insights
```json
{
  "command": "adgroups.insights",
  "count": 5,
  "data": [
    {
      "ad_group_id": "111222333",
      "ad_group_name": "Palabras clave exactas",
      "campaign_name": "Campaña Principal",
      "status": "ENABLED",
      "spend": 456.78,
      "impressions": 12000,
      "clicks": 390,
      "ctr_pct": 3.25,
      "avg_cpc": 1.17,
      "conversions": 15,
      "cpa": 30.45
    }
  ]
}
```

---

## keywords.insights
```json
{
  "command": "keywords.insights",
  "count": 48,
  "data": [
    {
      "keyword": "seguro de vida",
      "match_type": "EXACT",
      "criterion_id": "555666777",
      "ad_group_id": "111222333",
      "ad_group_name": "Palabras clave exactas",
      "campaign_name": "Campaña Principal",
      "status": "ENABLED",
      "quality_score": 8,
      "creative_quality": "ABOVE_AVERAGE",
      "landing_quality": "AVERAGE",
      "expected_ctr": "ABOVE_AVERAGE",
      "spend": 234.56,
      "impressions": 5600,
      "clicks": 168,
      "ctr_pct": 3.0,
      "avg_cpc": 1.40,
      "conversions": 8,
      "cpa": 29.32
    }
  ]
}
```
Note: Use `ad_group_id` + `criterion_id` for `keywords.pause` command.

---

## search-terms.report
```json
{
  "command": "search-terms.report",
  "count": 312,
  "data": [
    {
      "search_term": "seguro de vida económico",
      "status": "NONE",
      "campaign_name": "Campaña Principal",
      "ad_group_name": "Palabras clave exactas",
      "impressions": 890,
      "clicks": 67,
      "ctr_pct": 7.53,
      "avg_cpc": 0.89,
      "spend": 59.63,
      "conversions": 4,
      "cpa": 14.91
    }
  ]
}
```
Note: `status` values: `ADDED` (already a keyword), `EXCLUDED` (already negative), `NONE` (candidate).

---

## conversions.report
```json
{
  "command": "conversions.report",
  "conversion_actions": [
    {
      "id": "99887766",
      "name": "WhatsApp Click",
      "type": "CLICK_TO_CALL",
      "category": "LEAD",
      "status": "ENABLED",
      "primary_for_goal": true,
      "include_in_metric": true
    }
  ],
  "by_campaign": [
    {
      "campaign_name": "Campaña Principal",
      "conversions": 42,
      "all_conversions": 51,
      "conversion_value": 0,
      "cost_per_conversion": 29.39
    }
  ]
}
```

---

## ads.report
```json
{
  "period": "últimos 7 días",
  "currency": "MXN",
  "totals": {
    "spend": 1234.56,
    "conversions": 42,
    "cpa": 29.39,
    "ctr_pct": 3.0,
    "avg_cpc": 0.91,
    "impressions": 45000,
    "avg_impression_share_pct": 62.5,
    "avg_budget_lost_is_pct": 18.3,
    "avg_quality_score": 7.2
  },
  "by_campaign": [ /* same as campaigns.insights */ ],
  "winning_keywords": [
    {
      "keyword": "seguro de vida",
      "match_type": "EXACT",
      "campaign": "Campaña Principal",
      "ad_group": "Exactas",
      "ad_group_id": "111222333",
      "criterion_id": "555666777",
      "quality_score": 8,
      "spend": 234.56,
      "conversions": 8,
      "cpa": 29.32,
      "ctr_pct": 3.0,
      "avg_cpc": 1.40,
      "impressions": 5600
    }
  ],
  "low_qs_keywords": [
    { "keyword": "vida seguro barato", "campaign": "Campaña 2", "quality_score": 3, "spend": 45.00 }
  ],
  "top_search_terms": [ /* top terms by conversions */ ],
  "trash_search_terms": [ /* low-intent terms */ ],
  "wasted_terms": [ /* 0 conv, spend > 2x CPA */ ],
  "underperformers": [ /* campaigns with 0 conv, spend > 2x CPA */ ],
  "ad_strength_summary": {
    "EXCELLENT": 2,
    "GOOD": 3,
    "AVERAGE": 1,
    "POOR": 1
  },
  "poor_ads": [
    { "campaign": "Campaña 2", "ad_group": "Broad", "strength": "POOR" }
  ],
  "executive_text": "Diagnóstico de Desempeño: Google Ads\n..."
}
```

---

## Mutation responses

### campaigns.pause / campaigns.enable
```json
{ "ok": true, "command": "campaigns.pause", "campaignId": "987654321", "new_status": "PAUSED" }
```

### campaigns.set-budget
```json
{ "ok": true, "command": "campaigns.set-budget", "campaignId": "987654321", "daily_budget": 500 }
```

### keywords.pause
```json
{ "ok": true, "command": "keywords.pause", "adGroupId": "111222333", "criterionId": "555666777", "new_status": "PAUSED" }
```

### Dry run (any mutation)
```json
{ "dry_run": true, "command": "campaigns.pause", "campaignId": "987654321", "would_do": "PAUSE campaign" }
```
