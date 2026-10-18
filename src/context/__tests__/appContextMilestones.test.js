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
// The big milestones (7/30/100/365); the small beats (1/3/14, C-08) are checked on their own.
const SMALL = new Set(['streak-1', 'streak-3', 'streak-14']);
const recorded = () => (app.settings.milestones || []).map(m => m.id).filter(id => !SMALL.has(id));
const byDays = (a, b) => parseInt(a.slice(7), 10) - parseInt(b.slice(7), 10);
const recordedAll = () => (app.settings.milestones || []).map(m => m.id).sort(byDays);

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

// ── C-08: small beats, and the sources that may celebrate (m1, m2, m3) ─────────────────────
const notifications = require('../../utils/notifications');
const { AppState } = require('react-native');
const ExpoLinking = require('expo-linking');
const today = () => localDateKey();
const TWO = [
  { id: 'r', name: 'Read', type: 'daily', createdAt: '2026-01-01', sortOrder: 0 },
  { id: 'w', name: 'Walk', type: 'daily', createdAt: '2026-01-01', sortOrder: 1 },
];
function historyOf(ids, n) {
  const out = {};
  for (let i = 1; i <= n; i++) out[addDays(today(), -i)] = Object.fromEntries(ids.map(id => [id, 1]));
  return out;
}
let appState;
beforeEach(() => { appState = AppState.currentState; AppState.currentState = 'active'; });
afterEach(() => { AppState.currentState = appState; });

test('Day 1: the first perfect day ever celebrates the small beat', async () => {
  Object.assign(mockStore, { habits: READ, completions: {} });
  const r = await mount();
  expect(app.getOverallStreak()).toBe(0);
  await act(async () => { app.incrementHabit('r'); });
  await flush();
  expect(app.pendingMilestone).toMatchObject({ days: 1, small: true });
  expect(recordedAll()).toEqual(['streak-1']);
  act(() => r.unmount());
});

test('a returning user whose best run passed 3 and 14 gets no small beats when they start again', async () => {
  // A 20-day run that ended (three empty days, more than the two monthly freezes cover), then
  // a new 2-day streak.
  const c = {};
  for (let i = 6; i <= 25; i++) c[addDays(today(), -i)] = { r: 1 };
  c[addDays(today(), -1)] = { r: 1 };
  c[addDays(today(), -2)] = { r: 1 };
  Object.assign(mockStore, { habits: READ, completions: c, settings: { streakFreezes: [] } });
  const r = await mount();
  expect(app.getOverallStreak()).toBe(2);
  expect(recordedAll()).toEqual(['streak-1', 'streak-3', 'streak-14']);
  expect(app.settings.milestones.every(m => m.silent)).toBe(true);
  await act(async () => { app.incrementHabit('r'); });
  await flush();
  expect(app.getOverallStreak()).toBe(3);
  expect(app.pendingMilestone).toBeNull();
  act(() => r.unmount());
});

test('m3: Mark the rest that completes the day across 7 celebrates', async () => {
  Object.assign(mockStore, { habits: TWO, completions: historyOf(['r', 'w'], 6) });
  const r = await mount();
  expect(app.getOverallStreak()).toBe(6);
  await act(async () => { app.markRestDone(); });
  await flush();
  expect(app.getOverallStreak()).toBe(7);
  expect(app.pendingMilestone?.days).toBe(7);
  act(() => r.unmount());
});

test('m3: an atMost decrement back under the limit completes the day and celebrates', async () => {
  // Untouched days meet a limit, so the habit starts 6 days ago: a 6-day streak.
  const LIMIT = [{ id: 's', name: 'Sweets', type: 'atMost', volumeGoal: 2, createdAt: addDays(today(), -6), sortOrder: 0 }];
  const c = historyOf(['s'], 6);
  c[today()] = { s: 3 }; // over the limit: today is not met yet
  Object.assign(mockStore, { habits: LIMIT, completions: c });
  const r = await mount();
  expect(app.getOverallStreak()).toBe(6);
  expect(app.pendingMilestone).toBeNull();
  await act(async () => { app.decrementHabit('s'); });
  await flush();
  expect(app.getOverallStreak()).toBe(7);
  expect(app.pendingMilestone?.days).toBe(7);
  act(() => r.unmount());
});

test('m3: the stale-run guard keeps the arm for the run that sees the new completions', async () => {
  Object.assign(mockStore, { habits: READ, completions: history(6) });
  const r = await mount();
  // A settings write in the same batch re-runs the milestone effect; the arm must survive any
  // run still on the old completions and celebrate on the one that sees the check-off.
  await act(async () => {
    app.updateSettings({ milestones: [...(app.settings.milestones || [])] });
    app.incrementHabit('r');
  });
  await flush();
  expect(app.pendingMilestone?.days).toBe(7);
  act(() => r.unmount());
});

test('m2: Skip today on the last open habit completes the day and celebrates', async () => {
  Object.assign(mockStore, { habits: TWO, completions: { ...historyOf(['r', 'w'], 6), [today()]: { r: 1 } } });
  const r = await mount();
  expect(app.getOverallStreak()).toBe(6);
  await act(async () => { app.toggleSkipHabitOn('w', today()); });
  await flush();
  expect(app.getOverallStreak()).toBe(7);
  expect(app.pendingMilestone?.days).toBe(7);
  act(() => r.unmount());
});

// Notification and deep-link Done write the habit's volumeGoal (1 for a daily habit).
const READ1 = [{ ...READ[0], volumeGoal: 1 }];
// From the background the moment waits for the next foreground (m5, tested below).
test.each([['active', 7], ['background', null]])('m1: a notification Done with the app %s', async (state, celebrates) => {
  Object.assign(mockStore, { habits: READ1, completions: history(6) });
  const r = await mount();
  const respond = notifications.listenForNotificationResponses.mock.calls[0][0];
  AppState.currentState = state;
  await act(async () => { respond({ action: 'done', data: { kind: 'habit', habitId: 'r' } }); });
  await flush();
  expect(app.getOverallStreak()).toBe(7);
  expect(recorded()).toEqual(['streak-7']);
  expect(app.pendingMilestone?.days ?? null).toBe(celebrates);
  act(() => r.unmount());
});

test('m1: groov://habit/<id>/done while the app is open celebrates', async () => {
  Object.assign(mockStore, { habits: READ1, completions: history(6) });
  const r = await mount();
  const onUrl = ExpoLinking.addEventListener.mock.calls.find(c => c[0] === 'url')[1];
  await act(async () => { onUrl({ url: 'groov://habit/r/done' }); });
  await flush();
  expect(app.getOverallStreak()).toBe(7);
  expect(app.pendingMilestone?.days).toBe(7);
  act(() => r.unmount());
});

test('Seed perfect streak 6: streak 6, today cleared, and the next check-offs cross 7', async () => {
  Object.assign(mockStore, {
    habits: TWO,
    completions: { [today()]: { r: 1 } },
    settings: { milestones: [{ id: 'streak-7', days: 7, date: '2026-01-01' }] },
  });
  const r = await mount();
  await act(async () => { await app.seedPerfectStreak(6); });
  await flush();
  expect(app.getOverallStreak()).toBe(6);
  expect(app.getHabitCount('r')).toBe(0);
  expect(recorded()).toEqual([]);
  await act(async () => { app.incrementHabit('r'); });
  await act(async () => { app.incrementHabit('w'); });
  await flush();
  expect(app.getOverallStreak()).toBe(7);
  expect(app.pendingMilestone?.days).toBe(7);
  act(() => r.unmount());
});

// ── C-08 code review: B1 (pull), M2 (Undo), m5 (deferred) ───────────────────────────────────
// A 20-day run that ended (three empty days), then `current` done days ending yesterday.
function endedRun(current) {
  const c = {};
  for (let i = 6; i <= 25; i++) c[addDays(today(), -i)] = { r: 1 };
  for (let i = 1; i <= current; i++) c[addDays(today(), -i)] = { r: 1 };
  return c;
}
async function mountThenPull(cloud) {
  let resolvePull;
  sync.pullAllData.mockImplementationOnce(() => new Promise((res) => { resolvePull = res; }));
  const r = await mount();
  await act(async () => { resolvePull(cloud); });
  await flush();
  return r;
}

test('B1: a new device pulling a 20-day best and a 2-day streak gets no 3-day beat', async () => {
  Object.assign(mockStore, { completions: {}, settings: { streakFreezes: [] } });
  const r = await mountThenPull({ habits: READ, completions: endedRun(2), settings: { reminders: [], streakFreezes: [], milestones: [] } });
  expect(app.getOverallStreak()).toBe(2);
  expect(recordedAll()).toEqual(['streak-1', 'streak-3', 'streak-14']);
  expect(app.settings.milestones.every(m => m.silent)).toBe(true);
  await act(async () => { app.incrementHabit('r'); });
  await flush();
  expect(app.getOverallStreak()).toBe(3);
  expect(app.pendingMilestone).toBeNull();
  act(() => r.unmount());
});

test('B1: a returning user at streak 0 hears no "Day 1" after the pull', async () => {
  Object.assign(mockStore, { completions: {}, settings: { streakFreezes: [] } });
  const r = await mountThenPull({ habits: READ, completions: endedRun(0), settings: { reminders: [], streakFreezes: [], milestones: [] } });
  expect(app.getOverallStreak()).toBe(0);
  await act(async () => { app.incrementHabit('r'); });
  await flush();
  expect(app.getOverallStreak()).toBe(1);
  expect(app.pendingMilestone).toBeNull();
  act(() => r.unmount());
});

test('B1: a pull whose row lacks this device\'s silent entries keeps them (union merge)', async () => {
  const silent = [{ id: 'streak-3', days: 3, date: '2026-10-01', small: true, silent: true }];
  Object.assign(mockStore, { habits: READ, completions: history(1), settings: { reminders: [], streakFreezes: [], milestones: silent } });
  const r = await mountThenPull({ habits: READ, completions: history(1), settings: { reminders: [], streakFreezes: [], milestones: [{ id: 'streak-1', days: 1, date: '2026-09-01', small: true, silent: true }] } });
  expect(recordedAll()).toEqual(['streak-1', 'streak-3']);
  act(() => r.unmount());
});

test('M2: Undo of Mark the rest takes the 7 back; completing the day later celebrates it', async () => {
  Object.assign(mockStore, { habits: TWO, completions: historyOf(['r', 'w'], 6) });
  const r = await mount();
  let plan;
  await act(async () => { plan = app.markRestDone(); });
  await flush();
  expect(app.pendingMilestone?.days).toBe(7);
  expect(recorded()).toEqual(['streak-7']);
  await act(async () => { app.restoreHabitCounts(plan.before, plan.changedIds, today()); });
  await flush();
  expect(app.getOverallStreak()).toBe(6);
  expect(recorded()).toEqual([]);
  expect(app.pendingMilestone).toBeNull();
  await act(async () => { app.incrementHabit('r'); });
  await act(async () => { app.incrementHabit('w'); });
  await flush();
  expect(app.pendingMilestone?.days).toBe(7);
  act(() => r.unmount());
});

test('m5: a background notification Done that crosses 7 plays on the next foreground', async () => {
  Object.assign(mockStore, { habits: READ1, completions: history(6) });
  const r = await mount();
  const respond = notifications.listenForNotificationResponses.mock.calls[0][0];
  AppState.currentState = 'background';
  await act(async () => { respond({ action: 'done', data: { kind: 'habit', habitId: 'r' } }); });
  await flush();
  expect(recorded()).toEqual(['streak-7']);
  expect(app.pendingMilestone).toBeNull();
  AppState.currentState = 'active';
  await act(async () => {
    AppState.addEventListener.mock.calls.filter(c => c[0] === 'change').forEach(c => c[1]('active'));
  });
  await flush();
  expect(app.pendingMilestone?.days).toBe(7);
  act(() => r.unmount());
});
