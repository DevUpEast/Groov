// Shared scanner for the token ratchets (plan §2.1, §2.6, §7.1): legacyTokens.test.js,
// noHexLiterals.test.js and spacingTokens.test.js. Not a test file itself (no `.test.js` suffix).
//
// Scope: every .js/.jsx/.ts/.tsx file under src/ plus App.js, except src/theme/ (where tokens live) and
// __tests__ folders. Comments are stripped before counting, so issue numbers such as
// "(#173)" in a comment are not counted as 3-digit hex.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      walk(p, out);
    } else if (/\.(jsx?|tsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

function sourceFiles() {
  const files = walk(path.join(ROOT, 'src')).concat([path.join(ROOT, 'App.js')]);
  return files
    .map(f => path.relative(ROOT, f).split(path.sep).join('/'))
    .filter(f => !f.startsWith('src/theme/'))
    .sort();
}

// Removes /* */ and // comments; keeps strings intact (a `//` inside quotes, e.g. a URL, stays).
function stripComments(src) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') { out += n ?? ''; i += 2; continue; }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i += 1; continue; }
    if (c === '/' && n === '*') { const end = src.indexOf('*/', i + 2); i = end < 0 ? src.length : end + 2; continue; }
    if (c === '/' && n === '/') { const end = src.indexOf('\n', i); i = end < 0 ? src.length : end; continue; }
    out += c;
    i += 1;
  }
  return out;
}

const COLOR_LITERAL = /#(?:[0-9A-Fa-f]{8}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b|rgba?\(/g;

// `matcher` is a global RegExp (counts its matches) or a function (source -> count).
function countIn(file, matcher) {
  const src = stripComments(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  if (typeof matcher === 'function') return matcher(src);
  return (src.match(matcher) || []).length;
}

function scan(matcher) {
  const counts = {};
  for (const f of sourceFiles()) {
    const n = countIn(f, matcher);
    if (n > 0) counts[f] = n;
  }
  return counts;
}

// The names a theme object goes by in this codebase: `theme` (useApp, props), `scheme` (the
// crash screen), `colors`, and `themes.light` / `themes.dark` / `themes[...]` (direct imports).
const THEME_OBJECT = String.raw`(?:theme|scheme|colors|themes\.(?:light|dark)|themes\[[^\]\n]+\])`;

// Counts legacy theme key reads (F-02 extends F-01's `theme.<key>` scan):
// - member reads: `theme.primary`, `theme?.primary`, `themes.dark.primary`, `themes[name].primary`;
// - bracket reads: `theme['primary']`;
// - destructuring from a theme object: `const { primary, textMuted: muted } = theme`, and
//   destructured props / params: `({ theme: { primary } })`.
function legacyMatcher(keys) {
  const k = keys.join('|');
  const member = new RegExp(String.raw`\b${THEME_OBJECT}\??\.(?:${k})\b`, 'g');
  const bracket = new RegExp(String.raw`\b${THEME_OBJECT}\??\.?\[\s*['"\x60](?:${k})['"\x60]\s*\]`, 'g');
  const destructure = new RegExp(String.raw`\{([^{}]*)\}\s*=\s*(?:${THEME_OBJECT}|useApp\(\)\.theme)\b`, 'g');
  const nested = /\btheme\s*:\s*\{([^{}]*)\}/g;
  const keyRe = new RegExp(String.raw`(?:^|,)\s*(?:${k})\s*(?=[:,=]|$)`, 'g');
  const inBraces = (body) => (body.replace(/\s+/g, ' ').match(keyRe) || []).length;
  return (src) => {
    let n = (src.match(member) || []).length + (src.match(bracket) || []).length;
    for (const m of src.matchAll(destructure)) n += inBraces(m[1]);
    for (const m of src.matchAll(nested)) n += inBraces(m[1]);
    return n;
  };
}

// Spacing and radius literals (F-08, plan §2.6). For each padding*, margin*, gap / rowGap /
// columnGap or border*Radius property, the value expression (up to the next top-level `,`,
// `}`, `)` or line end) is split into its ternary branches (`cond ? a : b`; the condition is
// skipped). In a branch that names no token (`space.`, `radius.`, `size.`), every non-zero
// number literal counts, unless it scales (`* 0.18`, `/ 2`): `padding: 8 + inset`,
// `marginTop: -4`, `paddingBottom: ios ? 40 : 24` (2). A branch built on a token is derived
// and not counted (`space.lg - space.xs`, `radius.cell + 2`, `radius.cell / 2`).
// A value that is a module constant (`padding: CARD_PAD`) counts the constant's own number
// once per file (`const CARD_PAD = 20;`).
const LAYOUT_PROP = /\b((?:padding|margin)(?:Top|Bottom|Left|Right|Horizontal|Vertical|Start|End)?|gap|rowGap|columnGap|border(?:TopLeft|TopRight|BottomLeft|BottomRight|TopStart|TopEnd|BottomStart|BottomEnd)?Radius)\s*:\s*/g;
const TOKEN_REF = /\b(?:space|radius|size)\s*\.\s*[A-Za-z]/;
const NUMBER = /(^|[^\w.$])(\d+(?:\.\d+)?|\.\d+)(?![\w.])/g;

// The value expression that starts at `i`.
function valueAt(src, i) {
  let depth = 0;
  let quote = null;
  let j = i;
  for (; j < src.length; j++) {
    const c = src[j];
    if (quote) { if (c === '\\') j++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth--; }
    else if ((c === ',' || c === '\n' || c === ';') && depth === 0) break;
  }
  return src.slice(i, j);
}

// Top-level ternary branches of an expression (the condition dropped).
function branches(expr) {
  const parts = [];
  let depth = 0;
  let start = 0;
  let sawQ = false;
  for (let k = 0; k < expr.length; k++) {
    const c = expr[k];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (depth === 0 && (c === '?' || c === ':') && expr[k + 1] !== '?' && expr[k + 1] !== '.' && expr[k - 1] !== '?') {
      if (c === '?') sawQ = true; else if (!sawQ) continue;
      parts.push({ text: expr.slice(start, k), cond: c === '?' });
      start = k + 1;
    }
  }
  parts.push({ text: expr.slice(start), cond: false });
  return parts.filter(p => !p.cond).map(p => p.text);
}

// The literal numbers of one value expression.
function literalsIn(expr) {
  const out = [];
  for (const b of branches(expr)) {
    if (TOKEN_REF.test(b)) continue;
    for (const m of b.matchAll(NUMBER)) {
      const before = b.slice(0, m.index + m[1].length).trimEnd();
      if (/[*/]$/.test(before)) continue;
      if (/^[*/]/.test(b.slice(m.index + m[0].length).trimStart())) continue;
      const v = Number(m[2]);
      if (v !== 0) out.push(v);
    }
  }
  return out;
}

// [{ prop, value }] for every literal spacing or radius number in a source (comments
// stripped by the caller), module constants included.
function layoutLiterals(src) {
  const out = [];
  const consts = new Set();
  for (const m of src.matchAll(LAYOUT_PROP)) {
    const expr = valueAt(src, m.index + m[0].length);
    for (const v of literalsIn(expr)) out.push({ prop: m[1], value: v });
    const id = expr.trim().match(/^-?([A-Z][A-Z0-9_]*)$/);
    if (id) consts.add(`${m[1].endsWith('Radius') ? 'r' : 's'}:${id[1]}`);
  }
  for (const key of consts) {
    const [kind, name] = key.split(':');
    const def = src.match(new RegExp(String.raw`\bconst\s+${name}\s*=\s*(\d+(?:\.\d+)?)\s*;`));
    if (def && Number(def[1]) !== 0) out.push({ prop: kind === 'r' ? 'borderRadius' : 'padding', value: Number(def[1]) });
  }
  return out;
}

const countLayoutLiterals = (src) => layoutLiterals(src).length;

// The literal borderRadius values in a source (comments stripped by the caller).
function radiusValues(src) {
  return layoutLiterals(src).filter(l => l.prop.endsWith('Radius')).map(l => l.value);
}

// Lines `file: was -> now` for every file whose count rose (grown) or fell (fallen).
// A file not in the baseline has a baseline of 0.
function diffCounts(counts, baseline) {
  const grown = [];
  const fallen = [];
  for (const f of [...new Set([...Object.keys(baseline), ...Object.keys(counts)])].sort()) {
    const was = baseline[f] || 0;
    const now = counts[f] || 0;
    if (now > was) grown.push(`${f}: ${was} -> ${now}`);
    else if (now < was) fallen.push(`${f}: ${was} -> ${now}`);
  }
  return { grown, fallen };
}

// The baseline an update may write: only lowered counts are taken, so it can never rise.
// Returns null (write nothing) when any count grew.
function loweredBaseline(counts, baseline) {
  const { grown } = diffCounts(counts, baseline);
  if (grown.length) return null;
  const next = {};
  for (const f of Object.keys(counts).sort()) next[f] = counts[f];
  return next;
}

// Compares counts with the committed baseline and returns { grown, fallen }. With
// UPDATE_RATCHET=1 it rewrites the baseline after a count fell, but refuses (and prints
// the files that grew) when any count rose: the update command can only lower it.
function compare(counts, baselineFile) {
  const file = path.join(__dirname, baselineFile);
  const baseline = JSON.parse(fs.readFileSync(file, 'utf8'));
  const result = diffCounts(counts, baseline);
  if (process.env.UPDATE_RATCHET === '1' && result.fallen.length) {
    const next = loweredBaseline(counts, baseline);
    if (next) {
      fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
      return { grown: [], fallen: [] };
    }
    console.error(`UPDATE_RATCHET refused to rewrite ${baselineFile}; these counts grew:\n${result.grown.join('\n')}`);
  }
  return result;
}

const total = (counts) => Object.values(counts).reduce((a, b) => a + b, 0);

module.exports = { sourceFiles, stripComments, scan, compare, diffCounts, loweredBaseline, total, COLOR_LITERAL, legacyMatcher, layoutLiterals, countLayoutLiterals, radiusValues };
