// C-02b review: the habit detail sheet on Today. Its state (open, close, swipe lock, a habit
// that vanishes, a link to another tab) and today's cell going through Today's own check-off
// handlers (M1): a set-done claims the challenge day; clearing a met counter un-claims it and
// cancels a queued Mark-the-rest completion.
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
    settings: { skips: {} },
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
  };
}

jest.mock('../../context/AppContext', () => ({ useApp: () => mockMakeCtx() }));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('../../services/feedback', () => ({
  __esModule: true,
  default: { play: jest.fn(() => ({ cancel: jest.fn() })), toggled: jest.fn() },
  EVENTS: { habitDone: 'habit.done', habitUndone: 'habit.undone', counterStep: 'counter.step', challengeClaimed: 'challenge.claimed', dayComplete: 'day.complete', markRest: 'markRest', milestone: 'milestone', refused: 'refused' },
}));
// Device-local dev flags (C-06a choreography) read AsyncStorage: nothing stored = defaults.
jest.mock('../../utils/storage', () => ({ loadData: jest.fn(() => Promise.resolve(null)), saveData: jest.fn(() => Promise.resolve()) }));
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
jest.mock('../../components/CelebrationOverlay', () => mockStub('CelebrationOverlay')());
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
const feedback = require('../../services/feedback').default;

global.IS_REACT_ACT_ENVIRONMENT = true;

const water = { id: 'w', name: 'Drink water', type: 'volume', volumeGoal: 8, unit: 'glasses', createdAt: '2026-01-01' };
const read = { id: 'r', name: 'Read', type: 'daily', volumeGoal: 1, createdAt: '2026-01-01' };
const challenge = (over) => ({ id: 'c1', name: 'Kickstart', description: '', days: 3, icon: '🏁', completedDays: [], completed: false, startDate: TODAY, linkedHabitIds: ['w'], ...over });

function setup({ habits, counts = {}, challenges = [] }) {
  mock = {
    habits, counts, challenges, pendingRoute: null,
    setModalOpen: jest.fn(), openRoute: jest.fn(), completeChallengeImmediately: jest.fn(),
    markChallengeDay: jest.fn((id) => { mock.challenges = mock.challenges.map(c => (c.id === id ? { ...c, completedDays: [...c.completedDays, TODAY] } : c)); }),
    unmarkChallengeDay: jest.fn((id) => { mock.challenges = mock.challenges.map(c => (c.id === id ? { ...c, completedDays: c.completedDays.filter(d => d !== TODAY) } : c)); }),
  };
  let r;
  act(() => { r = TestRenderer.create(<TodayScreen />); });
  const rerender = () => act(() => { r.update(<TodayScreen />); });
  const sheet = () => r.root.findAll(n => n.type === 'HabitDetailSheet')[0].props;
  const card = (id) => r.root.findAll(n => n.type === 'HabitCard' && n.props.habit.id === id)[0].props;
  return { r, rerender, sheet, card };
}
const lastModalOpen = () => mock.setModalOpen.mock.calls.at(-1)?.[0];

beforeEach(() => { jest.useFakeTimers(); feedback.play.mockClear(); });
afterEach(() => { act(() => { jest.runOnlyPendingTimers(); }); jest.useRealTimers(); });

describe('Today detail sheet state', () => {
  it('a counter card opens the sheet on Today (no route, no tab) and locks the swipe; close releases it', () => {
    const t = setup({ habits: [water] });
    expect(t.sheet().habit).toBeNull();
    expect(t.card('w').onOpenDetail).toEqual(expect.any(Function));
    act(() => { t.card('w').onOpenDetail(water); });
    expect(t.sheet().habit).toEqual(water);
    expect(lastModalOpen()).toBe(true);
    expect(mock.openRoute).not.toHaveBeenCalled();
    act(() => { t.sheet().onClose(); });
    expect(t.sheet().habit).toBeNull();
    expect(lastModalOpen()).toBe(false);
  });

  it('Edit from the sheet routes to the Habits form through openRoute', () => {
    const t = setup({ habits: [water] });
    act(() => { t.card('w').onOpenDetail(water); });
    act(() => { t.sheet().onEdit(water); });
    expect(mock.openRoute).toHaveBeenCalledWith({ tab: 3, habitId: 'w', action: 'edit' });
  });

  it('a habit that vanishes while the sheet is open clears the sheet and releases the swipe lock (m1)', () => {
    const t = setup({ habits: [water, read] });
    act(() => { t.card('w').onOpenDetail(water); });
    expect(lastModalOpen()).toBe(true);
    mock.habits = [read];
    t.rerender();
    expect(t.sheet().habit).toBeNull();
    expect(lastModalOpen()).toBe(false);
    // Coming back does not reopen it.
    mock.habits = [water, read];
    t.rerender();
    expect(t.sheet().habit).toBeNull();
  });

  it('a link to another tab drops the sheet', () => {
    const t = setup({ habits: [water] });
    act(() => { t.card('w').onOpenDetail(water); });
    mock.pendingRoute = { tab: 2 };
    t.rerender();
    expect(t.sheet().habit).toBeNull();
  });
});

describe("today's cell goes through Today's handlers (M1)", () => {
  it('set-done claims the linked challenge day and plays the check-off feedback', () => {
    const t = setup({ habits: [water], counts: { w: 3 }, challenges: [challenge()] });
    act(() => { t.card('w').onOpenDetail(water); });
    act(() => { t.sheet().onSetToday(water, 8); });
    expect(mock.counts.w).toBe(8);
    expect(mock.markChallengeDay).toHaveBeenCalledWith('c1');
    expect(feedback.play).toHaveBeenCalledWith('habit.done', expect.anything());
  });

  it('a timed "Set 20 (done)" logs the session through the same path', () => {
    const timed = { id: 's', name: 'Stretch', type: 'timed', volumeGoal: 20, createdAt: '2026-01-01' };
    const t = setup({ habits: [timed], challenges: [challenge({ linkedHabitIds: ['s'] })] });
    act(() => { t.sheet().onSetToday(timed, 20); });
    expect(mock.counts.s).toBe(20);
    expect(mock.markChallengeDay).toHaveBeenCalledWith('c1');
  });

  it('clearing a met counter un-claims the day and cancels a queued Mark-the-rest completion', () => {
    // The last day of a 1-day challenge on Read + Water: Mark the rest claims it and queues
    // the completion for its undo window.
    const t = setup({ habits: [read, water], counts: { w: 8 }, challenges: [challenge({ days: 1, linkedHabitIds: ['r', 'w'] })] });
    const markRest = t.r.root.findAll(n => n.type === 'PressableScale' && n.props.onPress && n.props.accessibilityRole === 'button' && !n.props.accessibilityLabel)[0]; // the header chips are labelled buttons
    act(() => { markRest.props.onPress(); });
    expect(mock.markChallengeDay).toHaveBeenCalledWith('c1');
    t.rerender();
    // From the sheet: clear today's water.
    act(() => { t.sheet().onSetToday(water, 0); });
    expect(mock.counts.w).toBe(0);
    expect(mock.unmarkChallengeDay).toHaveBeenCalledWith('c1');
    expect(feedback.play).toHaveBeenCalledWith('habit.undone', expect.objectContaining({ delay: 0 }));
    // The undo window closes: the cancelled completion never runs.
    t.rerender();
    const toast = t.r.root.findAll(n => n.type === 'UndoToast')[0];
    act(() => { toast.props.onHide(); });
    act(() => { jest.runOnlyPendingTimers(); });
    expect(mock.completeChallengeImmediately).not.toHaveBeenCalled();
  });

  it('a daily habit toggles through the handlers too, and an unchanged count does nothing', () => {
    const t = setup({ habits: [read, water], challenges: [challenge({ linkedHabitIds: ['r'] })] });
    act(() => { t.sheet().onSetToday(read, 1); });
    expect(mock.counts.r).toBe(1);
    expect(mock.markChallengeDay).toHaveBeenCalledWith('c1');
    feedback.play.mockClear();
    act(() => { t.sheet().onSetToday(read, 1); });
    expect(feedback.play).not.toHaveBeenCalled();
  });
});
