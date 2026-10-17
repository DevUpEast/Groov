// Per-ticket translation check (UI/UX plan §0, DoD 2).
//
//   node scripts/i18n-check.mjs [--base origin/master] [--verbose]
//
// 1. Lists the keys of src/i18n/locales/en.json that are new or changed versus the base
//    ref (working tree vs `git show <base>:src/i18n/locales/en.json`).
// 2. Fails if, for any of them, a non-en locale is missing the key or has the English
//    value unchanged. Allowed: scripts/i18n-allowlist.json (brand names, Groov, Pro, OK,
//    per-locale key exceptions) and strings that are only placeholders, digits, punctuation
//    or emoji.
// 3. Fails if any plural key (an object with `one` / `other`) lacks `one` or `other` in
//    any locale, ja included, or if a locale's plural key set differs from en's.
// Exit code 0 = pass, 1 = fail.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES_DIR = path.join(ROOT, 'src', 'i18n', 'locales');
const LOCALES = ['es', 'de', 'fr', 'pt-BR', 'ja'];
const PLURAL_FORMS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '1') : def; };
const base = opt('base', 'origin/master');
const verbose = !!opt('verbose', '');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const allow = readJson(path.join(ROOT, 'scripts', 'i18n-allowlist.json'));
const allowValues = new Set(allow.values || []);

// Flatten to dotted leaf paths: { a: { b: 'x' } } -> { 'a.b': 'x' }.
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out); else out[key] = v;
  }
  return out;
}
// Plural groups: objects whose keys are all plural categories and include one/other.
function pluralGroups(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const key = prefix ? `${prefix}.${k}` : k;
    const ks = Object.keys(v);
    if (ks.length && ks.every(x => PLURAL_FORMS.has(x))) out[key] = v; else pluralGroups(v, key, out);
  }
  return out;
}

let baseEnRaw = null;
try {
  baseEnRaw = execFileSync('git', ['show', `${base}:src/i18n/locales/en.json`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  try { execFileSync('git', ['rev-parse', '--verify', base], { cwd: ROOT, stdio: 'ignore' }); }
  catch { console.error(`i18n-check: unknown base ref '${base}' (git fetch?)`); process.exit(1); }
  // The ref exists but has no en.json: every key is new.
}
const baseEn = baseEnRaw ? flatten(JSON.parse(baseEnRaw)) : {};
const enTree = readJson(path.join(LOCALES_DIR, 'en.json'));
const en = flatten(enTree);
const locales = Object.fromEntries(LOCALES.map(c => [c, readJson(path.join(LOCALES_DIR, `${c}.json`))]));
const flat = Object.fromEntries(LOCALES.map(c => [c, flatten(locales[c])]));

const changed = Object.keys(en).filter(k => baseEn[k] !== en[k]);
const failures = [];

// Placeholders, digits, punctuation, symbols and emoji only: nothing to translate.
const nothingToTranslate = (s) => typeof s === 'string' && s.replace(/%\{[^}]+\}/g, '').replace(/[\p{N}\p{P}\p{S}\p{Z}\p{Extended_Pictographic}️‍]/gu, '') === '';

for (const key of changed) {
  for (const code of LOCALES) {
    const v = flat[code][key];
    if (v === undefined) {
      // A plural form other than one/other may legitimately be absent (e.g. no `zero`).
      const form = key.split('.').pop();
      if (PLURAL_FORMS.has(form) && form !== 'one' && form !== 'other') continue;
      failures.push(`${code}: missing ${key}`);
      continue;
    }
    if (v !== en[key]) continue;
    if (allowValues.has(v) || nothingToTranslate(v) || (allow.keys?.[code] || []).includes(key)) continue;
    failures.push(`${code}: ${key} is still English ("${String(en[key]).slice(0, 60)}")`);
  }
}

// Plural structure, across every locale and every plural key (not only changed ones).
const enPlurals = pluralGroups(enTree);
for (const [code, tree] of [['en', enTree], ...LOCALES.map(c => [c, locales[c]])]) {
  const groups = pluralGroups(tree);
  for (const key of Object.keys(enPlurals)) {
    const g = groups[key];
    if (!g) { failures.push(`${code}: plural key ${key} is not a { one, other } object`); continue; }
    for (const form of ['one', 'other']) if (typeof g[form] !== 'string' || !g[form]) failures.push(`${code}: plural key ${key} lacks '${form}'`);
  }
  for (const key of Object.keys(groups)) if (!enPlurals[key]) failures.push(`${code}: plural key ${key} does not exist in en`);
}

console.log(`i18n-check: base ${base}; ${changed.length} new or changed en key(s); ${Object.keys(enPlurals).length} plural key(s) checked in ${LOCALES.length + 1} locales`);
if (verbose || changed.length <= 40) changed.forEach(k => console.log(`  ${baseEn[k] === undefined ? '+' : '~'} ${k}`));
if (failures.length) {
  console.error(`i18n-check: FAIL (${failures.length})`);
  failures.forEach(f => console.error(`  ${f}`));
  process.exit(1);
}
console.log('i18n-check: PASS');
