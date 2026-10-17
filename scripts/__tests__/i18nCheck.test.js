// scripts/i18n-check-core.js: the per-ticket translation check (UI/UX plan §0, DoD 2).
const { checkLocales, nothingToTranslate } = require('../i18n-check-core');

const allow = { values: ['Groov', 'OK'], keys: { de: ['common.brandish'] } };
const baseEn = { common: { cancel: 'Cancel', save: 'Save' }, items: { one: '%{count} item', other: '%{count} items' } };
const deBase = { common: { cancel: 'Abbrechen', save: 'Speichern' }, items: { one: '%{count} Eintrag', other: '%{count} Einträge' } };
const jaBase = { common: { cancel: 'キャンセル', save: '保存' }, items: { one: '%{count}件', other: '%{count}件' } };
const clone = (o) => JSON.parse(JSON.stringify(o));

function run({ en = baseEn, de = deBase, ja = jaBase } = {}) {
  return checkLocales({ baseEn, en, baseLocales: { de: deBase, ja: jaBase }, locales: { de, ja }, allow });
}

describe('i18n-check core', () => {
  it('passes when nothing changed, even with English copies of unchanged keys', () => {
    const de = clone(deBase); de.common.save = 'Save';
    expect(run({ de }).failures).toEqual([]);
  });

  it('fails a new key copied from English, passes once translated', () => {
    const en = clone(baseEn); en.common.hello = 'Keep your rhythm';
    const de = clone(deBase); de.common.hello = 'Keep your rhythm';
    const ja = clone(jaBase); ja.common.hello = 'リズムを保とう';
    const r = run({ en, de, ja });
    expect(r.added).toEqual(['common.hello']);
    expect(r.failures).toEqual(['de: common.hello is still English ("Keep your rhythm")']);
    de.common.hello = 'Bleib im Rhythmus';
    expect(run({ en, de, ja }).failures).toEqual([]);
  });

  it('fails a new key missing in a locale', () => {
    const en = clone(baseEn); en.common.hello = 'Hello';
    const de = clone(deBase); de.common.hello = 'Hallo';
    expect(run({ en, de }).failures).toEqual(['ja: missing common.hello']);
  });

  it('fails a reworded en key whose translation stayed as at the base', () => {
    const en = clone(baseEn); en.common.cancel = 'Cancel for now';
    const ja = clone(jaBase); ja.common.cancel = '今はキャンセル';
    const r = run({ en, ja });
    expect(r.changed).toEqual(['common.cancel']);
    expect(r.failures).toEqual([expect.stringMatching(/^de: common\.cancel not updated after en changed/)]);
    const de = clone(deBase); de.common.cancel = 'Vorerst abbrechen';
    expect(run({ en, de, ja }).failures).toEqual([]);
  });

  it('honours the allowlist values and per-locale keys', () => {
    const en = clone(baseEn); en.common.app = 'Groov'; en.common.brandish = 'Streak Shield';
    const de = clone(deBase); de.common.app = 'Groov'; de.common.brandish = 'Streak Shield';
    const ja = clone(jaBase); ja.common.app = 'Groov'; ja.common.brandish = 'ストリーク・シールド';
    expect(run({ en, de, ja }).failures).toEqual([]);
    ja.common.brandish = 'Streak Shield'; // allowed for de only
    expect(run({ en, de, ja }).failures).toEqual(['ja: common.brandish is still English ("Streak Shield")']);
  });

  it('passes strings with nothing to translate', () => {
    expect(nothingToTranslate('%{count} / %{total}')).toBe(true);
    expect(nothingToTranslate('🔥 %{n}')).toBe(true);
    expect(nothingToTranslate('%{n} days')).toBe(false);
    const en = clone(baseEn); en.common.ratio = '%{done}/%{total}';
    const de = clone(deBase); de.common.ratio = '%{done}/%{total}';
    const ja = clone(jaBase); ja.common.ratio = '%{done}/%{total}';
    expect(run({ en, de, ja }).failures).toEqual([]);
  });

  it('fails a plural key without one or other in any locale, ja included', () => {
    const ja = clone(jaBase); delete ja.items.one;
    expect(run({ ja }).failures).toEqual(["ja: plural key items lacks 'one'"]);
    const de = clone(deBase); de.items = '%{count} Einträge';
    expect(run({ de }).failures).toEqual(['de: plural key items is not a { one, other } object']);
  });
});
