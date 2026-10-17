// Per-ticket translation check (UI/UX plan §0, DoD 2).
//
//   node scripts/i18n-check.mjs [--base origin/master] [--verbose]
//
// Compares src/i18n/locales/*.json in the working tree with the same files at the base
// ref (`git show <base>:...`) and fails (exit 1) when a new or changed en key is missing
// in a locale, still English there, or, for a reworded en string, still has the
// translation it had at the base (stale). Plural keys need `one` and `other` in every
// locale, ja included. Allowlist: scripts/i18n-allowlist.json (values and per-locale keys);
// strings that are only placeholders, digits, punctuation or emoji always pass.
// The comparison itself is scripts/i18n-check-core.js (pure, Jest-tested).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import core from './i18n-check-core.js';
import { parseArgs } from './mockup-lib.mjs';

const { checkLocales } = core;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES_REL = 'src/i18n/locales';
const LOCALES = ['es', 'de', 'fr', 'pt-BR', 'ja'];

const { args } = parseArgs(process.argv.slice(2));
const base = args.base && args.base !== '1' ? args.base : 'origin/master';
const verbose = !!args.verbose;

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
try { execFileSync('git', ['rev-parse', '--verify', `${base}^{commit}`], { cwd: ROOT, stdio: 'ignore' }); }
catch { console.error(`i18n-check: unknown base ref '${base}' (git fetch?)`); process.exit(1); }
// A file missing at the base (a new locale) counts as empty: every key is new.
function atBase(code) {
  try { return JSON.parse(execFileSync('git', ['show', `${base}:${LOCALES_REL}/${code}.json`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); }
  catch { return {}; }
}

const result = checkLocales({
  baseEn: atBase('en'),
  en: readJson(path.join(ROOT, LOCALES_REL, 'en.json')),
  baseLocales: Object.fromEntries(LOCALES.map(c => [c, atBase(c)])),
  locales: Object.fromEntries(LOCALES.map(c => [c, readJson(path.join(ROOT, LOCALES_REL, `${c}.json`))])),
  allow: readJson(path.join(ROOT, 'scripts', 'i18n-allowlist.json')),
});

console.log(`i18n-check: base ${base}; ${result.changed.length} new or changed en key(s); ${result.pluralCount} plural key(s) checked in ${LOCALES.length + 1} locales`);
if (verbose || result.changed.length <= 40) result.changed.forEach(k => console.log(`  ${result.added.includes(k) ? '+' : '~'} ${k}`));
if (result.failures.length) {
  console.error(`i18n-check: FAIL (${result.failures.length})`);
  result.failures.forEach(f => console.error(`  ${f}`));
  process.exit(1);
}
console.log('i18n-check: PASS');
