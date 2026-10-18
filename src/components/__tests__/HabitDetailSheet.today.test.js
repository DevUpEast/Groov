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
// The Sheet mock renders the header function too, so the header's Edit button can be pressed.
jest.mock('../ui/Sheet', () => ({
  __esModule: true,
  default: (props) => require('react').createElement('Sheet', props,
    typeof props.header === 'function' ? props.header({ close: props.onClose, titleRef: null }) : props.header, props.children),
}));
jest.mock('../ui/Button', () => (props) => require('react').createElement('Button', props));
jest.mock('../ui/IconButton', () => () => null);
jest.mock('../ui/SectionLabel', () => () => null);
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
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
const cell = (r, key) => r.root.findAll(n => typeof n.props.onPress === 'function' && n.props.testID === `cell-${key}`)[0];
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

// F-09a review M1 / m1: the Edit hand-off runs after the sheet has gone, in order, and a
// scrim tap or back press during the exit does not drop it.
describe('close(then) and the Edit hand-off', () => {
  const sheetOf = (r) => r.root.findAll(n => n.type === 'Sheet')[0];
  const editOf = (r) => r.root.findAll(n => n.type === 'Button' && n.props.label === 'Edit')[0];

  it('Edit closes the sheet, then onClose, then onEdit, once the sheet is dismissed', () => {
    const order = [];
    const onClose = jest.fn(() => order.push('close'));
    const onEdit = jest.fn(() => order.push('edit'));
    const r = render(read, { onClose, onEdit });
    expect(sheetOf(r).props.visible).toBe(true);
    act(() => { editOf(r).props.onPress(); });
    expect(sheetOf(r).props.visible).toBe(false);
    expect(order).toEqual([]); // nothing until the exit has finished
    act(() => { sheetOf(r).props.onDismiss(); });
    expect(order).toEqual(['close', 'edit']);
    expect(onEdit).toHaveBeenCalledWith(read);
  });

  it('a scrim tap or back press during the exit keeps the pending Edit (m1)', () => {
    const onClose = jest.fn();
    const onEdit = jest.fn();
    const r = render(read, { onClose, onEdit });
    act(() => { editOf(r).props.onPress(); });
    act(() => { sheetOf(r).props.onClose(); }); // scrim / back through Sheet's requestClose
    act(() => { sheetOf(r).props.onClose(); });
    act(() => { sheetOf(r).props.onDismiss(); });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('passes returnFocusRef through to the Sheet', () => {
    const ref = { current: null };
    const r = render(read, { returnFocusRef: ref });
    expect(sheetOf(r).props.returnFocusRef).toBe(ref);
  });
});

// m3: the spoken state follows the drawn one.
describe('cell accessibility labels', () => {
  const label = (r, key) => cell(r, key).props.accessibilityLabel;
  it('a partly logged counter day says "partly done" with its count', () => {
    const r = render(water);
    expect(label(r, YESTERDAY)).toMatch(/partly done, 2 of 8$/);
  });
  it('a done counter day says done with its count; an untouched one says missed', () => {
    mockCompletions = { [YESTERDAY]: { w: 8 } };
    const r = render(water);
    expect(label(r, YESTERDAY)).toMatch(/done, 8 of 8$/);
    expect(label(r, '2026-10-16')).toMatch(/: missed$/);
  });
});
