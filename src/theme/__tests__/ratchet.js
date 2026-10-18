// Shared scanner for the colour ratchets (plan §2.1, §7.1): legacyTokens.test.js and
// noHexLiterals.test.js. Not a test file itself (no `.test.js` suffix).
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

function countIn(file, re) {
  const src = stripComments(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  return (src.match(re) || []).length;
}

function scan(re) {
  const counts = {};
  for (const f of sourceFiles()) {
    const n = countIn(f, re);
    if (n > 0) counts[f] = n;
  }
  return counts;
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

module.exports = { sourceFiles, stripComments, scan, compare, diffCounts, loweredBaseline, total, COLOR_LITERAL };
