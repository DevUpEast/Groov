// Glossary guard (G-01, docs/GLOSSARY.md "Don't say"). Fails when a locale value uses a
// term the glossary retired. Add a rule here whenever the glossary bans a term, and keep the
// reason next to it so a failing run explains itself.
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'locales');
const flatten = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) => (
  v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]
));
const load = (code) => flatten(JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${code}.json`), 'utf8')));

// Rules per locale: name → { re, why }. Regexes run against every value of that locale.
const BANNED = {
  en: {
    countersAndTimers: { re: /\bcounters and timers\b/i, why: 'name the habit types: Volume goal, Timed, Limit' },
    fellOff: { re: /\bfell off\b/i, why: 'tone rule 3: never "you fell off the beat"' },
    savedYou: { re: /\bsaved you\b/i, why: 'tone rule 5: rests hold the streak, no rescue framing' },
    missedOut: { re: /\bmissed out\b/i, why: 'tone rule 1' },
    streakLost: { re: /\bstreak (?:is |was )?(?:lost|broken)\b/i, why: 'tone rule 1: a streak "ends"' },
    youFailed: { re: /\byou (?:lost|broke|failed)\b/i, why: 'tone rule 1' },
  },
  es: {
    usted: { re: /\busted(?:es)?\b/i, why: 'es uses tú' },
    // "fallado" (failed) as a status and "si fallas" (if you fail) as a lapse. "sin fallar"
    // (without fail) in praise copy is allowed.
    failed: { re: /\bfall(?:ad[oa]s?|as|aste|asteis)\b/i, why: 'a missed day is "sin hacer", never "failed"' },
  },
  de: {
    // Formal possessive / dative mid-sentence. Sentence-initial "Ihre" can mean "its/their",
    // so the start of a sentence is excluded here (the "Sie" rules below cover formal starts).
    formalPossessive: {
      re: /(?<!^)(?<![.!?:„"]\s?)\b(?:Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)\b/,
      why: 'de uses du (formal possessive found)',
    },
    // "Tippen Sie", "Wählen Sie", "Versuchen Sie es erneut".
    formalImperative: { re: /\b\w+en Sie\b/, why: 'de uses du (formal imperative found)' },
    // A sentence starting with "Sie": formal address, or an ambiguous pronoun. Name the noun
    // instead ("Die Gewohnheit verschwindet …").
    sentenceInitialSie: { re: /(?:^|[.!?:]\s+|[„"]\s?)Sie\b/, why: 'de uses du; avoid sentence-initial "Sie"' },
  },
  fr: {
    // Lookbehind so the idiom "rendez-vous" passes.
    vous: { re: /(?<![-\p{L}])(?:vous|votre|vos)\b/iu, why: 'fr uses tu' },
    vousImperativeHyphen: { re: /\b\p{L}+ez-(?:les|la|le|moi|nous)\b/u, why: 'fr uses tu (vous imperative found)' },
    vousImperative: {
      re: /\b(?:Appuyez|Touchez|Modifiez|Choisissez|Sélectionnez|Saisissez|Entrez|Essayez|Réessayez|Ajoutez|Activez|Désactivez|Vérifiez|Allez|Cliquez|Utilisez|Patientez|Recommencez|Ouvrez|Fermez|Supprimez|Retirez|Gardez|Continuez|Commencez|Passez|Notez|Partagez)\b/,
      why: 'fr uses tu: "Appuie", "Modifie", "Choisis"',
    },
  },
  'pt-BR': {
    pauseFreeze: { re: /\bpausas? de sequência\b/i, why: 'freeze is "congelamento"' },
    // "perdido" (lost) for a missed day and "perdeu um dia" (you lost a day). The verb
    // "perder" for data loss ("perder seus hábitos") is a real loss and allowed.
    lostDay: { re: /\bperd(?:eu|ido|ida|idos|idas)\b/i, why: 'a missed day is "não feito" / "sem registro", never "lost"' },
    formal: { re: /\bo senhor\b|\ba senhora\b/i, why: 'pt-BR uses você' },
  },
  ja: {
    streakKatakana: { re: /ストリーク/, why: 'streak is 連続記録, freeze is (連続記録)フリーズ' },
    politeRestDay: { re: /お休みの日/, why: 'rest day is 休みの日' },
    countersAndTimers: { re: /カウンターとタイマー/, why: 'name the habit types: 数量目標・時間目標・上限' },
    perfectDayLong: { re: /パーフェクトな日/, why: 'perfect day is パーフェクト日 (fits the SE stat tile)' },
  },
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
        for (const [name, { re, why }] of Object.entries(rules)) {
          if (re.test(String(value))) hits.push(`${key}: "${value}" [${name}: ${why}]`);
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
});

describe('glossary guard rules catch what they are meant to (and only that)', () => {
  const hits = (code, name, s) => BANNED[code][name].re.test(s);

  it('ja', () => {
    expect(hits('ja', 'streakKatakana', '今月のストリークフリーズ')).toBe(true);
    expect(hits('ja', 'streakKatakana', '今月の連続記録フリーズ')).toBe(false);
    expect(hits('ja', 'perfectDayLong', 'パーフェクトな日')).toBe(true);
    expect(hits('ja', 'perfectDayLong', 'パーフェクト日')).toBe(false);
  });

  it('fr', () => {
    expect(hits('fr', 'vousImperativeHyphen', 'Modifiez-les')).toBe(true);
    expect(hits('fr', 'vousImperative', 'Appuyez pour continuer')).toBe(true);
    expect(hits('fr', 'vousImperative', 'Touchez pour autoriser')).toBe(true);
    expect(hits('fr', 'vousImperative', 'Appuie pour continuer')).toBe(false);
    expect(hits('fr', 'vous', 'être au rendez-vous')).toBe(false);
    expect(hits('fr', 'vous', 'Pouvez-vous')).toBe(false); // hyphenated: caught by review, not this rule
    expect(hits('fr', 'vous', 'Merci pour votre aide')).toBe(true);
  });

  it('de', () => {
    expect(hits('de', 'formalImperative', 'Tippen Sie, um fortzufahren')).toBe(true);
    expect(hits('de', 'formalImperative', 'Bitte versuchen Sie es erneut.')).toBe(true);
    expect(hits('de', 'formalImperative', 'Tippe, um fortzufahren')).toBe(false);
    expect(hits('de', 'sentenceInitialSie', 'Sie haben das Limit erreicht.')).toBe(true);
    expect(hits('de', 'sentenceInitialSie', '„%{name}“ archivieren? Sie verschwindet')).toBe(true);
    expect(hits('de', 'sentenceInitialSie', 'du kannst sie jederzeit wiederherstellen')).toBe(false);
    expect(hits('de', 'formalPossessive', 'Speichern Sie Ihre Daten')).toBe(true);
    expect(hits('de', 'formalPossessive', 'Ihre Serie bleibt.')).toBe(false); // sentence-initial "its/their"
    expect(hits('de', 'formalPossessive', 'Die Gewohnheit behält ihren Verlauf.')).toBe(false);
  });

  it('es and pt-BR lapse wording', () => {
    expect(hits('es', 'failed', 'Si fallas un día, sigue adelante.')).toBe(true);
    expect(hits('es', 'failed', 'Fallado')).toBe(true);
    expect(hits('es', 'failed', 'Te presentaste cada día sin fallar.')).toBe(false);
    expect(hits('pt-BR', 'lostDay', 'Perdeu um dia? Continue.')).toBe(true);
    expect(hits('pt-BR', 'lostDay', 'um dia perdido')).toBe(true);
    expect(hits('pt-BR', 'lostDay', 'faria você perder seus hábitos')).toBe(false);
  });
});
