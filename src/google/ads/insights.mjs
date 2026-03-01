// src/google/ads/insights.mjs
// GAQL query functions for all read commands.

import { gaqlSearch } from './client.mjs';

// --------------------------------------------------------------------------
// Date filter helper
// --------------------------------------------------------------------------
function dateFilter(datePreset, since, until) {
  if (since && until) return `segments.date BETWEEN '${since}' AND '${until}'`;
  return `segments.date DURING ${datePreset || 'LAST_7_DAYS'}`;
}

// --------------------------------------------------------------------------
// Campaigns — metrics + impression share
// --------------------------------------------------------------------------
export async function getCampaigns({ creds, datePreset, since, until }) {
  const df = dateFilter(datePreset, since, until);
  const query = `
    SELECT
      campaign.id, campaign.name, campaign.status,
      campaign.advertising_channel_type,
      metrics.impressions, metrics.clicks, metrics.ctr,
      metrics.average_cpc, metrics.cost_micros,
      metrics.conversions, metrics.cost_per_conversion,
      metrics.search_impression_share,
      metrics.search_budget_lost_impression_share,
      metrics.search_rank_lost_impression_share
    FROM campaign
    WHERE ${df}
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `.trim();
  return gaqlSearch({ creds, query });
}

// --------------------------------------------------------------------------
// Ad Groups
// --------------------------------------------------------------------------
export async function getAdGroups({ creds, datePreset, since, until }) {
  const df = dateFilter(datePreset, since, until);
  const query = `
    SELECT
      campaign.name,
      ad_group.id, ad_group.name, ad_group.status,
      metrics.impressions, metrics.clicks, metrics.ctr,
      metrics.average_cpc, metrics.cost_micros,
      metrics.conversions, metrics.cost_per_conversion
    FROM ad_group
    WHERE ${df}
      AND ad_group.status != 'REMOVED'
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `.trim();
  return gaqlSearch({ creds, query });
}

// --------------------------------------------------------------------------
// Keywords — with quality score
// --------------------------------------------------------------------------
export async function getKeywords({ creds, datePreset, since, until }) {
  const df = dateFilter(datePreset, since, until);
  const query = `
    SELECT
      campaign.name,
      ad_group.id, ad_group.name,
      ad_group_criterion.criterion_id,
      ad_group_criterion.keyword.text,
      ad_group_criterion.keyword.match_type,
      ad_group_criterion.status,
      ad_group_criterion.quality_info.quality_score,
      ad_group_criterion.quality_info.creative_quality_score,
      ad_group_criterion.quality_info.post_click_quality_score,
      ad_group_criterion.quality_info.search_predicted_ctr,
      metrics.impressions, metrics.clicks, metrics.ctr,
      metrics.average_cpc, metrics.cost_micros,
      metrics.conversions, metrics.cost_per_conversion
    FROM keyword_view
    WHERE ${df}
      AND ad_group_criterion.status != 'REMOVED'
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 200
  `.trim();
  return gaqlSearch({ creds, query });
}

// --------------------------------------------------------------------------
// Search terms
// --------------------------------------------------------------------------
export async function getSearchTerms({ creds, datePreset, since, until }) {
  const df = dateFilter(datePreset, since, until);
  const query = `
    SELECT
      search_term_view.search_term,
      search_term_view.status,
      campaign.name, ad_group.name,
      metrics.impressions, metrics.clicks, metrics.ctr,
      metrics.average_cpc, metrics.cost_micros,
      metrics.conversions, metrics.cost_per_conversion
    FROM search_term_view
    WHERE ${df}
    ORDER BY metrics.cost_micros DESC
    LIMIT 500
  `.trim();
  return gaqlSearch({ creds, query });
}

// --------------------------------------------------------------------------
// Conversions — actions list + campaign-level conversion metrics
// --------------------------------------------------------------------------
export async function getConversions({ creds, datePreset, since, until }) {
  const df = dateFilter(datePreset, since, until);

  const actionsQuery = `
    SELECT
      conversion_action.id, conversion_action.name,
      conversion_action.type, conversion_action.status,
      conversion_action.category,
      conversion_action.include_in_conversions_metric,
      conversion_action.primary_for_goal
    FROM conversion_action
    WHERE conversion_action.status = 'ENABLED'
  `.trim();

  const metricsQuery = `
    SELECT
      campaign.name,
      metrics.conversions, metrics.conversions_value,
      metrics.cost_per_conversion, metrics.all_conversions
    FROM campaign
    WHERE ${df}
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.conversions DESC
  `.trim();

  const [actions, campaignMetrics] = await Promise.all([
    gaqlSearch({ creds, query: actionsQuery }),
    gaqlSearch({ creds, query: metricsQuery })
  ]);

  return { actions, campaignMetrics };
}

// --------------------------------------------------------------------------
// Ad strength (current state, no date filter)
// --------------------------------------------------------------------------
export async function getAdStrength({ creds }) {
  const query = `
    SELECT
      campaign.name, ad_group.name,
      ad_group_ad.ad.id, ad_group_ad.ad_strength,
      ad_group_ad.status
    FROM ad_group_ad
    WHERE ad_group_ad.status = 'ENABLED'
      AND campaign.status != 'REMOVED'
  `.trim();
  return gaqlSearch({ creds, query });
}

// --------------------------------------------------------------------------
// Single campaign — to retrieve budget resource name for mutate
// --------------------------------------------------------------------------
export async function getCampaignBudget({ creds, campaignId }) {
  const query = `
    SELECT campaign.id, campaign.name, campaign.campaign_budget
    FROM campaign
    WHERE campaign.id = ${campaignId}
  `.trim();
  const rows = await gaqlSearch({ creds, query });
  return rows[0] || null;
}
