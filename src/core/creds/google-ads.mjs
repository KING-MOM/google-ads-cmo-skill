// src/core/creds/google-ads.mjs

import fs from 'node:fs';
import path from 'node:path';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function loadGoogleAdsCreds({ homeDir = process.env.HOME || '' } = {}) {
  const p = path.join(homeDir, '.openclaw', 'credentials', 'google_ads.json');
  if (!fs.existsSync(p)) {
    throw new Error(
      `Missing credentials: ${p}\n` +
      `Create it with:\n` +
      `{"developer_token":"...","client_id":"...","client_secret":"...","refresh_token":"...","customer_id":"..."}`
    );
  }
  const j = readJson(p);
  for (const k of ['developer_token', 'client_id', 'client_secret', 'refresh_token', 'customer_id']) {
    if (!j[k]) throw new Error(`google_ads.json missing ${k}`);
  }
  return {
    developer_token: j.developer_token,
    client_id: j.client_id,
    client_secret: j.client_secret,
    refresh_token: j.refresh_token,
    customer_id: String(j.customer_id).replace(/-/g, ''),
    api_version: j.api_version || 'v19'
  };
}

export function hasGoogleAdsCreds({ homeDir = process.env.HOME || '' } = {}) {
  const p = path.join(homeDir, '.openclaw', 'credentials', 'google_ads.json');
  return fs.existsSync(p);
}
