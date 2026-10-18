// Glossary guard (G-01, docs/GLOSSARY.md "Don't say"). Fails when a locale value uses a
// term the glossary retired. Add a row here whenever the glossary bans a term, and keep the
// reason next to it so a failing run explains itself.
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'locales');
const flatten = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) => (
  v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]
));
const load = (code) => flatten(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${code}.json`), 'utf8')));

// [regex, why]. Regexes run against every value of that locale.
const BANNED = {
  en: [
    [/\bcounters and timers\b/i, 'name the habit types: Volume goal, Timed, Limit'],
    [/\bfell off\b/i, 'tone rule 3: never "you fell off the beat"'],
    [/\bsaved you\b/i, 'tone rule 5: rests hold the streak, no rescue framing'],
    [/\bmissed out\b/i, 'tone rule 1'],
    [/\bstreak (?:is |was )?(?:lost|broken)\b/i, 'tone rule 1: a streak "ends"'],
    [/\byou (?:lost|broke|failed)\b/i, 'tone rule 1'],
  ],
  es: [
    [/\busted(?:es)?\b/i, 'es uses tú'],
    [/\bfallad[oa]s?\b/i, 'a missed day is "sin hacer", never "failed"'],
  ],
  de: [
    [/\b(?:Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)\b/, 'de uses du (formal possessive found)'],
  ],
  fr: [
    // Lookbehind so the idiom "rendez-vous" passes.
    [/(?<![-\p{L}])(?:vous|votre|vos)\b/iu, 'fr uses tu'],
    [/\bTouchez\b/, 'fr uses tu: "Appuie"'],
    [/\b\w+ez-(?:les|la|le)\b/, 'fr uses tu (vous imperative found)'],
  ],
  'pt-BR': [
    [/\bpausas? de sequência\b/i, 'freeze is "congelamento"'],
    [/\bdias? perdidos?\b/i, 'a missed day is "não feito" / "sem registro", never "lost"'],
    [/\bo senhor\b|\ba senhora\b/i, 'pt-BR uses você'],
  ],
  ja: [
    [/ストリーク/, 'streak is 連続記録, freeze is フリーズ'],
    [/お休みの日/, 'rest day is 休みの日'],
    [/カウンターとタイマー/, 'name the habit types: 数量目標・時間目標・上限'],
  ],
};

// Tab labels the D-00 frame tried and the glossary rejected.
const BANNED_KEYS = {
  de: { 'app.tabs.habits': /^Routinen$/, 'app.tabs.settings': /^Optionen$/ },
};

describe('glossary: retired terms do not appear in locale files', () => {
  for (const [code, rules] of Object.entries(BANNED)) {
    it(`${code} has no banned terms`, () => {
      const hits = [];
      for (const [key, value] of load(code)) {
        for (const [re, why] of rules) {
          if (re.test(String(value))) hits.push(`${key}: "${value}" (${why})`);
        }
      }
      expect(hits).toEqual([]);
    });
  }

  it('keeps the rejected German tab labels out', () => {
    for (const [code, keys] of Object.entries(BANNED_KEYS)) {
      const values = Object.fromEntries(load(code));
      for (const [key, re] of Object.entries(keys)) expect(values[key]).not.toMatch(re);
    }
  });

  it('catches a planted banned term (the guard is live)', () => {
    const [re] = BANNED.ja[0];
    expect(re.test('今月のストリークフリーズ')).toBe(true);
    const [fr] = BANNED.fr[2];
    expect(fr.test('Modifiez-les')).toBe(true);
  });
});
