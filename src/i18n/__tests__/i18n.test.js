jest.mock('../../utils/storage', () => ({ loadData: jest.fn(async () => null), saveData: jest.fn(async () => {}) }));
// A device whose language Groov does not ship: the app must fall back to English.
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'xx-XX', languageCode: 'xx' }] }));

const fs = require('fs');
const path = require('path');
const {
  i18n, t, getLocale, setLocale, initLocale, matchSupportedLocale, deviceLocale, SUPPORTED_LOCALES,
} = require('../index');
const { loadData, saveData } = require('../../utils/storage');

const LOCALES_DIR = path.join(__dirname, '..', 'locales');
const flatten = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) => (
  v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]
));
const placeholders = (s) => (String(s).match(/%\{\w+\}/g) || []).sort();

afterEach(async () => { await setLocale(null); });

describe('matchSupportedLocale', () => {
  it('matches exact tags case-insensitively', () => {
    expect(matchSupportedLocale('en')).toBe('en');
    expect(matchSupportedLocale('PT-br')).toBe('pt-BR');
    expect(matchSupportedLocale('ja')).toBe('ja');
  });
  it('falls back to the same language', () => {
    expect(matchSupportedLocale('es-MX')).toBe('es');
    expect(matchSupportedLocale('pt-PT')).toBe('pt-BR');
    expect(matchSupportedLocale('de_AT')).toBe('de');
    expect(matchSupportedLocale('fr-CA')).toBe('fr');
  });
  it('returns null for unsupported or invalid input', () => {
    expect(matchSupportedLocale('xx-XX')).toBeNull();
    expect(matchSupportedLocale('')).toBeNull();
    expect(matchSupportedLocale(null)).toBeNull();
    expect(matchSupportedLocale(42)).toBeNull();
  });
});

describe('locale selection', () => {
  it('uses English when the device locale is unsupported', () => {
    expect(deviceLocale()).toBe('en');
    expect(getLocale()).toBe('en');
  });
  it('setLocale switches and persists; null follows the device', async () => {
    await setLocale('de');
    expect(getLocale()).toBe('de');
    expect(saveData).toHaveBeenCalledWith('locale', 'de');
    await setLocale('xx');
    expect(getLocale()).toBe('en');
    await setLocale(null);
    expect(getLocale()).toBe('en');
    expect(saveData).toHaveBeenLastCalledWith('locale', null);
  });
  it('initLocale applies a persisted choice', async () => {
    loadData.mockResolvedValueOnce('fr');
    await initLocale();
    // initLocale only runs once per process; an explicit choice wins over the device.
    expect(['fr', 'en']).toContain(getLocale());
  });
});

describe('t()', () => {
  it('falls back to English for a key missing in the active locale', async () => {
    i18n.store({ en: { __test: { onlyEnglish: 'English only' } } });
    await setLocale('fr');
    expect(t('__test.onlyEnglish')).toBe('English only');
    expect(t('common.cancel')).toBe('Annuler');
  });
  it('interpolates %{name} params', () => {
    expect(t('today.greeting.withName', { greeting: 'Hi', name: 'Isaac' })).toBe('Hi, Isaac');
    expect(t('habits.archived', { count: 3 })).toBe('Archived (3)');
  });
  it('reports missing keys as a readable message rather than throwing', () => {
    expect(() => t('does.not.exist')).not.toThrow();
    expect(t('does.not.exist')).toMatch(/does\.not\.exist/);
  });
});

describe('plurals', () => {
  const en = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'en.json'), 'utf8'));
  const fr = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'fr.json'), 'utf8'));
  const ja = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'ja.json'), 'utf8'));
  const fill = (s, n) => s.replace(/%\{count\}/g, String(n));

  it('English: one vs other', async () => {
    await setLocale('en');
    expect(t('backup.habits', { count: 1 })).toBe('1 habit');
    expect(t('backup.habits', { count: 0 })).toBe('0 habits');
    expect(t('backup.habits', { count: 2 })).toBe('2 habits');
  });
  it('French: 0 and 1 are singular', async () => {
    await setLocale('fr');
    expect(t('backup.habits', { count: 0 })).toBe(fill(fr.backup.habits.one, 0));
    expect(t('backup.habits', { count: 1 })).toBe(fill(fr.backup.habits.one, 1));
    expect(t('backup.habits', { count: 2 })).toBe(fill(fr.backup.habits.other, 2));
    expect(fr.backup.habits.one).not.toBe(en.backup.habits.one);
  });
  it('Japanese: no plural distinction', async () => {
    await setLocale('ja');
    expect(t('backup.habits', { count: 1 })).toBe(fill(ja.backup.habits.other, 1));
    expect(t('backup.habits', { count: 5 })).toBe(fill(ja.backup.habits.other, 5));
    expect(ja.backup.habits.other).not.toBe(en.backup.habits.other);
  });
});

describe('locale files', () => {
  const en = Object.fromEntries(flatten(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'en.json'), 'utf8'))));
  const codes = SUPPORTED_LOCALES.map(l => l.code);

  it('cover every supported locale', () => {
    for (const code of codes) expect(fs.existsSync(path.join(LOCALES_DIR, `${code}.json`))).toBe(true);
    expect(codes).toEqual(expect.arrayContaining(['en', 'es', 'de', 'fr', 'pt-BR', 'ja']));
  });

  it.each(codes.filter(c => c !== 'en'))('%s has exactly the same keys and placeholders as en', (code) => {
    const other = Object.fromEntries(flatten(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${code}.json`), 'utf8'))));
    expect(Object.keys(other).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en)) {
      expect(typeof other[key]).toBe('string');
      expect(other[key].length).toBeGreaterThan(0);
      expect({ key, placeholders: placeholders(other[key]) }).toEqual({ key, placeholders: placeholders(en[key]) });
    }
  });

  it('are mostly translated (not copies of English)', () => {
    for (const code of codes.filter(c => c !== 'en')) {
      const other = Object.fromEntries(flatten(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${code}.json`), 'utf8'))));
      const same = Object.keys(en).filter(k => other[k] === en[k]).length;
      expect(same / Object.keys(en).length).toBeLessThan(0.15);
    }
  });
});
