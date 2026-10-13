#!/usr/bin/env node
/**
 * Configures Sign in with Apple and Google on the linked Supabase project via the
 * Management API, so nobody has to click through the dashboard.
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_ACCESS_TOKEN = "sbp_..."        # Dashboard > Account > Access Tokens
 *   $env:GOOGLE_CLIENT_ID     = "....apps.googleusercontent.com"
 *   $env:GOOGLE_CLIENT_SECRET = "GOCSPX-..."
 *   node scripts/supabase-auth-providers.mjs
 *
 * Optional:
 *   $env:SUPABASE_PROJECT_REF   override the ref read from supabase/.temp/linked-project.json
 *   $env:EXTRA_REDIRECT_URLS    comma-separated extra redirect URLs (e.g. an exp:// dev URL)
 *   DRY_RUN=1                   print the payload without sending it
 *
 * Apple: the native iOS flow (signInWithIdToken) only needs the app's bundle ID in the
 * provider's authorized client IDs. No Services ID or .p8 key is required unless the
 * Apple web/Android flow is added later.
 * Google: uses one "Web application" OAuth client. Its authorized redirect URI must be
 *   https://<ref>.supabase.co/auth/v1/callback
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

const appJson = readJson(path.join(root, 'app.json')).expo;
const bundleId = appJson.ios?.bundleIdentifier;
const scheme = appJson.scheme;
let ref = process.env.SUPABASE_PROJECT_REF;
if (!ref) {
  const linked = path.join(root, 'supabase', '.temp', 'linked-project.json');
  if (fs.existsSync(linked)) ref = readJson(linked).ref;
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
const googleId = process.env.GOOGLE_CLIENT_ID;
const googleSecret = process.env.GOOGLE_CLIENT_SECRET;

const missing = [];
if (!token) missing.push('SUPABASE_ACCESS_TOKEN');
if (!ref) missing.push('SUPABASE_PROJECT_REF (or run `supabase link`)');
if (!bundleId) missing.push('expo.ios.bundleIdentifier in app.json');
if (missing.length) {
  console.error('Missing: ' + missing.join(', '));
  process.exit(1);
}

const api = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

// Redirect URLs the OAuth browser flow may return to.
const redirects = new Set([
  `${scheme}://auth/callback`,
  `${scheme}://*`,
  'http://localhost:8081/**',   // expo web dev server
  'http://localhost:19006/**',
  'exp://*/**',                 // Expo Go deep links (any LAN host)
]);
for (const u of (process.env.EXTRA_REDIRECT_URLS || '').split(',').map(s => s.trim()).filter(Boolean)) redirects.add(u);

const current = await fetch(api, { headers }).then(async r => {
  if (!r.ok) throw new Error(`GET config failed ${r.status}: ${await r.text()}`);
  return r.json();
});

const existingAllow = (current.uri_allow_list || '').split(',').map(s => s.trim()).filter(Boolean);
for (const u of existingAllow) redirects.add(u);

const appleClientIds = new Set((current.external_apple_client_id || '').split(',').map(s => s.trim()).filter(Boolean));
appleClientIds.add(bundleId);

const payload = {
  external_apple_enabled: true,
  external_apple_client_id: [...appleClientIds].join(','),
  uri_allow_list: [...redirects].join(','),
};
if (googleId && googleSecret) {
  payload.external_google_enabled = true;
  payload.external_google_client_id = googleId;
  payload.external_google_secret = googleSecret;
} else {
  console.warn('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set: leaving the Google provider unchanged.');
}

console.log('Project:', ref);
console.log('Payload:', JSON.stringify({ ...payload, external_google_secret: payload.external_google_secret ? '***' : undefined }, null, 2));

if (process.env.DRY_RUN) process.exit(0);

const res = await fetch(api, { method: 'PATCH', headers, body: JSON.stringify(payload) });
if (!res.ok) {
  console.error(`PATCH failed ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const updated = await res.json();
console.log('Done. apple_enabled =', updated.external_apple_enabled, '| google_enabled =', updated.external_google_enabled);
console.log('Allow list:', updated.uri_allow_list);
