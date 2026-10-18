jest.mock('../../utils/supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn(async () => ({ data: { session: { access_token: 'jwt' } } })) },
    functions: { invoke: jest.fn() },
  },
}));
jest.mock('../../i18n', () => ({ getLocale: jest.fn(() => 'de') }));

const { supabase } = require('../../utils/supabase');
const { cleanMessage, fetchDailyNudge, fetchReflection } = require('../aiCoaching');
const { coachLocale, capToSentences, nudgeMaxChars, languageRule } = require('../../../supabase/functions/_shared/ai.ts');

describe('cleanMessage (#194)', () => {
  it('turns an empty or whitespace-only message into null', () => {
    expect(cleanMessage({ message: '', cached: true }).message).toBeNull();
    expect(cleanMessage({ message: '  \n ', cached: true }).message).toBeNull();
    expect(cleanMessage({ message: null }).message).toBeNull();
    expect(cleanMessage({ cached: true }).message).toBeNull();
  });

  it('keeps real text, trimmed and without long dashes', () => {
    expect(cleanMessage({ message: '  Five of seven days — nice.  ' }).message).toBe('Five of seven days, nice.');
  });

  it('keeps other fields and passes non-objects through', () => {
    expect(cleanMessage({ message: 'Hi', cached: false, generatedAt: 'x' })).toEqual({ message: 'Hi', cached: false, generatedAt: 'x' });
    expect(cleanMessage(null)).toBeNull();
  });
});

describe('coach calls send the UI language (#201)', () => {
  beforeEach(() => supabase.functions.invoke.mockReset());

  it('passes getLocale() to generate-nudge and generate-reflection', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { message: 'Hallo' }, error: null });
    await fetchDailyNudge('2026-10-01', 'Ana', '2026-10-18');
    await fetchReflection('weekly', '2026-10-01', 'Ana', '2026-10-18');
    expect(supabase.functions.invoke.mock.calls[0][1].body.locale).toBe('de');
    expect(supabase.functions.invoke.mock.calls[1][1].body.locale).toBe('de');
  });

  it('throws with the server code so screens pick localised copy', async () => {
    const context = { json: async () => ({ error: 'Daily limit of 2 reflections reached', code: 'quota_exceeded' }) };
    supabase.functions.invoke.mockResolvedValue({ data: null, error: { message: 'non-2xx', context } });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(fetchReflection('weekly')).rejects.toMatchObject({ code: 'quota_exceeded' });
    warn.mockRestore();
  });
});

describe('edge function helpers (_shared/ai.ts)', () => {
  it('accepts only the app locales and falls back to English', () => {
    expect(coachLocale('ja')).toBe('ja');
    expect(coachLocale('pt-BR')).toBe('pt-BR');
    expect(coachLocale('it')).toBe('en');
    expect(coachLocale(undefined)).toBe('en');
    expect(coachLocale('toString')).toBe('en');
    expect(languageRule('de')).toMatch(/German/);
  });

  it('caps the nudge to whole sentences within the budget', () => {
    const long = 'You logged water on 6 of 7 days. Meditate slipped to 2 of 7. Try it right after brushing your teeth tonight, so one familiar cue starts both habits without any extra effort.';
    expect(long.length).toBeGreaterThan(160);
    const capped = capToSentences(long, nudgeMaxChars('en'), 'en');
    expect(capped.length).toBeLessThanOrEqual(160);
    expect(capped).toBe('You logged water on 6 of 7 days. Meditate slipped to 2 of 7.');
    expect(capToSentences('Short one.', 160)).toBe('Short one.');
    // A single over-long sentence is kept whole (the client clamps it to 3 lines).
    const one = 'a'.repeat(200) + '.';
    expect(capToSentences(one, 160)).toBe(one);
    const ja = '水を7日中6日記録しました。瞑想は2日でした。今夜は歯みがきのすぐ後に瞑想してみましょう。ひとつのきっかけで二つの習慣がつながります。';
    expect(capToSentences(ja, nudgeMaxChars('ja'), 'ja').length).toBeLessThanOrEqual(80);
  });
});
