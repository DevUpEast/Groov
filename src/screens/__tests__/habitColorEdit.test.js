// C-01 storage rule (plan §2.3, Critic A item 5): the habit form shows a stored colour as the
// accent it resolves to, but writes only on an explicit pick, and a pick stores 6-digit hex.
import fs from 'fs';
import path from 'path';
import { BLANK_FORM, formFromHabit, habitFromForm, pickAccent, selectedAccentId, suggestedColor } from '../../utils/habitForm';
import { ACCENT_IDS, LEGACY_ACCENT_MAP } from '../../theme/accents';

const legacyHabit = {
  id: 'h1', name: 'Stretch', icon: '🤸', type: 'daily', volumeGoal: 1, color: '#EAB308',
  schedule: { type: 'daily' }, timeOfDay: 'morning', unit: null, intention: null, customIconUri: null,
};

describe('habit form colour (C-01)', () => {
  it('(b) editing only the name of a legacy-colour habit keeps the stored hex', () => {
    const form = formFromHabit(legacyHabit);
    expect(selectedAccentId(form)).toBe('lime'); // shown as its remapped accent
    const saved = habitFromForm({ ...form, name: 'Stretch daily' });
    expect(saved.name).toBe('Stretch daily');
    expect(saved.color).toBe('#EAB308');
  });

  it('keeps every legacy hex and a missing colour untouched through an edit', () => {
    for (const hex of [...Object.keys(LEGACY_ACCENT_MAP), '#123456', null]) {
      const saved = habitFromForm(formFromHabit({ ...legacyHabit, color: hex }));
      expect(saved.color).toBe(hex);
    }
  });

  it('(c) a new pick stores the accent light-fill hex, never an id', () => {
    for (const id of ACCENT_IDS) {
      const form = pickAccent(formFromHabit(legacyHabit), id);
      expect(form.color).toMatch(/^#[0-9A-F]{6}$/);
      expect(selectedAccentId(form)).toBe(id);
      expect(habitFromForm(form).color).toBe(form.color);
    }
  });

  it('starts a new custom habit on sky, stored as hex', () => {
    expect(BLANK_FORM.color).toBe('#0284C7');
    expect(selectedAccentId(BLANK_FORM)).toBe('sky');
  });

  it('normalises a Magic Fill colour (a stale deployment may return a legacy hex)', () => {
    expect(suggestedColor('#F97316', '#0284C7')).toBe('#C2410C');
    expect(suggestedColor('#db2777', '#0284C7')).toBe('#DB2777');
    expect(suggestedColor(null, '#0284C7')).toBe('#0284C7');
  });
});

describe('habit form colour row (source check)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'HabitsScreen.js'), 'utf8');

  it('(d) renders the 7 accents in one non-wrapping row', () => {
    expect(src).toMatch(/ACCENT_IDS\.map\(accentId =>/);
    const row = src.match(/colorRow: \{([^}]*)\}/)[1];
    expect(row).not.toMatch(/flexWrap/);
    // 7 dots of 36 pt fit the 327 pt form width of a 375 pt phone (24 pt gutters).
    const dot = Number(src.match(/colorDot: \{ width: (\d+)/)[1]);
    expect(7 * dot).toBeLessThanOrEqual(375 - 48 - 6 * 8);
  });

  it('writes the colour only from a dot tap, and exposes the web selected state', () => {
    expect(src).toContain('onPress={() => setForm(f => pickAccent(f, accentId))}');
    expect(src).toContain('setForm(formFromHabit(habit))');
    const dots = src.slice(src.indexOf('ACCENT_IDS.map(accentId =>'), src.indexOf('</View>', src.indexOf('ACCENT_IDS.map(accentId =>')));
    expect(dots).toMatch(/aria-selected=\{active\}/);
    expect(dots).toMatch(/accessibilityState=\{\{ selected: active \}\}/);
  });
});
