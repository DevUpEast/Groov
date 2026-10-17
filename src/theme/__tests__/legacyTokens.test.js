// Legacy-key ratchet (plan §2.1): reads of the legacy theme keys that colors.js keeps for
// old consumers (`theme.textMuted`, `theme.primary`, ...) may only fall, per file. New code
// reads role keys. Each screen ticket migrates its own file; Z-01a takes every count to 0
// and deletes the legacy keys.
//
// After lowering a count, refresh the baseline:  UPDATE_RATCHET=1 npx jest legacyTokens
const { scan, compare, total } = require('./ratchet');
const { LEGACY_KEYS } = require('../colors');
const baseline = require('./legacy-baseline.json');

const LEGACY_READ = new RegExp(String.raw`\b(?:theme|scheme)\??\.(?:${LEGACY_KEYS.join('|')})\b`, 'g');

describe('legacy theme key ratchet', () => {
  const counts = scan(LEGACY_READ);

  it('adds no legacy key read', () => {
    const { grown } = compare(counts, 'legacy-baseline.json');
    expect(grown).toEqual([]);
  });

  it('has its baseline lowered when a count falls', () => {
    const { fallen } = compare(counts, 'legacy-baseline.json');
    if (fallen.length) throw new Error(`Counts fell; run UPDATE_RATCHET=1 npx jest legacyTokens and commit legacy-baseline.json:\n${fallen.join('\n')}`);
    expect(total(counts)).toBe(total(baseline));
  });

  it('matches theme.<legacy> and theme?.<legacy> reads but not role keys', () => {
    const src = 'theme.textMuted theme?.primary scheme.danger theme.primaryLight theme.text theme.textSecondary theme.dangerText';
    expect(src.match(LEGACY_READ)).toEqual(['theme.textMuted', 'theme?.primary', 'scheme.danger', 'theme.primaryLight']);
  });
});
