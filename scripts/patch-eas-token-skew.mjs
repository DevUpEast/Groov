#!/usr/bin/env node
/**
 * Works around an EAS CLI / @expo/apple-utils issue: App Store Connect API tokens are
 * signed with a lifetime of exactly 1200 s, which is Apple's hard maximum. If the local
 * clock is even one second ahead of Apple's, Apple sees exp - now > 1200 and returns
 * "401 Authentication credentials are missing or invalid", and EAS falls back to an
 * Apple ID login. This patches the installed apple-utils bundle to sign 1140 s tokens.
 *
 * Idempotent. Re-run after `npm install -g eas-cli` (an update replaces the file).
 *   node scripts/patch-eas-token-skew.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

function globalNodeModules() {
  try { return execSync('npm root -g', { encoding: 'utf8' }).trim(); } catch { return null; }
}

const candidates = [];
const g = globalNodeModules();
if (g) candidates.push(path.join(g, 'eas-cli', 'node_modules', '@expo', 'apple-utils', 'build', 'index.js'));
if (g) candidates.push(path.join(g, '@expo', 'apple-utils', 'build', 'index.js'));
candidates.push(path.join(process.cwd(), 'node_modules', '@expo', 'apple-utils', 'build', 'index.js'));

const target = candidates.find((p) => fs.existsSync(p));
if (!target) {
  console.error('apple-utils not found. Looked in:\n  ' + candidates.join('\n  '));
  process.exit(1);
}

const src = fs.readFileSync(target, 'utf8');
const re = /(t\.Token=void 0;const s=a\(r\(\d+\)\),o=)(\d+);/;
const m = src.match(re);
if (!m) {
  console.error(`Could not find the Token duration constant in ${target}. apple-utils may have changed; inspect manually.`);
  process.exit(1);
}
if (m[2] === '1140') {
  console.log(`Already patched (${target})`);
  process.exit(0);
}
fs.copyFileSync(target, target + '.bak');
fs.writeFileSync(target, src.replace(re, `$11140;`));
console.log(`Patched token lifetime ${m[2]}s -> 1140s in ${target} (backup at .bak)`);
