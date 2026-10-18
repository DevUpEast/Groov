// Spacing and radius ratchet (F-08, plan §2.6, §7.1). Outside src/theme/, a padding*,
// margin*, gap or border*Radius value that is a number literal may only become rarer, per
// file: new code uses `space.<step>` (xxs 4 · xs 8 · sm 12 · md 16 · lg 24 · xl 32 · xxl 48),
// `space.gutter` (20, the one screen gutter) and `radius.<role>` (cell 4 · control 8 · card 16 ·
// sheet 24 · pill 999). A value derived from a token (`radius.cell + 2` for a concentric
// ring, `space.lg - space.xs`) is not a literal. 0 is not counted.
//
// The literal radius set may only shrink as well, and Z-01b takes it to a subset of the
// token values {4, 8, 16, 24, 999} (plan F-08 "radiusTokens"). The off-scale spacing
// literals that remain (2, 6, 10, 14, 20, ...) are left for the screen tickets to snap,
// since snapping them changes the layout.
//
// After lowering a count, refresh the baseline:  UPDATE_RATCHET=1 npx jest spacingTokens
const fs = require('fs');
const path = require('path');
const { scan, compare, sourceFiles, stripComments, LAYOUT_LITERAL, radiusValues } = require('./ratchet');

const ROOT = path.resolve(__dirname, '../../..');
const BASELINE = 'spacing-baseline.json';
const TOKEN_RADII = [4, 8, 16, 24, 999];

function literalRadii() {
  const set = new Set();
  for (const f of sourceFiles()) {
    for (const v of radiusValues(stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8')))) set.add(v);
  }
  return [...set].sort((a, b) => a - b);
}

describe('spacing and radius literal ratchet', () => {
  const counts = scan(LAYOUT_LITERAL);

  it('adds no spacing or radius literal outside src/theme/', () => {
    const { grown } = compare(counts, BASELINE);
    expect(grown).toEqual([]);
  });

  it('has its baseline lowered when a count falls (so it cannot creep back up)', () => {
    const { fallen } = compare(counts, BASELINE);
    if (fallen.length) throw new Error(`Counts fell; run UPDATE_RATCHET=1 npx jest spacingTokens and commit ${BASELINE}:\n${fallen.join('\n')}`);
  });

  // radius-baseline.json is the committed set of literal radii (today: the Android widget's).
  it('uses no literal radius outside the committed set (token values excepted)', () => {
    const allowed = JSON.parse(fs.readFileSync(path.join(__dirname, 'radius-baseline.json'), 'utf8'));
    const extra = literalRadii().filter(v => !allowed.includes(v) && !TOKEN_RADII.includes(v));
    expect(extra).toEqual([]);
  });

  it('has the committed radius set shrunk when a literal radius goes away', () => {
    const allowed = JSON.parse(fs.readFileSync(path.join(__dirname, 'radius-baseline.json'), 'utf8'));
    const used = literalRadii();
    const stale = allowed.filter(v => !used.includes(v));
    if (stale.length) throw new Error(`No longer used; remove from radius-baseline.json: ${stale.join(', ')}`);
  });

  it('counts literal spacing and radius values, not tokens, expressions on tokens, 0 or comments', () => {
    const src = stripComments([
      "const a = { padding: 12, marginTop: -4, gap: 6, borderTopLeftRadius: 10, paddingBottom: 8 + inset };",
      "const b = { padding: space.md, borderRadius: radius.cell + 2, margin: 0, marginLeft: space.lg - space.xs };",
      "// padding: 99, borderRadius: 7",
      "const c = { shadowRadius: 8, lineHeight: 20, hitSlop: { top: 10 } };",
    ].join('\n'));
    expect(src.match(LAYOUT_LITERAL)).toEqual(['padding: 12', 'marginTop: -4', 'gap: 6', 'borderTopLeftRadius: 10', 'paddingBottom: 8']);
    expect(radiusValues(src)).toEqual([10]);
  });
});
