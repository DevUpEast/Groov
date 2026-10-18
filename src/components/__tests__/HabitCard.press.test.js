// F-06 review m5: HabitCard on the shared pressables. Body tap, long-press options, the disabled
// − (refused, no change) and a long hold on − (options, no refused).
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const { Animated } = require('react-native');

let mockCount = 0;
let mockDone = false;
let mockStreak = 0;
let mockSkipped = false;
jest.mock('../../context/AppContext', () => {
  const { themes } = jest.requireActual('../../theme/colors');
  return {
    useApp: () => ({
      theme: themes.light,
      themeName: 'light',
      todayStr: () => '2026-10-17',
      getHabitCount: () => mockCount,
      isHabitDone: () => mockDone,
      isHabitDoneOn: () => false,
      getStreakForHabit: () => mockStreak,
      isHabitSkippedOn: () => mockSkipped,
      toggleSkipHabitOn: jest.fn(),
      toggleHabitDoneOn: jest.fn(),
      getNote: () => null,
    }),
  };
});
jest.mock('../../services/feedback', () => ({
  __esModule: true,
  default: { play: jest.fn(), toggled: jest.fn() },
  EVENTS: { refused: 'refused' },
}));
jest.mock('../../utils/a11y', () => ({ useReducedMotion: () => false, isReducedMotion: () => false, announce: jest.fn() }));
jest.mock('../ui/ActionSheet', () => (props) => require('react').createElement('ActionSheet', props));
jest.mock('../HabitIcon', () => () => null);
jest.mock('../ui/CheckMark', () => (props) => require('react').createElement('CheckMark', props));
jest.mock('@expo/vector-icons', () => ({ Ionicons: (props) => require('react').createElement('Ionicons', props) }));

const HabitCard = require('../HabitCard').default;
const feedback = require('../../services/feedback').default;

global.IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  mockCount = 0;
  mockDone = false;
  mockStreak = 0;
  mockSkipped = false;
  feedback.play.mockClear();
  const instant = (value, config) => ({ start: (cb) => { value.setValue(config.toValue); cb?.({ finished: true }); }, stop: jest.fn() });
  jest.spyOn(Animated, 'timing').mockImplementation(instant);
  jest.spyOn(Animated, 'spring').mockImplementation(instant);
});
afterEach(() => jest.restoreAllMocks());

const daily = { id: 'h1', name: 'Read', type: 'daily', volumeGoal: 1, createdAt: '2026-01-01' };
const counter = { id: 'h2', name: 'Water', type: 'volume', volumeGoal: 8, unit: 'glasses', createdAt: '2026-01-01' };

function render(habit) {
  const onIncrement = jest.fn();
  const onDecrement = jest.fn();
  let r;
  act(() => { r = TestRenderer.create(<HabitCard habit={habit} onIncrement={onIncrement} onDecrement={onDecrement} />); });
  return { r, onIncrement, onDecrement };
}
// The outer element carrying our handlers, found by its accessibility label.
const byLabel = (r, re) => r.root.findAll(n => typeof n.props.onPressIn === 'function' && re.test(n.props.accessibilityLabel || ''))[0];
const sheetOpen = (r) => r.root.findAll(n => n.type === 'ActionSheet')[0].props.visible;

it('a body tap toggles a daily habit and increments a counter', () => {
  const d = render(daily);
  act(() => { byLabel(d.r, /^Read/).props.onPress({}); });
  expect(d.onIncrement).toHaveBeenCalledWith(1);

  const c = render(counter);
  act(() => { byLabel(c.r, /^Water/).props.onPress({}); });
  expect(c.onIncrement).toHaveBeenCalledWith(1);
});

it('a long-press on the body opens the options sheet', () => {
  const { r, onIncrement } = render(daily);
  const card = byLabel(r, /^Read/);
  expect(card.props.delayLongPress).toBe(350);
  expect(sheetOpen(r)).toBe(false);
  act(() => { card.props.onLongPress({}); });
  expect(sheetOpen(r)).toBe(true);
  expect(onIncrement).not.toHaveBeenCalled();
});

it('the − at 0 is disabled: a tap plays refused and changes nothing', () => {
  const { r, onIncrement, onDecrement } = render(counter);
  const minus = byLabel(r, /^Remove/);
  expect(minus.props.accessibilityState).toEqual({ disabled: true });
  act(() => { minus.props.onPress({}); });
  expect(feedback.play).toHaveBeenCalledWith('refused');
  expect(onDecrement).not.toHaveBeenCalled();
  expect(onIncrement).not.toHaveBeenCalled();
  expect(sheetOpen(r)).toBe(false);
});

it('a long hold on the disabled − opens the options instead of refusing', () => {
  const { r, onDecrement } = render(counter);
  const minus = byLabel(r, /^Remove/);
  act(() => { minus.props.onLongPress({}); });
  expect(sheetOpen(r)).toBe(true);
  expect(feedback.play).not.toHaveBeenCalled();
  expect(onDecrement).not.toHaveBeenCalled();
});

it('a long hold on + also opens the options; a tap on + increments', () => {
  mockCount = 3;
  const { r, onIncrement } = render(counter);
  const plus = byLabel(r, /^Add/);
  act(() => { plus.props.onLongPress({}); });
  expect(sheetOpen(r)).toBe(true);
  act(() => { plus.props.onPress({}); });
  expect(onIncrement).toHaveBeenCalledWith(1);
});

const { themes } = jest.requireActual('../../theme/colors');
const { StyleSheet } = require('react-native');
const { resolveAccent } = jest.requireActual('../../theme/accents');
const flat = (node) => StyleSheet.flatten(node.props.style);
const textOf = (r) => r.root.findAll(n => n.type === 'Text').map(n => [].concat(n.props.children).join(''));

it('the disabled − is lighter than the +: no fill, a disabledContainer hairline, textTertiary glyph (a tone lighter than the enabled textSecondary)', () => {
  const { r } = render(counter);
  const minus = byLabel(r, /^Remove/);
  const s = flat(minus);
  expect(s.backgroundColor).toBe('transparent');
  expect(s.borderColor).toBe(themes.light.disabledContainer);
  expect(minus.findAll(n => n.type === 'Ionicons')[0].props.color).toBe(themes.light.textTertiary);
  // The enabled + keeps its accent ring and accent glyph.
  const plus = byLabel(r, /^Add/);
  const accent = resolveAccent(counter.color, 'light');
  expect(flat(plus).borderColor).toBe(accent.ring);
  expect(plus.findAll(n => n.type === 'Ionicons')[0].props.color).toBe(accent.fill);
});

describe('C-02a anatomy', () => {
  const card = (r, re) => flat(byLabel(r, re));

  it('every card has the 72 dp minimum, done or not, so a check-off never changes its height', () => {
    expect(card(render(daily).r, /^Read/).minHeight).toBe(72);
    mockDone = true; mockStreak = 2;
    expect(card(render(daily).r, /^Read/).minHeight).toBe(72);
    expect(card(render(counter).r, /^Water/).minHeight).toBe(72);
  });

  it('one done form for every type: the accent disc with the SVG check (quit too, no 🛡)', () => {
    mockDone = true;
    for (const habit of [daily, { ...daily, id: 'q', name: 'No sugar', type: 'quit' }]) {
      const { r } = render(habit);
      const disc = r.root.findAll(n => n.props.testID === 'habit-check' && n.props.style)[0];
      const accent = resolveAccent(habit.color, 'light');
      expect(flat(disc).backgroundColor).toBe(accent.fill);
      const marks = r.root.findAll(n => n.type === 'CheckMark');
      expect(marks).toHaveLength(1);
      expect(marks[0].props.color).toBe(accent.onFill);
      expect(textOf(r).join(' ')).not.toMatch(/🛡|✓/);
    }
  });

  it('the name keeps full text contrast when done', () => {
    mockDone = true;
    const { r } = render(daily);
    const name = r.root.findAll(n => n.type === 'Text' && n.props.children === 'Read')[0];
    expect(StyleSheet.flatten(name.props.style).color).toBe(themes.light.text);
  });

  it('a done card reads "Done · N-day streak" (counters too) on the tint, with a tint border and no stripe', () => {
    mockDone = true; mockStreak = 4;
    const d = render(daily);
    expect(textOf(d.r)).toContain('Done · 4-day streak');
    const accent = resolveAccent(daily.color, 'light');
    expect(card(d.r, /^Read/)).toMatchObject({ backgroundColor: accent.tint, borderColor: accent.tint, borderWidth: 1 });
    mockCount = 8;
    expect(textOf(render(counter).r)).toContain('Done · 4-day streak');
  });

  it('an open counter shows its progress; a lone streak starts upper case', () => {
    mockCount = 5; mockStreak = 3;
    expect(textOf(render(counter).r)).toContain('5/8 glasses · 3-day streak');
  });

  it('skipped: dashed controlBorder outline at full opacity, neutral ring, no 💤', () => {
    mockSkipped = true;
    const { r } = render(daily);
    const s = card(r, /^Read/);
    expect(s).toMatchObject({ borderStyle: 'dashed', borderColor: themes.light.controlBorder });
    expect(s.opacity).toBeUndefined();
    const disc = r.root.findAll(n => n.props.testID === 'habit-check' && n.props.style)[0];
    expect(flat(disc).borderColor).toBe(themes.light.controlBorder);
    expect(textOf(r).join(' ')).not.toMatch(/💤/);
    expect(textOf(r)).toContain('Skipped today');
  });
});

it('styles Android would keep after a key is dropped are always explicit (borderStyle, + fill)', () => {
  // Android does not reset a removed borderStyle / backgroundColor: a skipped-then-done card
  // stayed dashed and a counter that left its goal kept the filled +.
  mockCount = 3;
  const { r } = render(counter);
  expect(flat(byLabel(r, /^Water/)).borderStyle).toBe('solid');
  expect(flat(byLabel(r, /^Add/)).backgroundColor).toBe('transparent');
  mockDone = true;
  expect(flat(byLabel(render(daily).r, /^Read/)).borderStyle).toBe('solid');
});

describe('joinSubLine', () => {
  const { joinSubLine } = require('../HabitCard');
  it('joins with " · ", skips blanks and capitalises the first letter for the locale', () => {
    expect(joinSubLine(['Hecho', null, 'racha de 4 días'], 'es')).toBe('Hecho · racha de 4 días');
    expect(joinSubLine(['racha de 4 días'], 'es')).toBe('Racha de 4 días');
    expect(joinSubLine(['série de 3 jours'], 'fr')).toBe('Série de 3 jours');
    expect(joinSubLine(['4日連続'], 'ja')).toBe('4日連続');
    expect(joinSubLine([null, ''], 'en')).toBe('');
  });
});

it('a running timer survives a re-render from a check on another card (no remount)', () => {
  const timed = { id: 'h3', name: 'Stretch', type: 'timed', volumeGoal: 10, createdAt: '2026-01-01' };
  const { r } = render(timed);
  act(() => { byLabel(r, /^Start timer/).props.onPress({}); });
  expect(byLabel(r, /^Stop timer/)).toBeTruthy();
  // Another card's check re-renders the list: same key, new props, new context values.
  mockStreak = 2;
  act(() => { r.update(<HabitCard habit={{ ...timed }} onIncrement={jest.fn()} onDecrement={jest.fn()} />); });
  expect(byLabel(r, /^Stop timer/)).toBeTruthy();
  act(() => { r.unmount(); }); // clears the 1 s tick
});

describe('C-02a review round', () => {
  const quit = { id: 'q1', name: 'No sugar', type: 'quit', volumeGoal: 1, createdAt: '2026-01-01' };

  it('M1: a done quit habit reads "Avoided today · N days clean", never "Done"', () => {
    mockDone = true; mockCount = 1; mockStreak = 5;
    const lines = textOf(render(quit).r);
    expect(lines).toContain('Avoided today · 5 days clean');
    expect(lines.join(' ')).not.toMatch(/\bDone\b/);
  });

  it('S2: every card renders a sub-line, so the name keeps its y on check-off', () => {
    // Open daily, no intention, no streak: the schedule fallback.
    expect(textOf(render(daily).r)).toContain('Every day');
    expect(textOf(render({ ...daily, schedule: { type: 'perWeek', target: 3 } }).r)).toContain('0/3 this week');
    // Intention leads (D-00 "After coffee · 3-day streak").
    mockStreak = 3;
    expect(textOf(render({ ...daily, intention: 'coffee' }).r)).toContain('After I coffee · 3-day streak');
    // Done replaces the intention.
    mockDone = true;
    expect(textOf(render({ ...daily, intention: 'coffee' }).r)).toContain('Done · 3-day streak');
  });

  it('m2: counter and timer sub-lines may wrap to 2 lines; daily stays on 1', () => {
    mockCount = 3;
    const sub = (r, re) => r.root.findAll(n => n.type === 'Text' && re.test([].concat(n.props.children).join('')))[0];
    expect(sub(render(counter).r, /glasses/).props.numberOfLines).toBe(2);
    expect(sub(render(daily).r, /Every day/).props.numberOfLines).toBe(1);
  });

  it('m1: the week label carries no text ✓', () => {
    const en = require('../../i18n/locales/en.json');
    for (const code of ['en', 'es', 'de', 'fr', 'pt-BR', 'ja']) {
      expect(require(`../../i18n/locales/${code}.json`).habitCard.weekDone).not.toMatch(/✓/);
    }
    expect(en.habitCard.weekDone).toBe('%{done}/%{target} this week');
  });
});

describe('C-02b counter semantics', () => {
  const { bodyPressAction, showsDonePill } = require('../HabitCard');
  const { FLAGS } = require('../../utils/flags');
  const timed = { id: 'h3', name: 'Stretch', type: 'timed', volumeGoal: 20, createdAt: '2026-01-01' };
  const limit = { id: 'h4', name: 'Coffee', type: 'atMost', volumeGoal: 2, createdAt: '2026-01-01' };
  const pill = (r) => r.root.findAll(n => n.props.testID === 'habit-done-pill' && typeof n.props.onPressIn === 'function')[0];
  const renderWith = (habit, extra = {}) => {
    const onIncrement = jest.fn(); const onDecrement = jest.fn(); const onOpenDetail = jest.fn();
    let r;
    act(() => { r = TestRenderer.create(<HabitCard habit={habit} onIncrement={onIncrement} onDecrement={onDecrement} onOpenDetail={onOpenDetail} {...extra} />); });
    return { r, onIncrement, onDecrement, onOpenDetail };
  };

  it('bodyPressAction: counters open the detail with the flag on, increment with it off; daily always toggles', () => {
    expect(FLAGS.counterBodyOpensDetail).toBe(true);
    for (const h of [counter, timed, limit]) {
      expect(bodyPressAction(h, { canOpenDetail: true })).toBe('detail');
      expect(bodyPressAction(h, { opensDetail: false, canOpenDetail: true })).toBe('increment');
      // A screen with no detail sheet (no onOpenDetail) keeps the +step body tap.
      expect(bodyPressAction(h, { canOpenDetail: false })).toBe('increment');
    }
    expect(bodyPressAction(daily, { canOpenDetail: true })).toBe('toggle');
    expect(bodyPressAction({ ...daily, type: 'quit' }, { opensDetail: false, canOpenDetail: true })).toBe('toggle');
  });

  it('flag on: a counter body tap opens the detail sheet and logs nothing', () => {
    mockCount = 3;
    const { r, onIncrement, onOpenDetail } = renderWith(counter);
    const body = byLabel(r, /^Water/);
    expect(body.props.accessibilityHint).toMatch(/details/);
    act(() => { body.props.onPress({}); });
    expect(onOpenDetail).toHaveBeenCalledWith(counter);
    expect(onIncrement).not.toHaveBeenCalled();
    // + still increments; long-press still opens the options.
    act(() => { byLabel(r, /^Add/).props.onPress({}); });
    expect(onIncrement).toHaveBeenCalledWith(1);
    act(() => { body.props.onLongPress({}); });
    expect(sheetOpen(r)).toBe(true);
  });

  it('flag off: the counter body tap increments as before', () => {
    FLAGS.counterBodyOpensDetail = false;
    try {
      mockCount = 3;
      const { r, onIncrement, onOpenDetail } = renderWith(counter);
      act(() => { byLabel(r, /^Water/).props.onPress({}); });
      expect(onIncrement).toHaveBeenCalledWith(1);
      expect(onOpenDetail).not.toHaveBeenCalled();
    } finally {
      FLAGS.counterBodyOpensDetail = true;
    }
  });

  it('a daily body tap still toggles when the screen can open details', () => {
    const { r, onIncrement, onOpenDetail } = renderWith(daily);
    act(() => { byLabel(r, /^Read/).props.onPress({}); });
    expect(onIncrement).toHaveBeenCalledWith(1);
    expect(onOpenDetail).not.toHaveBeenCalled();
  });

  it('at goal the − and + collapse to one accent pill "8 ✓"; a tap adds one past the goal', () => {
    mockCount = 8; mockDone = true;
    const { r, onIncrement } = renderWith(counter);
    expect(byLabel(r, /^Remove/)).toBeUndefined();
    expect(byLabel(r, /^Add/)).toBeUndefined();
    const p = pill(r);
    expect(p.props.accessibilityRole).toBe('button');
    expect(p.props.accessibilityLabel).toBe('Water, 8 of 8, done');
    expect(p.props.accessibilityHint).toBe('Add one glasses');
    const accent = resolveAccent(counter.color, 'light');
    expect(flat(p)).toMatchObject({ backgroundColor: accent.fill, height: 36 });
    expect(p.findAll(n => n.type === 'CheckMark')[0].props.color).toBe(accent.onFill);
    expect(p.findAll(n => n.type === 'Text').map(n => [].concat(n.props.children).join(''))).toEqual(['8']);
    // The digits are WCAG large text (>= 18.66 px bold), so the >= 3:1 fill / onFill pair holds.
    const digits = StyleSheet.flatten(p.findAll(n => n.type === 'Text')[0].props.style);
    expect(digits.fontSize).toBeGreaterThanOrEqual(18.66);
    expect(digits.fontWeight).toBe('700');
    act(() => { p.props.onPress({}); });
    expect(onIncrement).toHaveBeenCalledWith(1);
  });

  it('the pill is as tall as the ± buttons it replaces, so the card height does not change at goal', () => {
    mockCount = 7;
    const open = flat(byLabel(renderWith(counter).r, /^Add/));
    mockCount = 8; mockDone = true;
    expect(flat(pill(renderWith(counter).r)).height).toBe(open.height ?? 36);
  });

  it('a done counter keeps a decrement in the long-press options', () => {
    mockCount = 8; mockDone = true;
    const { r, onDecrement } = renderWith(counter);
    act(() => { pill(r).props.onLongPress({}); });
    expect(sheetOpen(r)).toBe(true);
    const opts = r.root.findAll(n => n.type === 'ActionSheet')[0].props.options;
    const minus = opts.find(o => o.label === 'Remove one');
    expect(minus).toBeTruthy();
    act(() => { minus.onPress(); });
    expect(onDecrement).toHaveBeenCalledWith(1);
  });

  it('no decrement option at 0, and the timed step reads "Remove 5"', () => {
    const opts0 = renderWith(counter).r.root.findAll(n => n.type === 'ActionSheet')[0].props.options;
    expect(opts0.some(o => /^Remove/.test(o.label))).toBe(false);
    mockCount = 10;
    const optsT = renderWith(timed).r.root.findAll(n => n.type === 'ActionSheet')[0].props.options;
    expect(optsT.some(o => o.label === 'Remove 5')).toBe(true);
  });

  it('timed: ▶ takes the + slot until done, then the pill (+5); a running timer keeps ■ even at goal', () => {
    mockCount = 5;
    const open = renderWith(timed);
    expect(byLabel(open.r, /^Add/)).toBeUndefined();
    expect(byLabel(open.r, /^Start timer/)).toBeTruthy();
    expect(byLabel(open.r, /^Remove/)).toBeTruthy();
    mockCount = 20; mockDone = true;
    const done = renderWith(timed);
    expect(byLabel(done.r, /^Start timer/)).toBeUndefined();
    act(() => { pill(done.r).props.onPress({}); });
    expect(done.onIncrement).toHaveBeenCalledWith(5);
    expect(showsDonePill(timed, { done: true, timerRunning: true })).toBe(false);
    expect(showsDonePill(timed, { done: true })).toBe(true);
  });

  it('"at most" habits are done from 0, so they keep − / + and never show the pill', () => {
    mockCount = 1; mockDone = true;
    const { r } = renderWith(limit);
    expect(pill(r)).toBeUndefined();
    expect(byLabel(r, /^Add/)).toBeTruthy();
    expect(showsDonePill(limit, { done: true })).toBe(false);
  });
});
