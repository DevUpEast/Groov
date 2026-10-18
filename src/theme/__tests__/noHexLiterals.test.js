// Literal ratchet (plan §0 DoD 6, §7.1): hex (#RGB, #RRGGBB, #RRGGBBAA) and rgb()/rgba()
// colour literals outside src/theme/ may only fall. Colours come from tokens instead
// (theme.<role>, or src/theme/tokens.js for non-React code). Z-01a takes the count to 0.
//
// After lowering a count, refresh the baseline:  UPDATE_RATCHET=1 npx jest noHexLiterals
const { scan, compare, stripComments, COLOR_LITERAL } = require('./ratchet');

describe('colour literal ratchet', () => {
  const counts = scan(COLOR_LITERAL);

  it('adds no colour literal outside src/theme/', () => {
    const { grown } = compare(counts, 'hex-baseline.json');
    expect(grown).toEqual([]);
  });

  it('has its baseline lowered when a count falls (so it cannot creep back up)', () => {
    const { fallen } = compare(counts, 'hex-baseline.json');
    if (fallen.length) throw new Error(`Counts fell; run UPDATE_RATCHET=1 npx jest noHexLiterals and commit hex-baseline.json:\n${fallen.join('\n')}`);
  });

  it('counts 3, 6 and 8-digit hex and rgb()/rgba(), ignoring comments', () => {
    const src = stripComments(`const a = '#fff'; const b = "#0F172A"; // '#123456' (#173)\n/* rgba(0,0,0,1) */ const c = 'rgba(0,0,0,0.5)'; const d = '#00000080'; const u = 'https://x.y/#abc';`);
    expect(src.match(COLOR_LITERAL)).toEqual(['#fff', '#0F172A', 'rgba(', '#00000080', '#abc']);
  });
});
