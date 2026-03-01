// src/google/ads/mutate.mjs
// Campaign, budget, and keyword mutation operations.

import { gaqlMutate } from './client.mjs';
import { getCampaignBudget } from './insights.mjs';

// --------------------------------------------------------------------------
// ID validation — prevents invalid GAQL from NaN or non-integer inputs
// --------------------------------------------------------------------------
function requireIntId(value, name) {
  const s = String(value ?? '').trim();
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n <= 0 || String(n) !== s) {
    throw new Error(`${name} must be a positive integer, got: ${JSON.stringify(value)}`);
  }
  return s;
}

// --------------------------------------------------------------------------
// Campaign status
// --------------------------------------------------------------------------
export async function pauseCampaign({ creds, campaignId }) {
  const id = requireIntId(campaignId, 'campaignId');
  const resourceName = `customers/${creds.customer_id}/campaigns/${id}`;
  return gaqlMutate({
    creds,
    resource: 'campaigns',
    operations: [{ update: { resourceName, status: 'PAUSED' }, updateMask: 'status' }]
  });
}

export async function enableCampaign({ creds, campaignId }) {
  const id = requireIntId(campaignId, 'campaignId');
  const resourceName = `customers/${creds.customer_id}/campaigns/${id}`;
  return gaqlMutate({
    creds,
    resource: 'campaigns',
    operations: [{ update: { resourceName, status: 'ENABLED' }, updateMask: 'status' }]
  });
}

// --------------------------------------------------------------------------
// Campaign budget
// Fetches the campaign's budget resource name, then updates amountMicros.
// dailyBudgetAmount is in the account currency (e.g. 500 = $500 MXN/day).
// --------------------------------------------------------------------------
export async function setCampaignBudget({ creds, campaignId, dailyBudgetAmount }) {
  requireIntId(campaignId, 'campaignId');
  const campaignRow = await getCampaignBudget({ creds, campaignId });
  if (!campaignRow) throw new Error(`Campaign ${campaignId} not found`);

  const budgetResourceName = campaignRow.campaign?.campaignBudget;
  if (!budgetResourceName) throw new Error(`Campaign ${campaignId} has no linked budget resource`);

  const amountMicros = String(Math.round(dailyBudgetAmount * 1_000_000));
  return gaqlMutate({
    creds,
    resource: 'campaignBudgets',
    operations: [{
      update: { resourceName: budgetResourceName, amountMicros },
      updateMask: 'amountMicros'
    }]
  });
}

// --------------------------------------------------------------------------
// Keyword (ad group criterion) — pause only
// Use keywords.insights to get adGroupId + criterionId
// --------------------------------------------------------------------------
export async function pauseKeyword({ creds, adGroupId, criterionId }) {
  const gid = requireIntId(adGroupId, 'adGroupId');
  const cid = requireIntId(criterionId, 'criterionId');
  // Google Ads resource name uses tilde composite key: {adGroupId}~{criterionId}
  const resourceName = `customers/${creds.customer_id}/adGroupCriteria/${gid}~${cid}`;
  return gaqlMutate({
    creds,
    resource: 'adGroupCriteria',
    operations: [{ update: { resourceName, status: 'PAUSED' }, updateMask: 'status' }]
  });
}
