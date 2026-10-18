// C-10: the Snackbar on Today, through the real host (ui/Snackbar): Mark the rest (S-02
// semantics: the 8 s window, touch pause, Undo, background), skip / unskip, "−1" from the
// options and a counter reset from the detail sheet, each with an exact Undo; no snackbar for a
// single check.
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
    restoreHabitCounts: s.restoreHabitCounts, setSkipHabitOn: s.setSkipHabitOn,
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
jest.mock('../../components/ui/Button', () => mockStub('Button')());
jest.mock('../../components/ui/PressableScale', () => ({ __esModule: true, default: mockStub('PressableScale')(), hitSlopFor: () => ({}) }));
jest.mock('../../components/ui/Dialog', () => mockStub('Dialog')());
jest.mock('../../components/NoteModal', () => mockStub('NoteModal')());
jest.mock('../../components/HabitDetailSheet', () => mockStub('HabitDetailSheet')());
jest.mock('../../components/MoodCheckIn', () => mockStub('MoodCheckIn')());

const TodayScreen = require('../TodayScreen').default;
const feedback = require('../../services/feedback').default;
const a11y = require('../../utils/a11y');

global.IS_REACT_ACT_ENVIRONMENT = true;

const water = { id: 'w', name: 'Drink water', type: 'volume', volumeGoal: 8, unit: 'glasses', createdAt: '2026-01-01' };
const read = { id: 'r', name: 'Read', type: 'daily', volumeGoal: 1, createdAt: '2026-01-01' };
const challenge = (over) => ({ id: 'c1', name: 'Kickstart', description: '', days: 3, icon: '🏁', completedDays: [], completed: false, startDate: TODAY, linkedHabitIds: ['w'], ...over });

const { AppState } = require('react-native');
const { SnackbarProvider, SnackbarView } = require('../../components/ui/Snackbar');
const { themes } = require('../../theme/colors');

let appStateListeners;
function setup({ habits, counts = {}, challenges = [] }) {
  mock = {
    habits, counts, challenges, pendingRoute: null,
    setModalOpen: jest.fn(), openRoute: jest.fn(), completeChallengeImmediately: jest.fn(),
    markChallengeDay: jest.fn((id) => { mock.challenges = mock.challenges.map(c => (c.id === id ? { ...c, completedDays: [...c.completedDays, TODAY] } : c)); }),
    unmarkChallengeDay: jest.fn((id) => { mock.challenges = mock.challenges.map(c => (c.id === id ? { ...c, completedDays: c.completedDays.filter(d => d !== TODAY) } : c)); }),
    restoreHabitCounts: jest.fn((before, changedIds) => { changedIds.forEach((id) => { mock.counts = { ...mock.counts, [id]: (before || {})[id] || 0 }; }); }),
    setSkipHabitOn: jest.fn(),
  };
  const tree = () => (
    <SnackbarProvider>
      <TodayScreen />
      <SnackbarView theme={themes.light} />
    </SnackbarProvider>
  );
  let r;
  act(() => { r = TestRenderer.create(tree()); });
  const rerender = () => act(() => { r.update(tree()); });
  const card = (id) => r.root.findAll(n => n.type === 'HabitCard' && n.props.habit.id === id)[0].props;
  const sheet = () => r.root.findAll(n => n.type === 'HabitDetailSheet')[0].props;
  const bar = () => r.root.findAll(n => n.props.testID === 'snackbar')[0] || null;
  const message = () => {
    const b = bar();
    if (!b) return null;
    return b.findAll(n => typeof n.props.children === 'string' && n.props.variant === 'callout')[0]?.props.children;
  };
  const undo = () => {
    const b = bar().findAll(n => n.type === 'PressableScale' && n.props.accessibilityLabel === 'Undo')[0];
    act(() => { b.props.onPress(); });
    rerender();
  };
  const markRestBtn = () => r.root.findAll(n => n.type === 'PressableScale' && n.props.onPress && n.props.accessibilityRole === 'button' && !n.props.accessibilityLabel)[0];
  const touch = (on) => {
    const surface = bar().findAll(n => typeof n.props.onTouchStart === 'function')[0];
    act(() => { (on ? surface.props.onTouchStart : surface.props.onTouchEnd)(); });
  };
  const advance = (ms) => act(() => { jest.advanceTimersByTime(ms); });
  return { r, rerender, card, sheet, bar, message, undo, markRestBtn, touch, advance };
}

beforeEach(() => {
  jest.useFakeTimers();
  feedback.play.mockClear();
  a11y.announce.mockClear();
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
    appStateListeners.push(fn);
    return { remove: () => { appStateListeners = appStateListeners.filter(f => f !== fn); } };
  });
});
afterEach(() => { act(() => { jest.runOnlyPendingTimers(); }); jest.useRealTimers(); jest.restoreAllMocks(); });

const lastDay = (linked) => challenge({ days: 1, linkedHabitIds: linked });

describe('C-10 Snackbar on Today', () => {
  it('(a) a single check shows no snackbar', () => {
    const t = setup({ habits: [read, water] });
    act(() => { t.card('r').onIncrement(1); });
    t.rerender();
    expect(t.bar()).toBeNull();
  });

  it('(b) Mark the rest shows its snackbar for 8 s; a touch pauses it, and the queued completion waits for it', () => {
    const t = setup({ habits: [read, water], counts: { w: 8 }, challenges: [lastDay(['r', 'w'])] });
    act(() => { t.markRestBtn().props.onPress(); });
    t.rerender();
    expect(t.message()).toBe('Marked 1 habit done');
    expect(a11y.announce).toHaveBeenCalledWith('Marked 1 habit done');
    expect(mock.markChallengeDay).toHaveBeenCalledWith('c1');
    t.advance(3000);
    t.touch(true);
    t.advance(20000); // held: never hides
    expect(t.bar()).not.toBeNull();
    expect(mock.completeChallengeImmediately).not.toHaveBeenCalled();
    t.touch(false);
    t.advance(4900); // 5 s were left
    expect(mock.completeChallengeImmediately).not.toHaveBeenCalled();
    t.advance(200);
    expect(mock.completeChallengeImmediately).toHaveBeenCalledWith('c1', TODAY);
  });

  it('Mark the rest Undo (S-02): restores the counts it changed and un-marks its claim; nothing completes', () => {
    const t = setup({ habits: [read, water], counts: { w: 8 }, challenges: [lastDay(['r', 'w'])] });
    act(() => { t.markRestBtn().props.onPress(); });
    t.rerender();
    t.undo();
    expect(mock.restoreHabitCounts).toHaveBeenCalledWith({ w: 8 }, ['r'], TODAY);
    expect(mock.unmarkChallengeDay).toHaveBeenCalledWith('c1', TODAY);
    expect(mock.counts).toEqual({ w: 8, r: 0 });
    expect(a11y.announce).toHaveBeenLastCalledWith('Undone');
    t.advance(20000);
    expect(mock.completeChallengeImmediately).not.toHaveBeenCalled();
  });

  it('backgrounding ends the Mark-the-rest window: the snackbar goes and the completion runs', () => {
    const t = setup({ habits: [read, water], counts: { w: 8 }, challenges: [lastDay(['r', 'w'])] });
    act(() => { t.markRestBtn().props.onPress(); });
    t.rerender();
    act(() => { appStateListeners.slice().forEach(fn => fn('background')); });
    expect(mock.completeChallengeImmediately).toHaveBeenCalledWith('c1', TODAY);
    act(() => { jest.runOnlyPendingTimers(); });
    t.rerender();
    expect(t.bar()).toBeNull();
  });

  it('a newer snackbar replaces Mark the rest, which closes its window (the completion runs)', () => {
    const move = { ...read, id: 'm', name: 'Move' };
    const t = setup({ habits: [read, water, move], counts: { w: 8, m: 1 }, challenges: [lastDay(['r', 'w'])] });
    act(() => { t.markRestBtn().props.onPress(); });
    t.rerender();
    expect(mock.completeChallengeImmediately).not.toHaveBeenCalled();
    act(() => { t.card('m').onSkip(move, false); });
    t.rerender();
    expect(t.message()).toBe('Move no longer skipped today');
    expect(mock.completeChallengeImmediately).toHaveBeenCalledWith('c1', TODAY);
  });

  it('skip: the skip lands with a snackbar, and Undo sets it back for the same day', () => {
    const t = setup({ habits: [read, water] });
    act(() => { t.card('r').onSkip(read, true); });
    t.rerender();
    expect(mock.setSkipHabitOn).toHaveBeenLastCalledWith('r', TODAY, true);
    expect(t.message()).toBe('Read skipped today');
    t.undo();
    expect(mock.setSkipHabitOn).toHaveBeenLastCalledWith('r', TODAY, false, { undo: true });
  });

  it('unskip: Undo skips it again', () => {
    const t = setup({ habits: [read, water] });
    act(() => { t.card('r').onSkip(read, false); });
    t.rerender();
    expect(t.message()).toBe('Read no longer skipped today');
    t.undo();
    expect(mock.setSkipHabitOn).toHaveBeenLastCalledWith('r', TODAY, true, { undo: true });
  });

  it('"−1" from the options: the count drops, and Undo adds it back through the check-off path', () => {
    const t = setup({ habits: [read, water], counts: { w: 8 }, challenges: [challenge({ linkedHabitIds: ['w'], completedDays: [TODAY] })] });
    act(() => { t.card('w').onMenuMinus(water, 1); });
    t.rerender();
    expect(mock.counts.w).toBe(7);
    expect(mock.unmarkChallengeDay).toHaveBeenCalledWith('c1');
    expect(t.message()).toBe('Removed 1 from Drink water');
    t.undo();
    expect(mock.counts.w).toBe(8);
    expect(mock.markChallengeDay).toHaveBeenCalledWith('c1');
  });

  it('a counter cleared from the detail sheet is a reset: Undo puts the count back', () => {
    const t = setup({ habits: [read, water], counts: { w: 5 } });
    act(() => { t.sheet().onSetToday(water, 0); });
    t.rerender();
    expect(mock.counts.w).toBe(0);
    expect(t.message()).toBe('Drink water cleared for today');
    t.undo();
    expect(mock.counts.w).toBe(5);
  });

  it('a daily habit un-checked from the sheet is a single check: no snackbar', () => {
    const t = setup({ habits: [read, water], counts: { r: 1 } });
    act(() => { t.sheet().onSetToday(read, 0); });
    t.rerender();
    expect(t.bar()).toBeNull();
    expect(a11y.announce).toHaveBeenLastCalledWith('Read unchecked');
  });
});
