// The 12 pt floor (plan §2.7, F-03, TYP-1): no text below `caption` (12) anywhere in the app.
// Scans every source file under src/ (including src/theme/) plus App.js for a literal
// fontSize below 12, in style objects (`fontSize: 11`) and props (`fontSize={10}`).
const fs = require('fs');
const path = require('path');
const { stripComments } = require('./ratchet');
const { type, TYPE_FLOOR } = require('../typography');

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

const FONT_SIZE = /fontSize\s*(?::|=\s*\{)\s*(\d+(?:\.\d+)?)/g;

function belowFloor(src) {
  const hits = [];
  for (const m of stripComments(src).matchAll(FONT_SIZE)) {
    if (Number(m[1]) < TYPE_FLOOR) hits.push(m[0]);
  }
  return hits;
}

describe('12 pt type floor', () => {
  it('is 12', () => {
    expect(TYPE_FLOOR).toBe(12);
  });

  it('has no literal fontSize below 12 in src/ or App.js', () => {
    const files = walk(path.join(ROOT, 'src')).concat([path.join(ROOT, 'App.js')]);
    const offenders = [];
    for (const f of files) {
      const hits = belowFloor(fs.readFileSync(f, 'utf8'));
      if (hits.length) offenders.push(`${path.relative(ROOT, f)}: ${hits.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('keeps every type token at or above the floor', () => {
    for (const [name, v] of Object.entries(type)) {
      expect([name, v.fontSize >= TYPE_FLOOR]).toEqual([name, true]);
    }
  });

  it('catches style and prop forms, ignoring comments', () => {
    expect(belowFloor("const s = { fontSize: 11 }; <T fontSize={9} /> // fontSize: 10\n{ fontSize: 12 } { fontSize: 110 }"))
      .toEqual(['fontSize: 11', 'fontSize={9']);
  });
});
