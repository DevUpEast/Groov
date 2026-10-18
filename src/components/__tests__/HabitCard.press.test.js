// F-06 review m5: HabitCard on the shared pressables. Body tap, long-press options, the disabled
// − (refused, no change) and a long hold on − (options, no refused).
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const { Animated } = require('react-native');

let mockCount = 0;
let mockDone = false;
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
      getStreakForHabit: () => 0,
      isHabitSkippedOn: () => false,
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
jest.mock('@expo/vector-icons', () => ({ Ionicons: (props) => require('react').createElement('Ionicons', props) }));

const HabitCard = require('../HabitCard').default;
const feedback = require('../../services/feedback').default;

global.IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  mockCount = 0;
  mockDone = false;
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

it('the disabled − looks disabled (disabledContainer disc, onDisabled glyph)', () => {
  const { themes } = jest.requireActual('../../theme/colors');
  const { StyleSheet } = require('react-native');
  const { r } = render(counter);
  const minus = byLabel(r, /^Remove/);
  const s = StyleSheet.flatten(minus.props.style);
  expect(s.backgroundColor).toBe(themes.light.disabledContainer);
  const icon = minus.findAll(n => n.type === 'Ionicons')[0];
  expect(icon.props.color).toBe(themes.light.onDisabled);
});
