// Spacing and radius ratchet (F-08, plan §2.6, §7.1). Outside src/theme/, a padding*,
// margin*, gap or border*Radius value that is a number literal may only become rarer, per
// file: new code uses `space.<step>` (xxs 4 · xs 8 · sm 12 · md 16 · lg 24 · xl 32 · xxl 48),
// `space.gutter` (20, the one screen gutter) and `radius.<role>` (cell 4 · control 8 · card 16 ·
// sheet 24 · pill 999). Every ternary branch counts (`ios ? 40 : 24` is 2), and so does a module
// constant used as the whole value (`padding: CARD_PAD` with `const CARD_PAD = 20`). A value
// derived from a token (`radius.cell + 2` for a concentric ring, `radius.cell / 2`,
// `space.lg - space.xs`), a scale factor (`size * 0.18`, `D / 2`) and 0 are not counted.
//
// radius-baseline.json lists, per file, the non-token radii it may still use; Z-01b takes
// every file to the token values {4, 8, 16, 24, 999} (plan F-08 "radiusTokens"). The off-scale
// spacing literals that remain (2, 6, 10, 14, 20, ...) are left for the screen tickets to
// snap, since snapping them changes the layout.
//
// After lowering a count, refresh the baseline:  UPDATE_RATCHET=1 npx jest spacingTokens
const fs = require('fs');
const path = require('path');
const { scan, compare, sourceFiles, stripComments, countLayoutLiterals, layoutLiterals, radiusValues } = require('./ratchet');

const ROOT = path.resolve(__dirname, '../../..');
const BASELINE = 'spacing-baseline.json';
const TOKEN_RADII = [4, 8, 16, 24, 999];
// { file: [radius, ...] }: the literal radii a file may still use (today only the Android
// widget's 10/11/20, whose renderer may not clamp 999 on a 22 dp circle).
const allowedRadii = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'radius-baseline.json'), 'utf8'));

function literalRadiiByFile() {
  const out = {};
  for (const f of sourceFiles()) {
    const vals = [...new Set(radiusValues(stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'))))].sort((a, b) => a - b);
    if (vals.length) out[f] = vals;
  }
  return out;
}

describe('spacing and radius literal ratchet', () => {
  const counts = scan(countLayoutLiterals);

  it('adds no spacing or radius literal outside src/theme/', () => {
    const { grown } = compare(counts, BASELINE);
    expect(grown).toEqual([]);
  });

  it('has its baseline lowered when a count falls (so it cannot creep back up)', () => {
    const { fallen } = compare(counts, BASELINE);
    if (fallen.length) throw new Error(`Counts fell; run UPDATE_RATCHET=1 npx jest spacingTokens and commit ${BASELINE}:\n${fallen.join('\n')}`);
  });

  it('uses a non-token literal radius only in the file radius-baseline.json allows it in', () => {
    const allowed = allowedRadii();
    const extra = [];
    for (const [f, vals] of Object.entries(literalRadiiByFile())) {
      for (const v of vals) if (!TOKEN_RADII.includes(v) && !(allowed[f] || []).includes(v)) extra.push(`${f}: ${v}`);
    }
    expect(extra).toEqual([]);
  });

  it('has radius-baseline.json shrunk when an allowed radius goes away', () => {
    const used = literalRadiiByFile();
    const stale = [];
    for (const [f, vals] of Object.entries(allowedRadii())) for (const v of vals) if (!(used[f] || []).includes(v)) stale.push(`${f}: ${v}`);
    if (stale.length) throw new Error(`No longer used; remove from radius-baseline.json:\n${stale.join('\n')}`);
  });

  it('counts literal numbers in every branch, not tokens, derived values, scale factors, 0 or comments', () => {
    const src = stripComments([
      "const a = { padding: 12, marginTop: -4, gap: 6, borderTopLeftRadius: 10, paddingBottom: 8 + inset.bottom };",
      "const b = { padding: space.md, borderRadius: radius.cell + 2, margin: 0, marginLeft: space.lg - space.xs, borderRadius: radius.cell / 2 };",
      "const c = { paddingBottom: Platform.OS === 'ios' ? 40 : 24, paddingTop: n > 3 ? space.lg : 18, borderRadius: Math.max(3, size * 0.18) };",
      "const d = { borderRadius: CIRCLE_D / 2, padding: CARD_PAD, shadowRadius: 8, lineHeight: 20, hitSlop: { top: 10 } };",
      "const CARD_PAD = 20;",
      "// padding: 99, borderRadius: 7",
    ].join('\n'));
    expect(layoutLiterals(src).map(l => l.value)).toEqual([12, 4, 6, 10, 8, 40, 24, 18, 3, 20]);
    expect(radiusValues(src)).toEqual([10, 3]);
  });
});
