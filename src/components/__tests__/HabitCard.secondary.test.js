// C-03 (BTN-5): the visible "⋯" on every Today card, the options sheet order, and the same
// actions as screen-reader custom actions.
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const { Animated, StyleSheet } = require('react-native');

let mockCount = 0;
const mockSetHint = jest.fn();
const mockToggleSkip = jest.fn();
const mockToggleDoneOn = jest.fn();
jest.mock('../../context/AppContext', () => {
  const { themes } = jest.requireActual('../../theme/colors');
  return {
    useApp: () => ({
      theme: themes.light,
      themeName: 'light',
      todayStr: () => '2026-10-17',
      getHabitCount: () => mockCount,
      isHabitDone: () => false,
      isHabitDoneOn: () => false,
      getStreakForHabit: () => 0,
      isHabitSkippedOn: () => false,
      toggleSkipHabitOn: (...a) => mockToggleSkip(...a),
      toggleHabitDoneOn: (...a) => mockToggleDoneOn(...a),
      getNote: () => null,
      setHint: (...a) => mockSetHint(...a),
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
const { announce } = require('../../utils/a11y');
const { secondaryActions } = require('../HabitCard');

global.IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  mockCount = 0;
  mockSetHint.mockClear();
  mockToggleSkip.mockClear();
  mockToggleDoneOn.mockClear();
  const instant = (value, config) => ({ start: (cb) => { value.setValue(config.toValue); cb?.({ finished: true }); }, stop: jest.fn() });
  jest.spyOn(Animated, 'timing').mockImplementation(instant);
  jest.spyOn(Animated, 'spring').mockImplementation(instant);
});
afterEach(() => jest.restoreAllMocks());

const daily = { id: 'h1', name: 'Read', type: 'daily', volumeGoal: 1, createdAt: '2026-01-01' };
const counter = { id: 'h2', name: 'Water', type: 'volume', volumeGoal: 8, unit: 'glasses', createdAt: '2026-01-01' };

const flat = (node) => StyleSheet.flatten(node.props.style);
const byLabel = (r, re) => r.root.findAll(n => typeof n.props.onPressIn === 'function' && re.test(n.props.accessibilityLabel || ''))[0];
const sheet = (r) => r.root.findAll(n => n.type === 'ActionSheet')[0].props;
const more = (r) => r.root.findAll(n => n.props.testID === 'habit-more' && typeof n.props.onPressIn === 'function')[0];
function render(habit) {
  const fns = { onIncrement: jest.fn(), onDecrement: jest.fn(), onNote: jest.fn(), onOpenDetail: jest.fn(), onSkipToggle: jest.fn() };
  let r;
  act(() => { r = TestRenderer.create(<HabitCard habit={habit} {...fns} />); });
  return { r, ...fns };
}

it('every card has a "⋯" named "More options for <habit>", 32 visual, slop to the touch minimum', () => {
  for (const h of [daily, counter]) {
    const b = more(render(h).r);
    expect(b.props.accessibilityLabel).toBe(`More options for ${h.name}`);
    expect(b.props.accessibilityRole).toBe('button');
    expect(flat(b)).toMatchObject({ width: 32, height: 32 });
    // 44 pt here (the jest platform is iOS); 48 dp on Android. Only 4 of the vertical slop is
    // above, so it does not cover the end of a truncated name (review m2).
    const { left, right, top, bottom } = b.props.hitSlop;
    expect(left + right + 32).toBeGreaterThanOrEqual(44);
    expect(top).toBe(4);
    expect(top + bottom + 32).toBeGreaterThanOrEqual(44);
  }
});

it('the "⋯" keeps the sub-line row at the text height, so the card height does not change', () => {
  expect(flat(more(render(daily).r)).marginVertical).toBe(-(32 - 18) / 2);
});

it('a tap on "⋯" opens the options silently; a long press opens them with the haptic', () => {
  const { r } = render(daily);
  expect(sheet(r).visible).toBe(false);
  act(() => { more(r).props.onPress({}); });
  expect(sheet(r)).toMatchObject({ visible: true, haptic: false });
  act(() => { sheet(r).onCancel(); });
  expect(sheet(r).visible).toBe(false);
  act(() => { byLabel(r, /^Read/).props.onLongPress({}); });
  expect(sheet(r)).toMatchObject({ visible: true, haptic: true });
});

it('opening the options marks the long-press tip as seen', () => {
  const { r } = render(daily);
  act(() => { more(r).props.onPress({}); });
  expect(mockSetHint).toHaveBeenCalledWith('longPress');
});

it('options in plan order: skip, yesterday, note, −1 (counters with a count), details', () => {
  expect(sheet(render(daily).r).options.map(o => o.key)).toEqual(['skip', 'yesterday', 'note', 'details']);
  mockCount = 3;
  const opts = sheet(render(counter).r).options;
  expect(opts.map(o => o.key)).toEqual(['skip', 'yesterday', 'note', 'minus', 'details']);
  expect(opts.map(o => o.label)).toEqual(['Skip today (keeps streak)', 'Mark done yesterday', 'Add a note', 'Remove one', 'Habit details']);
  // The note dialog and the detail sheet open once the options sheet has gone.
  expect(opts.filter(o => o.afterClose).map(o => o.key)).toEqual(['note', 'details']);
  // Without a note handler or a detail sheet those rows are left out.
  expect(secondaryActions({ canNote: false, canDetail: false, isCounter: false }).map(a => a.key)).toEqual(['skip', 'yesterday']);
});

it('"Habit details" opens the detail sheet for a daily card too', () => {
  const { r, onOpenDetail } = render(daily);
  act(() => { sheet(r).options.find(o => o.key === 'details').onPress(); });
  expect(onOpenDetail).toHaveBeenCalledWith(daily);
});

it('screen readers get every option as a custom action, plus the long press', () => {
  mockCount = 3;
  const { r, onOpenDetail, onNote, onDecrement, onSkipToggle } = render(counter);
  const card = byLabel(r, /^Water/);
  expect(card.props.accessibilityActions).toEqual([
    { name: 'skip', label: 'Skip today (keeps streak)' },
    { name: 'yesterday', label: 'Mark done yesterday' },
    { name: 'note', label: 'Add a note' },
    { name: 'minus', label: 'Remove one' },
    { name: 'details', label: 'Habit details' },
    { name: 'longpress', label: 'More options' },
  ]);
  const run = (actionName) => act(() => { card.props.onAccessibilityAction({ nativeEvent: { actionName } }); });
  announce.mockClear();
  run('skip');
  expect(mockToggleSkip).toHaveBeenCalledWith('h2', '2026-10-17');
  expect(onSkipToggle).toHaveBeenCalledWith(counter);
  expect(announce).toHaveBeenLastCalledWith('Water skipped today');
  run('yesterday');
  expect(mockToggleDoneOn).toHaveBeenCalledWith('h2', '2026-10-16');
  expect(announce).toHaveBeenLastCalledWith('Water marked done yesterday');
  run('note');
  expect(onNote).toHaveBeenCalledWith(counter, '2026-10-17');
  run('minus');
  expect(onDecrement).toHaveBeenCalledWith(1);
  run('details');
  expect(onOpenDetail).toHaveBeenCalledWith(counter);
  expect(sheet(r).visible).toBe(false);
  run('longpress');
  expect(sheet(r)).toMatchObject({ visible: true, haptic: true });
});
