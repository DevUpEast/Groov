// C-08 r2 emulator finding: a milestone queued by Mark the rest must not show (or stay up) once Undo
// has taken the streak back below it; AppContext takes the record back, and Today drops the screen.
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
    pendingMilestone: s.pendingMilestone || null, clearPendingMilestone: () => { s.pendingMilestone = null; },
    moods: {}, setMood: jest.fn(),
    themeName: 'light', allHabits: s.habits, getOverallStreak: () => s.streak || 0,
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
// The Snackbar host (C-10): a recording fake; `mockItems` holds every item shown.
jest.mock('../../components/ui/Snackbar', () => {
  const items = [];
  const api = { show: (it) => { items.push(it); return items.length; }, dismiss: () => false };
  return { __esModule: true, mockItems: items, useSnackbar: () => api, useSnackbarInset: () => 0 };
});
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
const SEVEN = { days: 7, icon: 'flame', label: 'One week' };

function setup({ streak, pendingMilestone }) {
  deviceSettings.__resetDeviceSettingsForTests();
  mock = {
    habits: [read], counts: { r: 1 }, challenges: [], pendingRoute: null, streak, pendingMilestone,
    settings: { skips: {}, extras: { hints: { longPress: true } } },
    setModalOpen: jest.fn(), openRoute: jest.fn(), completeChallengeImmediately: jest.fn(),
    markChallengeDay: jest.fn(), unmarkChallengeDay: jest.fn(), setHint: jest.fn(),
  };
  let r;
  act(() => { r = TestRenderer.create(<TodayScreen />); });
  const rerender = () => act(() => { r.update(<TodayScreen />); });
  const celebration = () => r.root.findByType('CompletionCelebration').props;
  return { r, rerender, celebration };
}

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('a queued 7 shows while the streak is 7', () => {
  const { r, celebration } = setup({ streak: 7, pendingMilestone: SEVEN });
  act(() => { jest.advanceTimersByTime(3000); });
  expect(celebration().visible).toBe(true);
  expect(celebration().milestone.days).toBe(7);
  act(() => r.unmount());
});

test('a queued 7 is dropped when Undo has already taken the streak back to 6', () => {
  const { r, celebration } = setup({ streak: 6, pendingMilestone: SEVEN });
  act(() => { jest.advanceTimersByTime(3000); });
  expect(celebration().visible).toBe(false);
  act(() => r.unmount());
});

test('the screen closes when an Undo lands after it opened', () => {
  const { r, rerender, celebration } = setup({ streak: 7, pendingMilestone: SEVEN });
  act(() => { jest.advanceTimersByTime(3000); });
  expect(celebration().visible).toBe(true);
  mock.streak = 6;
  rerender();
  expect(celebration().visible).toBe(false);
  act(() => r.unmount());
});
