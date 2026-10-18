// C-06a review M3: AppContext's wiring of the live completions map and the after-moment
// queue, on the real AppProvider with storage, sync and native services mocked.
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

global.IS_REACT_ACT_ENVIRONMENT = true;

const mockStore = {};
jest.mock('../../utils/storage', () => ({
  loadData: jest.fn((k) => Promise.resolve(k in mockStore ? JSON.parse(JSON.stringify(mockStore[k])) : null)),
  saveData: jest.fn((k, v) => { mockStore[k] = v; return Promise.resolve(); }),
  clearAll: jest.fn(() => Promise.resolve()),
}));
jest.mock('../AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' }, displayName: '' }) }));
jest.mock('../../services/sync', () => {
  const ok = () => jest.fn(() => Promise.resolve());
  return {
    pullAllData: jest.fn(() => Promise.resolve({ habits: null })),
    pullChangesSince: jest.fn(() => new Promise(() => {})),
    pushAllLocalData: ok(), deleteAllUserData: ok(), syncHabit: ok(), deleteHabitSync: ok(),
    syncCompletion: ok(), syncCompletionsForDate: ok(), syncNote: ok(), syncMood: ok(),
    syncChallenge: ok(), deleteChallengeSync: ok(), syncPastChallenge: ok(), syncSettings: ok(), writeBackSettings: jest.fn(() => Promise.resolve(false)),
  };
});
jest.mock('../../utils/notifications', () => ({
  requestReminderSchedule: jest.fn(), clearRemindersOnSignOut: jest.fn(), requestEveningCheckIn: jest.fn(), requestStreakNews: jest.fn(),
  getPermissionState: jest.fn(() => Promise.resolve('granted')), requestOsPermission: jest.fn(() => Promise.resolve(true)),
  listenForNotificationResponses: jest.fn(() => () => {}), snoozeNotification: jest.fn(), setBadge: jest.fn(),
  ACTION_DONE: 'done', ACTION_SNOOZE: 'snooze', BACKOFF_AFTER_MISSES: 3,
}));
jest.mock('../../widgets/refreshWidget', () => ({ refreshWidget: jest.fn() }));
jest.mock('../../services/entitlements', () => ({
  configurePurchases: jest.fn(() => Promise.resolve()), checkPro: jest.fn(() => Promise.resolve(false)),
  FREE_LIMITS: { habits: 5, reminders: 1 },
}));
jest.mock('../../services/icons', () => ({
  persistPickedIcon: jest.fn(), uploadIcon: jest.fn(), downloadIcon: jest.fn(), removeIcon: jest.fn(),
  isDurableLocalUri: () => true, localIconExists: () => true,
}));
jest.mock('../../utils/analytics', () => ({ initAnalytics: jest.fn(), track: jest.fn(), Events: {} }));
jest.mock('../../utils/devMode', () => ({ loadDevMode: jest.fn(() => Promise.resolve(false)), saveDevMode: jest.fn() }));
jest.mock('../../utils/sounds', () => ({ playSound: jest.fn(), prewarm: jest.fn() }));
jest.mock('expo-linking', () => ({ getInitialURL: jest.fn(() => Promise.resolve(null)), addEventListener: jest.fn(() => ({ remove() {} })) }));
jest.mock('expo-quick-actions', () => ({ setItems: jest.fn(), addListener: jest.fn(() => ({ remove() {} })), initial: null }));

const sync = require('../../services/sync');
const feedback = require('../../services/feedback');
const { localDateKey } = require('../../utils/dates');
const { AppProvider, useApp } = require('../AppContext');
const { __resetAfterMomentForTests } = require('../../utils/afterMoment');

const HABITS = [
  { id: 'r', name: 'Read', type: 'daily', createdAt: '2026-01-01', sortOrder: 0 },
  { id: 'm', name: 'Move', type: 'daily', createdAt: '2026-01-01', sortOrder: 1 },
  { id: 'w', name: 'Water', type: 'volume', volumeGoal: 8, unit: 'glasses', createdAt: '2026-01-01', sortOrder: 2 },
];

let app;
function Probe() { app = useApp(); return null; }
const flush = async () => { for (let i = 0; i < 20; i++) await act(async () => { await Promise.resolve(); }); };

async function mount() {
  let r;
  await act(async () => { r = TestRenderer.create(React.createElement(AppProvider, null, React.createElement(Probe))); });
  await flush();
  return r;
}

const upserts = (id) => sync.syncCompletion.mock.calls.filter(c => c[2] === id).map(c => c[3]);

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  Object.assign(mockStore, { habits: HABITS, hasOnboarded: true, lastUserId: 'u1', completions: {} });
  jest.clearAllMocks();
  feedback.__resetForTests();
  __resetAfterMomentForTests();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); console.warn.mockRestore?.(); });

test('two increments before a render count 2 (live completions)', async () => {
  const r = await mount();
  expect(app.habits.map(h => h.id)).toEqual(['r', 'm', 'w']);
  act(() => {
    app.incrementHabit('w');
    expect(app.getHabitCount('w')).toBe(1); // the same app object: no render in between
    app.incrementHabit('w');
    expect(app.getHabitCount('w')).toBe(2);
  });
  expect(app.getHabitCount('w')).toBe(2);
  expect(app.completions[localDateKey()].w).toBe(2);
  act(() => r.unmount());
});

test('inside a moment the upserts wait, and only the last count per habit is sent', async () => {
  const r = await mount();
  act(() => {
    feedback.play(feedback.EVENTS.counterStep, { sound: false });
    for (let i = 0; i < 5; i++) app.incrementHabit('w');
  });
  expect(upserts('w')).toEqual([]);
  await act(async () => { jest.advanceTimersByTime(feedback.PREWARM_QUIET_MS + 10); });
  expect(upserts('w')).toEqual([5]);
  act(() => r.unmount());
});

test('B1: Mark the rest, then Undo inside the moment, sends the restored values once', async () => {
  const r = await mount();
  let plan;
  act(() => {
    feedback.play(feedback.EVENTS.markRest);
    plan = app.markRestDone();
  });
  expect(plan.changedIds.sort()).toEqual(['m', 'r']);
  await act(async () => { jest.advanceTimersByTime(1000); });
  act(() => {
    feedback.play(feedback.EVENTS.habitUndone);
    app.restoreHabitCounts(plan.before, plan.changedIds);
  });
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(upserts('r')).toEqual([0]);
  expect(upserts('m')).toEqual([0]);
  expect(sync.syncCompletionsForDate).not.toHaveBeenCalled();
  expect(app.getHabitCount('r')).toBe(0);
  act(() => r.unmount());
});

test('unmount (sign-out, account switch) sends what is still queued', async () => {
  const r = await mount();
  act(() => {
    feedback.play(feedback.EVENTS.habitDone);
    app.incrementHabit('r');
  });
  expect(upserts('r')).toEqual([]);
  act(() => r.unmount());
  expect(upserts('r')).toEqual([1]);
});
