// Pure comparison logic for scripts/i18n-check.mjs (CommonJS so Node and Jest both load it;
// tested in scripts/__tests__/i18nCheck.test.js).
//
// checkLocales({ baseEn, en, baseLocales, locales, allow }) -> { changed, added, failures }
//   baseEn / en           en.json trees at the base ref and in the working tree
//   baseLocales / locales { code: tree } for the non-en locales (base may lack a code or key)
//   allow                 { values: string[], keys: { code: keyPath[] } }
// Rules, for every en leaf that is new or whose value changed versus the base:
//   - each locale must have it (a plural form other than one/other may be absent);
//   - its value must not equal the new English value;
//   - for a changed key, its value must not be the one it had at the base (a stale
//     translation of the old English);
//   allowed: allow.values, allow.keys[code], and strings with nothing to translate
//   (placeholders, digits, punctuation, symbols, emoji).
// Plural keys (objects whose keys are all plural categories) need `one` and `other` in
// every locale, ja included, and the set of plural keys must match en's.
const PLURAL_FORMS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out); else out[key] = v;
  }
  return out;
}

function pluralGroups(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const key = prefix ? `${prefix}.${k}` : k;
    const ks = Object.keys(v);
    if (ks.length && ks.every(x => PLURAL_FORMS.has(x))) out[key] = v; else pluralGroups(v, key, out);
  }
  return out;
}

function nothingToTranslate(s) {
  return typeof s === 'string'
    && s.replace(/%\{[^}]+\}/g, '').replace(/[\p{N}\p{P}\p{S}\p{Z}\p{Extended_Pictographic}️‍]/gu, '') === '';
}

function checkLocales({ baseEn = {}, en, baseLocales = {}, locales, allow = {} }) {
  const allowValues = new Set(allow.values || []);
  const bEn = flatten(baseEn);
  const fEn = flatten(en);
  const codes = Object.keys(locales);
  const flat = Object.fromEntries(codes.map(c => [c, flatten(locales[c])]));
  const flatBase = Object.fromEntries(codes.map(c => [c, flatten(baseLocales[c])]));

  const changedKeys = Object.keys(fEn).filter(k => bEn[k] !== fEn[k]);
  const added = changedKeys.filter(k => bEn[k] === undefined);
  const failures = [];

  for (const key of changedKeys) {
    const reworded = bEn[key] !== undefined;
    for (const code of codes) {
      const v = flat[code][key];
      if (v === undefined) {
        const form = key.split('.').pop();
        if (PLURAL_FORMS.has(form) && form !== 'one' && form !== 'other') continue;
        failures.push(`${code}: missing ${key}`);
        continue;
      }
      const allowed = allowValues.has(v) || nothingToTranslate(v) || (allow.keys?.[code] || []).includes(key);
      if (allowed) continue;
      if (v === fEn[key]) { failures.push(`${code}: ${key} is still English ("${String(fEn[key]).slice(0, 60)}")`); continue; }
      if (reworded && flatBase[code][key] !== undefined && v === flatBase[code][key]) {
        failures.push(`${code}: ${key} not updated after en changed ("${String(bEn[key]).slice(0, 40)}" -> "${String(fEn[key]).slice(0, 40)}")`);
      }
    }
  }

  const enPlurals = pluralGroups(en);
  for (const [code, tree] of [['en', en], ...codes.map(c => [c, locales[c]])]) {
    const groups = pluralGroups(tree);
    for (const key of Object.keys(enPlurals)) {
      const g = groups[key];
      if (!g) { failures.push(`${code}: plural key ${key} is not a { one, other } object`); continue; }
      for (const form of ['one', 'other']) if (typeof g[form] !== 'string' || !g[form]) failures.push(`${code}: plural key ${key} lacks '${form}'`);
    }
    for (const key of Object.keys(groups)) if (!enPlurals[key]) failures.push(`${code}: plural key ${key} does not exist in en`);
  }

  return { changed: changedKeys, added, pluralCount: Object.keys(enPlurals).length, failures };
}

module.exports = { checkLocales, flatten, pluralGroups, nothingToTranslate, PLURAL_FORMS };
