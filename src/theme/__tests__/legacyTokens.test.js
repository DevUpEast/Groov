// Legacy-key ratchet (plan §2.1): reads of the legacy theme keys that colors.js keeps for
// old consumers (`theme.textMuted`, `theme.primary`, ...) may only fall, per file. New code
// reads role keys. Each screen ticket migrates its own file; Z-01a takes every count to 0
// and deletes the legacy keys.
//
// F-02 extended the scan: besides `theme.<key>` it counts `themes.dark.<key>`,
// `themes[name].<key>`, `colors.<key>`, bracket reads (`theme['primary']`) and destructuring
// (`const { primary } = theme`, `({ theme: { primary } })`), so a legacy read cannot hide
// behind another spelling.
//
// After lowering a count, refresh the baseline:  UPDATE_RATCHET=1 npx jest legacyTokens
const { scan, compare, legacyMatcher } = require('./ratchet');
const { LEGACY_KEYS } = require('../colors');

const countLegacy = legacyMatcher(LEGACY_KEYS);

describe('legacy theme key ratchet', () => {
  const counts = scan(countLegacy);

  it('adds no legacy key read', () => {
    const { grown } = compare(counts, 'legacy-baseline.json');
    expect(grown).toEqual([]);
  });

  it('has its baseline lowered when a count falls', () => {
    const { fallen } = compare(counts, 'legacy-baseline.json');
    if (fallen.length) throw new Error(`Counts fell; run UPDATE_RATCHET=1 npx jest legacyTokens and commit legacy-baseline.json:\n${fallen.join('\n')}`);
  });

  it('counts member reads on every theme spelling but not role keys', () => {
    const src = 'theme.textMuted theme?.primary scheme.danger theme.primaryLight theme.text theme.textSecondary theme.dangerText themes.dark.primary themes[name].onPrimary colors.warning mytheme.primary';
    expect(countLegacy(src)).toBe(7);
    expect(countLegacy('theme.action theme.onAction theme.selection theme.dangerText styles.primary')).toBe(0);
  });

  it('counts bracket reads', () => {
    expect(countLegacy(`theme['primary'] theme["textMuted"] theme['action']`)).toBe(2);
  });

  it('counts destructured legacy keys, renamed or not, and ignores role keys', () => {
    expect(countLegacy('const { primary, textMuted: muted, text } = theme;')).toBe(2);
    expect(countLegacy('const { primaryLight } = themes.dark;')).toBe(1);
    expect(countLegacy('const {\n  danger,\n  action,\n} = useApp().theme;')).toBe(1);
    expect(countLegacy('function Row({ theme: { primary, surface } }) {}')).toBe(1);
    expect(countLegacy('const { primary } = props; const { action, onAction } = theme;')).toBe(0);
  });
});
