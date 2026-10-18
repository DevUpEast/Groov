// C-09: Today's side of the forgiveness moments: the one-time card from AppContext.streakNews and
// "Back on beat." on the first check-off after a reset (tone rule 3: only after the user acts).
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
    streakNews: s.streakNews || null, dismissStreakNews: s.dismissStreakNews, takeBackOnBeat: s.takeBackOnBeat,
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

const TodayHeader = require('../../components/TodayHeader').default;
const StreakNewsCard = require('../../components/StreakNewsCard').default;
const { announce } = require('../../utils/a11y');
const { beat } = require('../../theme/motion');

const read = { id: 'r', name: 'Read', type: 'daily', volumeGoal: 1, createdAt: '2026-01-01' };
const walk = { id: 'w', name: 'Walk', type: 'daily', volumeGoal: 1, createdAt: '2026-01-01' };

function setup({ streakNews = null, back = false } = {}) {
  deviceSettings.__resetDeviceSettingsForTests();
  let armed = back;
  mock = {
    habits: [read, walk], counts: {}, challenges: [], pendingRoute: null, streak: 0, streakNews,
    settings: { skips: {}, extras: { hints: { longPress: true } } },
    setModalOpen: jest.fn(), openRoute: jest.fn(), completeChallengeImmediately: jest.fn(),
    markChallengeDay: jest.fn(), unmarkChallengeDay: jest.fn(), setHint: jest.fn(),
    dismissStreakNews: jest.fn(() => { mock.streakNews = null; }),
    takeBackOnBeat: jest.fn(() => { const was = armed; armed = false; return was; }),
  };
  let r;
  act(() => { r = TestRenderer.create(<TodayScreen />); });
  const rerender = () => act(() => { r.update(<TodayScreen />); });
  const header = () => r.root.findByType(TodayHeader).props;
  const check = (id) => act(() => { r.root.findAll(n => n.type === 'HabitCard' && n.props.habit.id === id)[0].props.onIncrement(1); });
  return { r, rerender, header, check };
}

beforeEach(() => { jest.useFakeTimers(); announce.mockClear(); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('a reset card shows above the habits and dismisses through AppContext', () => {
  const news = { kind: 'reset', ended: 12, date: TODAY };
  const { r } = setup({ streakNews: news });
  const card = r.root.findByType(StreakNewsCard);
  expect(card.props.news).toBe(news);
  expect(card.props.canStart).toBe(true);
  act(() => card.props.onDismiss());
  expect(mock.dismissStreakNews).toHaveBeenCalled();
  act(() => r.unmount());
});

test("Start today's first habit dismisses the card and names the first habit", () => {
  const { r } = setup({ streakNews: { kind: 'reset', ended: 12, date: TODAY } });
  const card = r.root.findByType(StreakNewsCard);
  act(() => card.props.onStart());
  expect(mock.dismissStreakNews).toHaveBeenCalled();
  expect(announce).toHaveBeenCalledWith('First up: Read');
  act(() => r.unmount());
});

test('once a habit is done today the reset card offers "Got it" instead (review m2)', () => {
  const { r, rerender } = setup({ streakNews: { kind: 'reset', ended: 12, date: TODAY } });
  mock.counts = { w: 1 };
  rerender();
  expect(r.root.findByType(StreakNewsCard).props.canStart).toBe(false);
  act(() => r.unmount());
});

test('no card without news', () => {
  const { r } = setup();
  expect(r.root.findAllByType(StreakNewsCard)).toHaveLength(0);
  act(() => r.unmount());
});

test('the first check-off after a reset says "Back on beat." once, on the strip, after the check lands', () => {
  const { r, header, check, rerender } = setup({ streakNews: { kind: 'reset', ended: 12, date: TODAY }, back: true });
  check('r');
  rerender();
  // The card has done its job once the user has started.
  expect(mock.dismissStreakNews).toHaveBeenCalled();
  expect(header().banner).toBeNull();
  act(() => { jest.advanceTimersByTime(beat.b4); });
  expect(header().banner).toMatchObject({ icon: 'musical-notes', text: 'Back on beat.' });
  expect(announce).toHaveBeenCalledWith('Back on beat.');
  // The next check-off says nothing more.
  announce.mockClear();
  check('w');
  act(() => { jest.advanceTimersByTime(beat.b4); });
  expect(announce).not.toHaveBeenCalledWith('Back on beat.');
  act(() => r.unmount());
});

test('without a reset, a check-off never says "Back on beat."', () => {
  const { r, header, check } = setup();
  check('r');
  act(() => { jest.advanceTimersByTime(1000); });
  expect(header().banner).toBeNull();
  expect(announce).not.toHaveBeenCalledWith('Back on beat.');
  act(() => r.unmount());
});
