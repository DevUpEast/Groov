// M2 design gate M3-1: no retroactive streak milestones. Loading or pulling a history that
// already passed a milestone records it silently; only a check-off on today celebrates.
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
    syncChallenge: ok(), deleteChallengeSync: ok(), syncPastChallenge: ok(), syncSettings: ok(),
  };
});
jest.mock('../../utils/notifications', () => ({
  requestReminderSchedule: jest.fn(), clearRemindersOnSignOut: jest.fn(), requestEveningCheckIn: jest.fn(),
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
const { localDateKey, addDays } = require('../../utils/dates');
const { AppProvider, useApp } = require('../AppContext');
const { __resetAfterMomentForTests } = require('../../utils/afterMoment');


let app;
function Probe() { app = useApp(); return null; }
const flush = async () => { for (let i = 0; i < 20; i++) await act(async () => { await Promise.resolve(); }); };

async function mount() {
  let r;
  await act(async () => { r = TestRenderer.create(React.createElement(AppProvider, null, React.createElement(Probe))); });
  await flush();
  return r;
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  Object.assign(mockStore, { hasOnboarded: true, lastUserId: 'u1', completions: {} });
  jest.clearAllMocks();
  feedback.__resetForTests();
  __resetAfterMomentForTests();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); console.warn.mockRestore?.(); });

const READ = [{ id: 'r', name: 'Read', type: 'daily', createdAt: '2026-01-01', sortOrder: 0 }];
// `n` done days ending yesterday (today unfinished, which never breaks a streak).
function history(n) {
  const today = localDateKey();
  const out = {};
  for (let i = 1; i <= n; i++) out[addDays(today, -i)] = { r: 1 };
  return out;
}
const recorded = () => (app.settings.milestones || []).map(m => m.id);

test('load with a 12-day streak: no celebration, streak-7 recorded silently', async () => {
  Object.assign(mockStore, { habits: READ, completions: history(12) });
  const r = await mount();
  expect(app.getOverallStreak()).toBe(12);
  expect(app.pendingMilestone).toBeNull();
  expect(recorded()).toEqual(['streak-7']);
  act(() => r.unmount());
});

test('a check-off that takes the streak from 6 to 7 celebrates', async () => {
  Object.assign(mockStore, { habits: READ, completions: history(6) });
  const r = await mount();
  expect(app.getOverallStreak()).toBe(6);
  expect(app.pendingMilestone).toBeNull();
  expect(recorded()).toEqual([]);
  await act(async () => { app.incrementHabit('r'); });
  await flush();
  expect(app.getOverallStreak()).toBe(7);
  expect(app.pendingMilestone?.days).toBe(7);
  expect(recorded()).toEqual(['streak-7']);
  act(() => r.unmount());
});

test('a pull that raises the streak across 7 does not celebrate', async () => {
  let resolvePull;
  sync.pullAllData.mockImplementationOnce(() => new Promise((res) => { resolvePull = res; }));
  Object.assign(mockStore, { habits: READ, completions: history(6) });
  const r = await mount();
  expect(app.getOverallStreak()).toBe(6);
  await act(async () => { resolvePull({ habits: READ, completions: history(9) }); });
  await flush();
  expect(app.getOverallStreak()).toBe(9);
  expect(app.pendingMilestone).toBeNull();
  expect(recorded()).toEqual(['streak-7']);
  act(() => r.unmount());
});

test('backdating a past day that raises the streak across 7 does not celebrate', async () => {
  const c = history(7);
  delete c[addDays(localDateKey(), -3)]; // a gap: streak 2
  Object.assign(mockStore, { habits: READ, completions: c, settings: { streakFreezes: [] } });
  const r = await mount();
  const before = app.getOverallStreak();
  await act(async () => { app.setHabitCountOn('r', addDays(localDateKey(), -3), 1); });
  await flush();
  expect(app.getOverallStreak()).toBeGreaterThan(before);
  expect(app.getOverallStreak()).toBe(7);
  expect(app.pendingMilestone).toBeNull();
  expect(recorded()).toEqual(['streak-7']);
  act(() => r.unmount());
});
