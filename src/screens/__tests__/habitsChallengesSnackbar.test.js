// C-10: archive, restore and delete forever on the Habits screen, and challenge delete, end in
// a Snackbar with an exact Undo. A delete is held back until the snackbar goes, so Undo has
// nothing to rebuild; an active habit deleted forever is archived meanwhile (it leaves Today
// and its reminder stops) and comes back with its reminder on Undo.
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const { Alert, AppState } = require('react-native');

const TODAY = '2026-10-18';
let mock;
jest.mock('../../context/AppContext', () => {
  const { themes } = jest.requireActual('../../theme/colors');
  return {
    useApp: () => ({
      theme: themes.light, themeName: 'light', todayStr: () => '2026-10-18',
      habits: mock.habits.filter(h => !h.archived),
      archivedHabits: mock.habits.filter(h => h.archived),
      allHabits: mock.habits,
      addHabit: jest.fn(), moveHabit: jest.fn(),
      updateHabit: mock.updateHabit, deleteHabit: mock.deleteHabit,
      archiveHabit: mock.archiveHabit, unarchiveHabit: mock.unarchiveHabit,
      pendingHabitLinkChallenge: null, setPendingHabitLinkChallenge: jest.fn(), linkHabitToChallenge: jest.fn(),
      ensureNotificationPermission: jest.fn(), pendingRoute: null, clearPendingRoute: jest.fn(), canAddHabit: () => true,
      setModalOpen: jest.fn(), setRequestedTab: jest.fn(),
      challenges: mock.challenges, effectiveChallenges: mock.challenges.filter(c => !mock.pendingChallengeDeletes.includes(c.id)), effectivePastChallenges: [],
      editChallenge: jest.fn(), createChallenge: jest.fn(), deleteChallenge: mock.deleteChallenge,
      pendingChallengeDeletes: mock.pendingChallengeDeletes, holdChallengeDelete: mock.holdChallengeDelete,
      getHabitCount: () => 0, isHabitDoneOn: () => false, getNote: () => '', settings: { skips: {} },
    }),
    getChallengeTier: () => 'none',
    TIER_STYLES: {},
  };
});
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('../../services/feedback', () => ({
  __esModule: true,
  default: { play: jest.fn(), toggled: jest.fn() },
  EVENTS: { refused: 'refused', selection: 'selection', destructiveConfirm: 'destructiveConfirm' },
}));
jest.mock('../../services/aiCoaching', () => ({ suggestHabit: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: (props) => require('react').createElement('Ionicons', props) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../utils/a11y', () => ({
  ...jest.requireActual('../../utils/a11y'),
  isReducedMotion: () => false,
  useReducedMotion: () => false,
  announce: jest.fn(),
}));
const mockStub = (name) => (props) => require('react').createElement(name, props, props.children);
jest.mock('../../components/SafeAreaView', () => mockStub('SafeAreaView'));
jest.mock('../../components/Slider', () => mockStub('Slider'));
jest.mock('../../components/TimePicker', () => mockStub('TimePicker'));
jest.mock('../../components/HabitDetailSheet', () => mockStub('HabitDetailSheet'));

const HabitsScreen = require('../HabitsScreen').default;
const ChallengeScreen = require('../ChallengeScreen').default;
const { SnackbarProvider, SnackbarView } = require('../../components/ui/Snackbar');
const { themes } = require('../../theme/colors');

global.IS_REACT_ACT_ENVIRONMENT = true;

const REMINDER = { enabled: true, hour12: 8, minute: 0, ampm: 'AM' };
let appStateListeners;
let alerts;
beforeEach(() => {
  jest.useFakeTimers();
  alerts = [];
  jest.spyOn(Alert, 'alert').mockImplementation((title, body, buttons) => { alerts.push({ title, buttons }); });
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
    appStateListeners.push(fn);
    return { remove: () => { appStateListeners = appStateListeners.filter(f => f !== fn); } };
  });
  const setHabit = (id, patch) => { mock.habits = mock.habits.map(h => (h.id === id ? { ...h, ...patch } : h)); };
  mock = {
    habits: [
      { id: 'r', name: 'Read', type: 'daily', icon: '📚', reminder: REMINDER, createdAt: TODAY, schedule: { type: 'daily' } },
      { id: 'o', name: 'Old', type: 'daily', icon: '📦', archived: true, createdAt: TODAY, schedule: { type: 'daily' } },
    ],
    challenges: [{ id: 'c1', name: 'Kickstart', description: '', days: 3, icon: '🏁', completedDays: [], completed: false, startDate: TODAY, linkedHabitIds: [] }],
    updateHabit: jest.fn((id, patch) => setHabit(id, patch)),
    archiveHabit: jest.fn((id) => setHabit(id, { archived: true, reminder: undefined })),
    unarchiveHabit: jest.fn((id) => setHabit(id, { archived: false })),
    deleteHabit: jest.fn((id) => { mock.habits = mock.habits.filter(h => h.id !== id); return Promise.resolve('synced'); }),
    pendingChallengeDeletes: [],
    holdChallengeDelete: jest.fn((id, on) => { mock.pendingChallengeDeletes = on ? [...mock.pendingChallengeDeletes, id] : mock.pendingChallengeDeletes.filter(x => x !== id); }),
    deleteChallenge: jest.fn((id) => { mock.challenges = mock.challenges.filter(c => c.id !== id); mock.pendingChallengeDeletes = mock.pendingChallengeDeletes.filter(x => x !== id); return Promise.resolve(); }),
  };
});
afterEach(() => { act(() => { jest.runOnlyPendingTimers(); }); jest.useRealTimers(); jest.restoreAllMocks(); });

function setup(Screen) {
  const tree = () => (
    <SnackbarProvider>
      <Screen />
      <SnackbarView theme={themes.light} />
    </SnackbarProvider>
  );
  let r;
  act(() => { r = TestRenderer.create(tree()); });
  const rerender = () => act(() => { r.update(tree()); });
  const bar = () => r.root.findAll(n => n.props.testID === 'snackbar')[0] || null;
  const message = () => bar()?.findAll(n => typeof n.props.children === 'string' && n.props.variant === 'callout')[0]?.props.children ?? null;
  const press = (label) => {
    const el = r.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
    act(() => { el.props.onPress(); });
    rerender();
  };
  const choose = (text) => {
    const b = alerts.at(-1).buttons.find(x => x.text === text);
    act(() => { b.onPress(); });
    rerender();
  };
  const undo = () => {
    const b = bar().findAll(n => String(n.props.accessibilityLabel || '').startsWith('Undo: ') && typeof n.props.onPress === 'function')[0];
    act(() => { b.props.onPress(); });
    rerender();
  };
  const advance = (ms) => { act(() => { jest.advanceTimersByTime(ms); }); rerender(); };
  const has = (label) => r.root.findAll(n => n.props.accessibilityLabel === label).length > 0;
  return { r, rerender, bar, message, press, choose, undo, advance, has };
}

describe('C-10 Habits screen', () => {
  it('archive: snackbar, and Undo brings the habit back with its reminder', () => {
    const t = setup(HabitsScreen);
    t.press('Archive or delete habit');
    t.choose('Archive');
    expect(mock.archiveHabit).toHaveBeenCalledWith('r');
    expect(t.message()).toBe('Read archived');
    t.undo();
    expect(mock.updateHabit).toHaveBeenLastCalledWith('r', { archived: false, reminder: REMINDER });
    expect(mock.habits.find(h => h.id === 'r')).toMatchObject({ archived: false, reminder: REMINDER });
  });

  it('restore: snackbar, and Undo archives it again', () => {
    const t = setup(HabitsScreen);
    t.press('Restore habit');
    expect(mock.unarchiveHabit).toHaveBeenCalledWith('o');
    expect(t.message()).toBe('Old restored');
    t.undo();
    expect(mock.archiveHabit).toHaveBeenCalledWith('o');
    expect(mock.habits.find(h => h.id === 'o').archived).toBe(true);
  });

  it('delete forever (archived): the row hides, Undo keeps the habit, nothing is deleted', () => {
    const t = setup(HabitsScreen);
    t.press('Delete habit permanently');
    t.choose('Delete');
    expect(t.message()).toBe('Old deleted');
    expect(t.has('Restore habit')).toBe(false);
    expect(mock.deleteHabit).not.toHaveBeenCalled();
    t.undo();
    t.advance(20000);
    expect(mock.deleteHabit).not.toHaveBeenCalled();
    expect(t.has('Restore habit')).toBe(true);
  });

  it('delete forever (archived): the delete runs when the snackbar times out', () => {
    const t = setup(HabitsScreen);
    t.press('Delete habit permanently');
    t.choose('Delete');
    t.advance(7999);
    expect(mock.deleteHabit).not.toHaveBeenCalled();
    t.advance(1);
    expect(mock.deleteHabit).toHaveBeenCalledWith('o');
  });

  it('delete forever (active): archived at once; Undo restores it and its reminder; backgrounding commits', () => {
    const t = setup(HabitsScreen);
    t.press('Archive or delete habit');
    t.choose('Delete forever');
    t.choose('Delete');
    expect(mock.archiveHabit).toHaveBeenCalledWith('r');
    expect(mock.deleteHabit).not.toHaveBeenCalled();
    t.undo();
    expect(mock.habits.find(h => h.id === 'r')).toMatchObject({ archived: false, reminder: REMINDER });
    expect(mock.deleteHabit).not.toHaveBeenCalled();
    // Again, and this time the app goes to the background: the delete runs.
    t.press('Archive or delete habit');
    t.choose('Delete forever');
    t.choose('Delete');
    act(() => { appStateListeners.slice().forEach(fn => fn('background')); });
    expect(mock.deleteHabit).toHaveBeenCalledWith('r');
  });
});

describe('C-10 review M1: sign-out with a pending delete', () => {
  function withApi(Screen) {
    const ref = {};
    const { useSnackbar } = require('../../components/ui/Snackbar');
    function Probe() { ref.api = useSnackbar(); return null; }
    let r;
    act(() => {
      r = TestRenderer.create(
        <SnackbarProvider><Screen /><Probe /><SnackbarView theme={themes.light} /></SnackbarProvider>,
      );
    });
    const alertChoose = (text) => { const b = alerts.at(-1).buttons.find(x => x.text === text); act(() => { b.onPress(); }); };
    const press = (label) => { const el = r.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0]; act(() => { el.props.onPress(); }); };
    return { r, ref, alertChoose, press };
  }

  it('flush() commits a pending habit delete and resolves with its cloud sync', async () => {
    const t = withApi(HabitsScreen);
    t.press('Delete habit permanently');
    t.alertChoose('Delete');
    expect(mock.deleteHabit).not.toHaveBeenCalled();
    let result;
    await act(async () => { result = await t.ref.api.flush(); });
    expect(mock.deleteHabit).toHaveBeenCalledWith('o');
    expect(result).toBe('synced');
  });

  it('a provider unmount (sign-out without a flush) never half-commits: the habit stays archived', () => {
    const t = withApi(HabitsScreen);
    t.press('Archive or delete habit');
    t.alertChoose('Delete forever');
    t.alertChoose('Delete');
    expect(mock.habits.find(h => h.id === 'r').archived).toBe(true);
    act(() => { t.r.unmount(); });
    expect(mock.deleteHabit).not.toHaveBeenCalled();
    expect(mock.habits.find(h => h.id === 'r').archived).toBe(true);
  });

  it('a pending challenge delete: flush commits it; unmount leaves the challenge alone', async () => {
    const t = withApi(ChallengeScreen);
    t.press('Delete challenge');
    t.alertChoose('Delete');
    expect(mock.holdChallengeDelete).toHaveBeenCalledWith('c1', true);
    await act(async () => { await t.ref.api.flush(); });
    expect(mock.deleteChallenge).toHaveBeenCalledWith('c1');
    mock.challenges = [{ ...mock.challenges[0] || {}, id: 'c2', name: 'Two', description: '', days: 3, icon: '🏁', completedDays: [], completed: false, startDate: TODAY, linkedHabitIds: [] }];
    const t2 = withApi(ChallengeScreen);
    t2.press('Delete challenge');
    t2.alertChoose('Delete');
    act(() => { t2.r.unmount(); });
    expect(mock.deleteChallenge).toHaveBeenCalledTimes(1);
  });
});

describe('C-10 Challenges screen', () => {
  it('delete: the card hides, Undo keeps the challenge; without Undo the delete runs on timeout', () => {
    const t = setup(ChallengeScreen);
    t.press('Delete challenge');
    t.choose('Delete');
    expect(t.message()).toBe('Kickstart deleted');
    expect(t.has('Delete challenge')).toBe(false);
    t.undo();
    expect(t.has('Delete challenge')).toBe(true);
    t.advance(20000);
    expect(mock.deleteChallenge).not.toHaveBeenCalled();
    t.press('Delete challenge');
    t.choose('Delete');
    t.advance(8000);
    expect(mock.deleteChallenge).toHaveBeenCalledWith('c1');
  });
});
