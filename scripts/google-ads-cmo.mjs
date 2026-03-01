#!/usr/bin/env node
// scripts/google-ads-cmo.mjs
// Google Ads CMO skill — single CLI entry point. All commands routed here.
// Usage: node scripts/google-ads-cmo.mjs <command> [options]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadGoogleAdsCreds } from '../src/core/creds/google-ads.mjs';
import { gaqlSearch } from '../src/google/ads/client.mjs';
import {
  getCampaigns, getAdGroups, getKeywords,
  getSearchTerms, getConversions, getAdStrength
} from '../src/google/ads/insights.mjs';
import { pauseCampaign, enableCampaign, setCampaignBudget, pauseKeyword } from '../src/google/ads/mutate.mjs';
import { buildReport } from '../src/google/ads/report.mjs';

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      args[key] = (next && !next.startsWith('--')) ? (i++, next) : 'true';
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Snapshot + output helpers
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPS_DIR = path.join(__dirname, '..', 'ops', 'roles', 'cmo', 'inputs');

function saveSnapshot(command, data) {
  fs.mkdirSync(OPS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(OPS_DIR, `google-ads-cmo-${command}-${ts}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function saveMutation(record) {
  fs.mkdirSync(OPS_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(OPS_DIR, `google-ads-cmo-mutations-${date}.json`);
  const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  existing.push({ ...record, timestamp: new Date().toISOString() });
  fs.writeFileSync(file, JSON.stringify(existing, null, 2));
}

function out(data) {
  console.log(JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// Telegram delivery
// ---------------------------------------------------------------------------
async function sendTelegram({ text, homeDir = process.env.HOME || '' }) {
  const p = path.join(homeDir, '.openclaw', 'credentials', 'telegram.json');
  if (!fs.existsSync(p)) throw new Error('telegram.json not found in ~/.openclaw/credentials/');
  const { botToken, defaultChatId } = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!botToken) throw new Error('telegram.json missing botToken');
  if (!defaultChatId) throw new Error('telegram.json missing defaultChatId');

  const chunks = [];
  for (let i = 0; i < text.length; i += 4096) chunks.push(text.slice(i, i + 4096));

  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: defaultChatId, text: chunk })
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Telegram error ${res.status}: ${t.slice(0, 300)}`);
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Date preset normalization: meta-cmo style (last_7d) → GAQL style (LAST_7_DAYS)
// ---------------------------------------------------------------------------
function normalizePreset(p) {
  if (!p) return 'LAST_7_DAYS';
  const map = {
    last_7d: 'LAST_7_DAYS', last_7_days: 'LAST_7_DAYS',
    last_14d: 'LAST_14_DAYS', last_14_days: 'LAST_14_DAYS',
    last_30d: 'LAST_30_DAYS', last_30_days: 'LAST_30_DAYS',
    this_month: 'THIS_MONTH', last_month: 'LAST_MONTH',
    today: 'TODAY', yesterday: 'YESTERDAY'
  };
  return map[p.toLowerCase()] || p.toUpperCase();
}

// ---------------------------------------------------------------------------
// Micros conversion helper for display
// ---------------------------------------------------------------------------
function m(v) { return parseFloat(v || 0) / 1_000_000; }
function pct(v) { return parseFloat(v || 0) * 100; }
function parseIs(v) { return (v === '--' || v == null) ? null : parseFloat(v) * 100; }

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------
const HELP = `
Usage: node scripts/google-ads-cmo.mjs <command> [options]

DIAGNOSTICS
  check-credentials                               Validate credentials + API connectivity
  version-active                                  Show active API version

READ COMMANDS
  campaigns.list       [--datePreset LAST_7_DAYS] [--since YYYY-MM-DD --until YYYY-MM-DD]
  campaigns.insights   [--datePreset] [--since --until]
  adgroups.insights    [--datePreset] [--since --until]
  keywords.insights    [--datePreset] [--since --until]
  search-terms.report  [--datePreset] [--since --until]
  conversions.report   [--datePreset] [--since --until]
  ads.report           [--datePreset] [--since --until] [--send-telegram true]

Date presets: LAST_7_DAYS (default), LAST_14_DAYS, LAST_30_DAYS, THIS_MONTH, LAST_MONTH, TODAY, YESTERDAY

MUTATION COMMANDS (require --confirm true)
  campaigns.pause       --campaignId <id> --confirm true [--dry-run true]
  campaigns.enable      --campaignId <id> --confirm true [--dry-run true]
  campaigns.set-budget  --campaignId <id> --dailyBudget <amount> --confirm true [--dry-run true]
  keywords.pause        --adGroupId <id> --criterionId <id> --confirm true [--dry-run true]

  Use keywords.insights to get adGroupId + criterionId for keyword mutations.
  Use campaigns.list to get campaignId.
`.trim();

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const [,, command, ...rest] = process.argv;
const args = parseArgs(rest);

if (!command || command === '--help' || command === 'help') {
  console.log(HELP);
  process.exit(0);
}

async function main() {
  const datePreset = normalizePreset(args.datePreset);
  const since = args.since || null;
  const until = args.until || null;
  const confirm = args.confirm === 'true';
  const dryRun = args['dry-run'] === 'true' || args.dryRun === 'true';

  // -------------------------------------------------------------------------
  // Diagnostics
  // -------------------------------------------------------------------------
  if (command === 'check-credentials') {
    const creds = loadGoogleAdsCreds();
    const rows = await gaqlSearch({
      creds,
      query: 'SELECT customer.id, customer.descriptive_name, customer.currency_code FROM customer LIMIT 1'
    });
    const customer = rows[0]?.customer || {};
    out({
      status: 'ok',
      customer_id: creds.customer_id,
      customer_name: customer.descriptiveName,
      currency: customer.currencyCode,
      api_version: creds.api_version
    });
    return;
  }

  if (command === 'version-active') {
    const creds = loadGoogleAdsCreds();
    out({ skill: 'google-ads-cmo', api_version: creds.api_version, node: process.version });
    return;
  }

  // -------------------------------------------------------------------------
  // Read commands
  // -------------------------------------------------------------------------
  const creds = loadGoogleAdsCreds();

  if (command === 'campaigns.list') {
    const rows = await getCampaigns({ creds, datePreset, since, until });
    const result = {
      command, datePreset, since, until, count: rows.length,
      campaigns: rows.map(r => ({
        id: r.campaign?.id,
        name: r.campaign?.name,
        status: r.campaign?.status,
        channel: r.campaign?.advertisingChannelType,
        spend: m(r.metrics?.costMicros),
        impressions: parseFloat(r.metrics?.impressions || 0),
        clicks: parseFloat(r.metrics?.clicks || 0),
        conversions: parseFloat(r.metrics?.conversions || 0)
      }))
    };
    saveSnapshot('campaigns.list', result);
    out(result);
    return;
  }

  if (command === 'campaigns.insights') {
    const rows = await getCampaigns({ creds, datePreset, since, until });
    const result = {
      command, datePreset, since, until, count: rows.length,
      data: rows.map(r => ({
        campaign_id: r.campaign?.id,
        campaign_name: r.campaign?.name,
        status: r.campaign?.status,
        channel: r.campaign?.advertisingChannelType,
        spend: m(r.metrics?.costMicros),
        impressions: parseFloat(r.metrics?.impressions || 0),
        clicks: parseFloat(r.metrics?.clicks || 0),
        ctr_pct: pct(r.metrics?.ctr),
        avg_cpc: m(r.metrics?.averageCpc),
        conversions: parseFloat(r.metrics?.conversions || 0),
        cpa: m(r.metrics?.costPerConversion),
        impression_share_pct: parseIs(r.metrics?.searchImpressionShare),
        is_lost_budget_pct: parseIs(r.metrics?.searchBudgetLostImpressionShare),
        is_lost_rank_pct: parseIs(r.metrics?.searchRankLostImpressionShare)
      }))
    };
    saveSnapshot('campaigns.insights', result);
    out(result);
    return;
  }

  if (command === 'adgroups.insights') {
    const rows = await getAdGroups({ creds, datePreset, since, until });
    const result = {
      command, datePreset, since, until, count: rows.length,
      data: rows.map(r => ({
        ad_group_id: r.adGroup?.id,
        ad_group_name: r.adGroup?.name,
        campaign_name: r.campaign?.name,
        status: r.adGroup?.status,
        spend: m(r.metrics?.costMicros),
        impressions: parseFloat(r.metrics?.impressions || 0),
        clicks: parseFloat(r.metrics?.clicks || 0),
        ctr_pct: pct(r.metrics?.ctr),
        avg_cpc: m(r.metrics?.averageCpc),
        conversions: parseFloat(r.metrics?.conversions || 0),
        cpa: m(r.metrics?.costPerConversion)
      }))
    };
    saveSnapshot('adgroups.insights', result);
    out(result);
    return;
  }

  if (command === 'keywords.insights') {
    const rows = await getKeywords({ creds, datePreset, since, until });
    const result = {
      command, datePreset, since, until, count: rows.length,
      data: rows.map(r => ({
        keyword: r.adGroupCriterion?.keyword?.text,
        match_type: r.adGroupCriterion?.keyword?.matchType,
        criterion_id: r.adGroupCriterion?.criterionId,
        ad_group_id: r.adGroup?.id,
        ad_group_name: r.adGroup?.name,
        campaign_name: r.campaign?.name,
        status: r.adGroupCriterion?.status,
        quality_score: r.adGroupCriterion?.qualityInfo?.qualityScore,
        creative_quality: r.adGroupCriterion?.qualityInfo?.creativeQualityScore,
        landing_quality: r.adGroupCriterion?.qualityInfo?.postClickQualityScore,
        expected_ctr: r.adGroupCriterion?.qualityInfo?.searchPredictedCtr,
        spend: m(r.metrics?.costMicros),
        impressions: parseFloat(r.metrics?.impressions || 0),
        clicks: parseFloat(r.metrics?.clicks || 0),
        ctr_pct: pct(r.metrics?.ctr),
        avg_cpc: m(r.metrics?.averageCpc),
        conversions: parseFloat(r.metrics?.conversions || 0),
        cpa: m(r.metrics?.costPerConversion)
      }))
    };
    saveSnapshot('keywords.insights', result);
    out(result);
    return;
  }

  if (command === 'search-terms.report') {
    const rows = await getSearchTerms({ creds, datePreset, since, until });
    const result = {
      command, datePreset, since, until, count: rows.length,
      data: rows.map(r => ({
        search_term: r.searchTermView?.searchTerm,
        status: r.searchTermView?.status,
        campaign_name: r.campaign?.name,
        ad_group_name: r.adGroup?.name,
        impressions: parseFloat(r.metrics?.impressions || 0),
        clicks: parseFloat(r.metrics?.clicks || 0),
        ctr_pct: pct(r.metrics?.ctr),
        avg_cpc: m(r.metrics?.averageCpc),
        spend: m(r.metrics?.costMicros),
        conversions: parseFloat(r.metrics?.conversions || 0),
        cpa: m(r.metrics?.costPerConversion)
      }))
    };
    saveSnapshot('search-terms.report', result);
    out(result);
    return;
  }

  if (command === 'conversions.report') {
    const { actions, campaignMetrics } = await getConversions({ creds, datePreset, since, until });
    const result = {
      command, datePreset, since, until,
      conversion_actions: actions.map(r => ({
        id: r.conversionAction?.id,
        name: r.conversionAction?.name,
        type: r.conversionAction?.type,
        category: r.conversionAction?.category,
        status: r.conversionAction?.status,
        primary_for_goal: r.conversionAction?.primaryForGoal,
        include_in_metric: r.conversionAction?.includeInConversionsMetric
      })),
      by_campaign: campaignMetrics.map(r => ({
        campaign_name: r.campaign?.name,
        conversions: parseFloat(r.metrics?.conversions || 0),
        all_conversions: parseFloat(r.metrics?.allConversions || 0),
        conversion_value: parseFloat(r.metrics?.conversionsValue || 0),
        cost_per_conversion: m(r.metrics?.costPerConversion)
      }))
    };
    saveSnapshot('conversions.report', result);
    out(result);
    return;
  }

  if (command === 'ads.report') {
    const report = await buildReport({ creds, datePreset, since, until });
    saveSnapshot('ads.report', report);
    out(report);

    if (args['send-telegram'] === 'true' || args.sendTelegram === 'true') {
      try {
        await sendTelegram({ text: report.executive_text });
        console.error('Enviado a Telegram ✓');
      } catch (e) {
        console.error(`Telegram error: ${e.message}`);
        process.exit(1);
      }
    }
    return;
  }

  // -------------------------------------------------------------------------
  // Mutation commands
  // -------------------------------------------------------------------------
  if (command === 'campaigns.pause') {
    if (!args.campaignId) throw new Error('--campaignId required');
    if (!confirm) throw new Error('--confirm true required for mutation commands');
    if (dryRun) { out({ dry_run: true, command, campaignId: args.campaignId, would_do: 'PAUSE campaign' }); return; }
    const result = await pauseCampaign({ creds, campaignId: args.campaignId });
    saveMutation({ command, campaignId: args.campaignId, result });
    out({ ok: true, command, campaignId: args.campaignId, new_status: 'PAUSED' });
    return;
  }

  if (command === 'campaigns.enable') {
    if (!args.campaignId) throw new Error('--campaignId required');
    if (!confirm) throw new Error('--confirm true required for mutation commands');
    if (dryRun) { out({ dry_run: true, command, campaignId: args.campaignId, would_do: 'ENABLE campaign' }); return; }
    const result = await enableCampaign({ creds, campaignId: args.campaignId });
    saveMutation({ command, campaignId: args.campaignId, result });
    out({ ok: true, command, campaignId: args.campaignId, new_status: 'ENABLED' });
    return;
  }

  if (command === 'campaigns.set-budget') {
    if (!args.campaignId) throw new Error('--campaignId required');
    if (!args.dailyBudget) throw new Error('--dailyBudget required (e.g. --dailyBudget 500 for $500/day)');
    if (!confirm) throw new Error('--confirm true required for mutation commands');
    const dailyBudget = parseFloat(args.dailyBudget);
    if (isNaN(dailyBudget) || dailyBudget <= 0) throw new Error('--dailyBudget must be a positive number');
    if (dryRun) { out({ dry_run: true, command, campaignId: args.campaignId, dailyBudget, would_do: `SET daily budget to $${dailyBudget}` }); return; }
    const result = await setCampaignBudget({ creds, campaignId: args.campaignId, dailyBudgetAmount: dailyBudget });
    saveMutation({ command, campaignId: args.campaignId, dailyBudget, result });
    out({ ok: true, command, campaignId: args.campaignId, daily_budget: dailyBudget });
    return;
  }

  if (command === 'keywords.pause') {
    if (!args.adGroupId) throw new Error('--adGroupId required (from keywords.insights output)');
    if (!args.criterionId) throw new Error('--criterionId required (from keywords.insights output)');
    if (!confirm) throw new Error('--confirm true required for mutation commands');
    if (dryRun) { out({ dry_run: true, command, adGroupId: args.adGroupId, criterionId: args.criterionId, would_do: 'PAUSE keyword' }); return; }
    const result = await pauseKeyword({ creds, adGroupId: args.adGroupId, criterionId: args.criterionId });
    saveMutation({ command, adGroupId: args.adGroupId, criterionId: args.criterionId, result });
    out({ ok: true, command, adGroupId: args.adGroupId, criterionId: args.criterionId, new_status: 'PAUSED' });
    return;
  }

  throw new Error(`Unknown command: "${command}". Run with --help for usage.`);
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
