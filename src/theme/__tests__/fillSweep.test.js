// F-02 source checks (acceptance a): no fill reads the legacy `primary` / `primaryLight` keys,
// no white label literal sits in a file that draws action fills, and every Switch takes its
// colours from switchColors (ink thumb on the dark #818CF8 track).
const fs = require('fs');
const path = require('path');
const { sourceFiles, stripComments } = require('./ratchet');

const ROOT = path.resolve(__dirname, '../../..');
const read = (f) => stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));

describe('fill sweep (F-02)', () => {
  const files = sourceFiles().map(f => [f, read(f)]);

  it('has no theme.primary or theme.primaryLight in a backgroundColor expression', () => {
    const bad = [];
    for (const [f, src] of files) {
      for (const m of src.matchAll(/backgroundColor:[^,}\n]*\btheme\??\.(?:primary|primaryLight)\b/g)) bad.push(`${f}: ${m[0]}`);
    }
    expect(bad).toEqual([]);
  });

  it('has no white label literal in any file that draws an action fill', () => {
    const bad = [];
    for (const [f, src] of files) {
      if (!/backgroundColor:[^,}\n]*\btheme\.action\b/.test(src)) continue;
      const m = src.match(/['"]#(?:fff|FFF|ffffff|FFFFFF)['"]/g);
      if (m) bad.push(`${f}: ${m.length}`);
    }
    expect(bad).toEqual([]);
  });

  it('gives every Settings Switch the switchColors pair', () => {
    const src = read('src/screens/SettingsScreen.js');
    const switches = src.match(/<Switch\b[\s\S]*?\/>/g) || [];
    expect(switches.length).toBeGreaterThan(0);
    for (const s of switches) expect(s).toMatch(/\{\.\.\.switchColors\(theme, /);
  });
});
