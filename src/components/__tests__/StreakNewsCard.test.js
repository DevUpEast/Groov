// C-09: the one-time Today card. Copy per plan §1.3 (tone rules), a screen-reader
// announcement when it appears, and the action that dismisses it.
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../utils/a11y', () => ({
  announce: jest.fn(),
  isReducedMotion: () => false,
  useReducedMotion: () => false,
}));

const { announce } = require('../../utils/a11y');
const { setLocale } = require('../../i18n');
const StreakNewsCard = require('../StreakNewsCard').default;
const { streakNewsText } = require('../StreakNewsCard');
const { themes } = require('../../theme/colors');

const theme = themes.light;
const TODAY = '2026-10-18';

afterEach(() => { act(() => { setLocale('en'); }); });

describe('streakNewsText', () => {
  beforeEach(() => { act(() => { setLocale('en'); }); });
  test('freeze on yesterday', () => {
    expect(streakNewsText({ kind: 'freeze', covered: '2026-10-17', count: 1, streak: 12, date: TODAY }))
      .toBe('A freeze covered yesterday. Your 12-day streak holds.');
  });
  test('freeze on an earlier day names the weekday', () => {
    expect(streakNewsText({ kind: 'freeze', covered: '2026-10-13', count: 1, streak: 12, date: TODAY }))
      .toBe('A freeze covered Tuesday. Your 12-day streak holds.');
  });
  test('two freezes', () => {
    expect(streakNewsText({ kind: 'freeze', covered: '2026-10-17', count: 2, streak: 12, date: TODAY }))
      .toBe('Freezes covered 2 days. Your 12-day streak holds.');
  });
  test('reset', () => {
    expect(streakNewsText({ kind: 'reset', ended: 12, date: TODAY })).toBe('Your streak ended at 12 days. Today starts a new one.');
  });
  test('de and ja', () => {
    act(() => { setLocale('de'); });
    expect(streakNewsText({ kind: 'reset', ended: 12, date: TODAY })).toBe('Deine Serie endete bei 12 Tagen. Heute beginnt eine neue.');
    act(() => { setLocale('ja'); });
    expect(streakNewsText({ kind: 'freeze', covered: '2026-10-17', count: 1, streak: 12, date: TODAY }))
      .toBe('フリーズが昨日をカバーしました。12日連続の記録は続いています。');
  });
});

function render(props) {
  let r;
  act(() => { r = TestRenderer.create(React.createElement(StreakNewsCard, { theme, onDismiss: jest.fn(), ...props })); });
  return r;
}
const labels = (r) => r.root.findAll(n => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityRole === 'button').map(n => n.props.accessibilityLabel);

test('a reset card announces itself and offers to start the first habit, which dismisses it', () => {
  const onDismiss = jest.fn();
  const r = render({ news: { kind: 'reset', ended: 12, date: TODAY }, onDismiss });
  expect(announce).toHaveBeenCalledWith('Your streak ended at 12 days. Today starts a new one.');
  expect(labels(r)).toContain("Start today's first habit");
  const btn = r.root.find(n => n.props.accessibilityLabel === "Start today's first habit" && typeof n.props.onPress === 'function');
  act(() => btn.props.onPress());
  expect(onDismiss).toHaveBeenCalled();
  act(() => r.unmount());
});

test('a freeze card (and a reset on a day with nothing scheduled) says Got it', () => {
  let r = render({ news: { kind: 'freeze', covered: '2026-10-17', count: 1, streak: 3, date: TODAY } });
  expect(labels(r)).toContain('Got it');
  act(() => r.unmount());
  r = render({ news: { kind: 'reset', ended: 4, date: TODAY }, canStart: false });
  expect(labels(r)).toContain('Got it');
  act(() => r.unmount());
});

test('the copy follows the tone rules in every locale (no loss words, no exclamation mark)', () => {
  const en = require('../../i18n/locales/en.json');
  const texts = JSON.stringify(en.today.streakNews);
  expect(texts).not.toMatch(/lost|broke|failed|missed out|only|saved|!/i);
  ['es', 'de', 'fr', 'pt-BR', 'ja'].forEach((code) => {
    const s = JSON.stringify(require(`../../i18n/locales/${code}.json`).today.streakNews);
    expect(s).not.toMatch(/[!！]/);
  });
});
