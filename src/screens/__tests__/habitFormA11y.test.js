// S-06 source check: every pressable in the habit form (IconPicker, colour row, chips,
// steppers, close and save) declares an accessibility role, and the chip-like ones
// expose a selected state.
import fs from 'fs';
import path from 'path';

const src = fs.readFileSync(path.join(__dirname, '..', 'HabitsScreen.js'), 'utf8');
const start = src.indexOf('function SchedulePicker(');
const end = src.indexOf('function HabitRow(');
const form = src.slice(start, end);

// Each <TouchableOpacity ...> element up to its closing tag (no nested touchables in the form).
const touchables = form.split(/<TouchableOpacity\b/).slice(1).map(chunk => chunk.split('</TouchableOpacity>')[0]);

describe('habit form accessibility (S-06)', () => {
  it('finds the form pressables', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(touchables.length).toBeGreaterThanOrEqual(10);
  });

  it('gives every pressable a role', () => {
    const missing = touchables.filter(tag => !/accessibilityRole=/.test(tag));
    expect(missing).toEqual([]);
  });

  it('names icon buttons, the photo button, colour dots and close', () => {
    expect(form).toMatch(/accessibilityLabel=\{t\(`habits\.icons\.\$\{key\}`\)\}/);
    expect(form).toMatch(/accessibilityLabel=\{t\('habits\.form\.photoIcon'\)\}/);
    expect(form).toMatch(/t\(`habits\.colors\.\$\{accentId\}`\)/);
    expect(form).toMatch(/accessibilityLabel=\{t\('common\.close'\)\}/);
  });

  it('has an English name for every preset icon', () => {
    const en = require('../../i18n/locales/en.json');
    const keys = [...src.matchAll(/\{ key: '(\w+)', emoji: /g)].map(m => m[1]);
    expect(keys).toHaveLength(20);
    for (const k of keys) expect(typeof en.habits.icons[k]).toBe('string');
  });

  it('exposes selected state on every chip-like control', () => {
    // icon, photo, colour, schedule, weekday, type, time of day, volume max
    const selected = touchables.filter(tag => /accessibilityState=\{\{\s*selected:/.test(tag));
    expect(selected.length).toBeGreaterThanOrEqual(8);
  });

  it('labels the Name input and the volume slider', () => {
    expect(form).toContain("accessibilityLabel={t('habits.form.name')}");
    expect(form).toContain("label={t('habits.form.timesLabel')}");
  });

  it('exposes the disabled state on Save', () => {
    // F-06: Save is the shared Button, which sets accessibilityRole="button" and
    // accessibilityState.disabled itself (src/components/ui/__tests__/pressables.test.js).
    const save = form.split(/<Button\b/).slice(1).map(chunk => chunk.split('/>')[0]).find(tag => tag.includes('onPress={onSave}'));
    expect(save).toBeDefined();
    expect(save).toMatch(/disabled=\{!form\.name\.trim\(\)\}/);
  });
});
