// src/google/ads/mutate.mjs
// Campaign, budget, and keyword mutation operations.

import { gaqlMutate } from './client.mjs';
import { getCampaignBudget } from './insights.mjs';

// --------------------------------------------------------------------------
// Campaign status
// --------------------------------------------------------------------------
export async function pauseCampaign({ creds, campaignId }) {
  const resourceName = `customers/${creds.customer_id}/campaigns/${campaignId}`;
  return gaqlMutate({
    creds,
    resource: 'campaigns',
    operations: [{ update: { resourceName, status: 'PAUSED' }, updateMask: 'status' }]
  });
}

export async function enableCampaign({ creds, campaignId }) {
  const resourceName = `customers/${creds.customer_id}/campaigns/${campaignId}`;
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
  const resourceName = `customers/${creds.customer_id}/adGroups/${adGroupId}/criteria/${criterionId}`;
  return gaqlMutate({
    creds,
    resource: 'adGroupCriteria',
    operations: [{ update: { resourceName, status: 'PAUSED' }, updateMask: 'status' }]
  });
}
