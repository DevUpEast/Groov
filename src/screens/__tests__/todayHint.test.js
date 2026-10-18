// C-03 review m4: the one-time long-press tip on Today. It shows from the 2nd app open while
// hints.longPress is unset, never on the 1st, never once seen, and "Got it" hides it.
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

const { isGoalMet, justMetGoal, countAfterIncrement, applyMarkRest } = jest.requireActual('../../utils/habits');

const TODAY = '2026-10-18';
let mock;

function mockMakeCtx() {
  const { themes } = jest.requireActual('../../theme/colors');
  const s = mock;
  const satisfied = (h) => isGoalMet(h, s.counts[h.id] || 0);
  return {
    habits: s.habits, dueHabits: s.habits, challenges: s.challenges, effectiveChallenges: s.challenges,
    completions: { [TODAY]: s.counts },
    getCompletedCount: () => s.habits.filter(satisfied).length,
    isAllDone: () => s.habits.every(satisfied),
    incrementHabit: (id, amount = 1) => {
      const h = s.habits.find(x => x.id === id);
      const cur = s.counts[id] || 0;
      if ((h.type === 'daily' || h.type === 'quit') && cur >= 1) return false;
      const next = countAfterIncrement(h, cur, amount);
      s.counts = { ...s.counts, [id]: next };
      return justMetGoal(h, cur, next);
    },
    decrementHabit: (id, amount = 1) => { s.counts = { ...s.counts, [id]: Math.max(0, (s.counts[id] || 0) - amount) }; },
    isHabitSatisfied: satisfied,
    isHabitSatisfiedWith: (h, counts) => isGoalMet(h, (counts || {})[h.id] || 0),
    isChallengeHabitsDone: () => false,
    settings: s.settings,
    setHint: s.setHint,
    theme: themes.light,
    markChallengeDay: s.markChallengeDay,
    unmarkChallengeDay: s.unmarkChallengeDay,
    getHabitCount: (id) => s.counts[id] || 0,
    dateOffset: 0, todayStr: () => TODAY, accountCreatedAt: null, displayName: '', devMode: false,
    completeChallengeImmediately: s.completeChallengeImmediately,
    planMarkRest: () => { const before = s.counts; const { next, changedIds } = applyMarkRest(before, s.habits, [], satisfied); return { before, next, changedIds }; },
    markRestDone: () => {
      const before = s.counts; const { next, changedIds } = applyMarkRest(before, s.habits, [], satisfied);
      s.counts = { ...s.counts, ...Object.fromEntries(changedIds.map(id => [id, 1])) };
      return { before, next, changedIds };
    },
    restoreHabitCounts: jest.fn(),
    getTodayCompletions: () => ({ ...s.counts }),
    pendingChallengeRewards: [], clearPendingChallengeRewards: jest.fn(),
    setRequestedTab: jest.fn(), getNote: () => null, setNote: jest.fn(),
    setModalOpen: s.setModalOpen, openRoute: s.openRoute, pendingRoute: s.pendingRoute,
    pendingMilestone: null, clearPendingMilestone: jest.fn(),
    moods: {}, setMood: jest.fn(),
    themeName: 'light', allHabits: s.habits, getOverallStreak: () => 0,
    habitsOnDay: () => s.habits, isSnapshotHabitDone: () => false, isExcused: () => false, isDayFrozen: () => false,
    getStreakForHabit: () => 0,
    streakNews: null, dismissStreakNews: () => {}, takeBackOnBeat: () => false,
  };
}

jest.mock('../../context/AppContext', () => ({ useApp: () => mockMakeCtx() }));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('../../services/feedback', () => ({
  __esModule: true,
  default: { play: jest.fn(() => ({ cancel: jest.fn() })), toggled: jest.fn() },
  EVENTS: { habitDone: 'habit.done', habitUndone: 'habit.undone', counterStep: 'counter.step', challengeClaimed: 'challenge.claimed', dayComplete: 'day.complete', markRest: 'markRest', milestone: 'milestone', refused: 'refused' },
  logMark: jest.fn(),
  logFrames: jest.fn(),
}));
// Device-local dev flags (C-06a choreography) read AsyncStorage: nothing stored = defaults.
jest.mock('../../utils/storage', () => ({ loadData: jest.fn(() => Promise.resolve(null)), saveData: jest.fn(() => Promise.resolve()) }));
jest.mock('../../utils/a11y', () => ({
  ...jest.requireActual('../../utils/a11y'),
  announce: jest.fn(),
}));
jest.mock('../../services/aiCoaching', () => ({ fetchDailyNudge: jest.fn(() => Promise.resolve(null)) }));
jest.mock('../../services/review', () => ({ maybeRequestReview: jest.fn() }));
jest.mock('react-native-svg', () => {
  const R = require('react');
  const C = (name) => (props) => R.createElement(name, props);
  return { __esModule: true, default: C('Svg'), Path: C('Path'), Rect: C('Rect'), Circle: C('Circle') };
});
const mockStub = (name) => () => (props) => require('react').createElement(name, props, props.children);
jest.mock('../../components/SafeAreaView', () => mockStub('SafeAreaView')());
jest.mock('../../components/HabitCard', () => mockStub('HabitCard')());
jest.mock('../../components/EmptyCard', () => mockStub('EmptyCard')());
jest.mock('../../components/ProgressRing', () => mockStub('ProgressRing')());
jest.mock('../../components/CompletionCelebration', () => mockStub('CompletionCelebration')());
jest.mock('../../components/TrophyCelebration', () => mockStub('TrophyCelebration')());
jest.mock('../../components/ChallengeRewardModal', () => mockStub('ChallengeRewardModal')());
jest.mock('../../components/UndoToast', () => mockStub('UndoToast')());
jest.mock('../../components/ui/Button', () => mockStub('Button')());
jest.mock('../../components/ui/PressableScale', () => ({ __esModule: true, default: mockStub('PressableScale')(), hitSlopFor: () => ({}) }));
jest.mock('../../components/ui/Dialog', () => mockStub('Dialog')());
jest.mock('../../components/NoteModal', () => mockStub('NoteModal')());
jest.mock('../../components/HabitDetailSheet', () => mockStub('HabitDetailSheet')());
jest.mock('../../components/MoodCheckIn', () => mockStub('MoodCheckIn')());

const TodayScreen = require('../TodayScreen').default;
const deviceSettings = require('../../utils/deviceSettings');

global.IS_REACT_ACT_ENVIRONMENT = true;

const read = { id: 'r', name: 'Read', type: 'daily', volumeGoal: 1, createdAt: '2026-01-01' };

function setup({ appOpens, hints = {}, habits = [read] }) {
  deviceSettings.__resetDeviceSettingsForTests();
  if (appOpens != null) deviceSettings.setDeviceSettings({ appOpens });
  mock = {
    habits, counts: {}, challenges: [], pendingRoute: null,
    settings: { skips: {}, extras: { hints } },
    setModalOpen: jest.fn(), openRoute: jest.fn(), completeChallengeImmediately: jest.fn(),
    markChallengeDay: jest.fn(), unmarkChallengeDay: jest.fn(),
    setHint: jest.fn((id) => { mock.settings = { ...mock.settings, extras: { hints: { ...mock.settings.extras.hints, [id]: true } } }; }),
  };
  let r;
  act(() => { r = TestRenderer.create(<TodayScreen />); });
  const rerender = () => act(() => { r.update(<TodayScreen />); });
  const hint = () => r.root.findAll(n => n.props.testID === 'hint-longpress')[0];
  return { r, rerender, hint };
}

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { act(() => { jest.runOnlyPendingTimers(); }); jest.useRealTimers(); });

it('no tip on the 1st open', () => {
  expect(setup({ appOpens: 1 }).hint()).toBeUndefined();
  expect(setup({ appOpens: undefined }).hint()).toBeUndefined();
});

it('the tip shows from the 2nd open, above the first card, and "Got it" hides it for good', () => {
  const t = setup({ appOpens: 2 });
  const hint = t.hint();
  expect(hint).toBeTruthy();
  const text = hint.findAll(n => n.props.accessibilityLabel && /press and hold/.test(n.props.accessibilityLabel))[0];
  expect(text.props.children).toBe('Tip: press and hold a habit (or tap ⋯) to skip a day, fix yesterday or add a note.');
  // It comes before the first card in the tree.
  const all = t.r.root.findAll(n => n.props.testID === 'hint-longpress' || n.type === 'HabitCard', { deep: true });
  expect(all[0].props.testID).toBe('hint-longpress');
  const gotIt = hint.findAll(n => n.type === 'Button')[0];
  expect(gotIt.props.label).toBe('Got it');
  act(() => { gotIt.props.onPress(); });
  expect(mock.setHint).toHaveBeenCalledWith('longPress');
  t.rerender();
  expect(t.hint()).toBeUndefined();
});

it('never once seen, and never without a card to try it on', () => {
  expect(setup({ appOpens: 5, hints: { longPress: true } }).hint()).toBeUndefined();
  expect(setup({ appOpens: 5, habits: [] }).hint()).toBeUndefined();
});
