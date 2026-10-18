// C-02b review M1: today's cell in the detail sheet never writes today's count itself. With an
// `onSetToday` (Today) it hands the value to the host's check-off handlers; without one (the
// Habits tab) it only explains where to log today. Past days stay history edits.
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const { Alert } = require('react-native');

const TODAY = '2026-10-18';
const YESTERDAY = '2026-10-17';
const mockSetHabitCountOn = jest.fn();
const mockToggleHabitDoneOn = jest.fn();
let mockCompletions = {};

jest.mock('../../context/AppContext', () => {
  const { themes } = jest.requireActual('../../theme/colors');
  return {
    useApp: () => ({
      theme: themes.light,
      todayStr: () => '2026-10-18',
      completions: mockCompletions,
      isHabitDoneOn: (h, k) => ((mockCompletions[k] || {})[h.id] || 0) >= h.volumeGoal,
      getStreakForHabit: () => 0,
      isExcused: () => false,
      toggleHabitDoneOn: mockToggleHabitDoneOn,
      setHabitCountOn: mockSetHabitCountOn,
      accountCreatedAt: '2026-01-01',
      isHabitSkippedOn: () => false,
    }),
  };
});
jest.mock('../../services/feedback', () => ({ __esModule: true, default: { play: jest.fn() }, EVENTS: { habitDone: 'habit.done', habitUndone: 'habit.undone' } }));
jest.mock('../BottomSheet', () => (props) => require('react').createElement('BottomSheet', props, props.children));
jest.mock('../SheetHeader', () => ({ SheetDragHandle: () => null }));
jest.mock('../HabitIcon', () => () => null);

const HabitDetailSheet = require('../HabitDetailSheet').default;

global.IS_REACT_ACT_ENVIRONMENT = true;

const water = { id: 'w', name: 'Drink water', type: 'volume', volumeGoal: 8, unit: 'glasses', createdAt: '2026-01-01' };
const read = { id: 'r', name: 'Read', type: 'daily', volumeGoal: 1, createdAt: '2026-01-01' };

function render(habit, props = {}) {
  let r;
  act(() => { r = TestRenderer.create(<HabitDetailSheet habit={habit} onClose={jest.fn()} {...props} />); });
  return r;
}
const cell = (r, key) => r.root.findAll(n => typeof n.props.onPress === 'function' && (n.props.accessibilityLabel || '').startsWith(`${key}:`))[0];
// Press the Alert button whose text matches.
const pressAlert = (re) => {
  const buttons = Alert.alert.mock.calls.at(-1)[2];
  act(() => { buttons.find(b => re.test(b.text)).onPress?.(); });
};

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockSetHabitCountOn.mockClear();
  mockToggleHabitDoneOn.mockClear();
  mockCompletions = { [TODAY]: { w: 3 }, [YESTERDAY]: { w: 2 } };
});
afterEach(() => jest.restoreAllMocks());

it('on Today, a counter\'s "Set done" and "Clear" go to onSetToday, never setHabitCountOn', () => {
  const onSetToday = jest.fn();
  const r = render(water, { onSetToday });
  act(() => { cell(r, TODAY).props.onPress(); });
  pressAlert(/^Set 8/);
  expect(onSetToday).toHaveBeenCalledWith(water, 8);
  act(() => { cell(r, TODAY).props.onPress(); });
  pressAlert(/^Clear/);
  expect(onSetToday).toHaveBeenLastCalledWith(water, 0);
  expect(mockSetHabitCountOn).not.toHaveBeenCalled();
});

it('on Today, a daily habit\'s cell toggles through onSetToday', () => {
  const onSetToday = jest.fn();
  const r = render(read, { onSetToday });
  act(() => { cell(r, TODAY).props.onPress(); });
  expect(onSetToday).toHaveBeenCalledWith(read, 1);
  expect(mockToggleHabitDoneOn).not.toHaveBeenCalled();
});

it('without onSetToday (Habits tab), today\'s cell changes nothing and says where to log it', () => {
  const r = render(water);
  act(() => { cell(r, TODAY).props.onPress(); });
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  expect(Alert.alert.mock.calls[0][1]).toBe("Log today's progress on the Today tab.");
  expect(mockSetHabitCountOn).not.toHaveBeenCalled();
  const daily = render(read);
  act(() => { cell(daily, TODAY).props.onPress(); });
  expect(mockToggleHabitDoneOn).not.toHaveBeenCalled();
});

it('past days stay history edits in both hosts', () => {
  const onSetToday = jest.fn();
  const r = render(water, { onSetToday });
  act(() => { cell(r, YESTERDAY).props.onPress(); });
  pressAlert(/^Set 8/);
  expect(mockSetHabitCountOn).toHaveBeenCalledWith('w', YESTERDAY, 8);
  expect(onSetToday).not.toHaveBeenCalled();
});
