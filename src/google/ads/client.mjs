// src/google/ads/client.mjs
// Google Ads REST API client — OAuth2 token refresh + search + mutate with retry/backoff.

import { sleep } from '../../core/util/sleep.mjs';

// --------------------------------------------------------------------------
// In-process token cache
// --------------------------------------------------------------------------
let _token = null;
let _tokenExpiry = 0;

async function refreshAccessToken(creds) {
  if (_token && Date.now() < _tokenExpiry - 30_000) return _token;

  const body = new URLSearchParams({
    client_id: creds.client_id,
    client_secret: creds.client_secret,
    refresh_token: creds.refresh_token,
    grant_type: 'refresh_token'
  });

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    // Retry only on transient server errors — not on 4xx (bad credentials = permanent)
    if (res.status >= 500 && attempt < maxRetries) {
      const wait = Math.min(1000 * 2 ** (attempt - 1), 30_000);
      console.error(`OAuth token refresh ${res.status}, retry ${attempt}/${maxRetries} in ${wait}ms…`);
      await sleep(wait);
      continue;
    }

    const text = await res.text();
    if (!res.ok) throw new Error(`OAuth token refresh failed ${res.status}: ${text.slice(0, 400)}`);

    const data = JSON.parse(text);
    _token = data.access_token;
    _tokenExpiry = Date.now() + data.expires_in * 1000;
    return _token;
  }
  throw new Error('OAuth token refresh: exhausted retries');
}

// --------------------------------------------------------------------------
// Base POST with retry/backoff
// --------------------------------------------------------------------------
async function apiPost({ creds, path, body, maxRetries = 3 }) {
  const token = await refreshAccessToken(creds);
  const url = `https://googleads.googleapis.com/${creds.api_version}${path}`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'developer-token': creds.developer_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      const wait = Math.min(1000 * 2 ** (attempt - 1), 30_000);
      console.error(`Google Ads API ${res.status}, retry ${attempt}/${maxRetries} in ${wait}ms…`);
      await sleep(wait);
      continue;
    }

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Google Ads API HTTP ${res.status}: ${text.slice(0, 1000)}`);
    }
    return JSON.parse(text);
  }
  throw new Error(`Google Ads API: exhausted ${maxRetries} retries`);
}

// --------------------------------------------------------------------------
// GAQL search with automatic pagination
// --------------------------------------------------------------------------
export async function gaqlSearch({ creds, query }) {
  const rows = [];
  let pageToken = null;

  do {
    const body = { query, pageSize: 1000 };
    if (pageToken) body.pageToken = pageToken;

    const data = await apiPost({
      creds,
      path: `/customers/${creds.customer_id}/googleAds:search`,
      body
    });

    if (Array.isArray(data.results)) rows.push(...data.results);
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return rows;
}

// --------------------------------------------------------------------------
// Mutate (campaigns, campaignBudgets, adGroupCriteria, etc.)
// --------------------------------------------------------------------------
export async function gaqlMutate({ creds, resource, operations }) {
  return apiPost({
    creds,
    path: `/customers/${creds.customer_id}/${resource}:mutate`,
    body: { operations }
  });
}
