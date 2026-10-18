// C-09: the since-last-open check in AppProvider. Cards come only from a new date compared
// with the device-local lastSeen, after the data has settled (login sync, foreground pull,
// freeze reconcile); a pull never fires one, and the first run on a device only records.
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
const notifications = require('../../utils/notifications');
const feedback = require('../../services/feedback');
const { localDateKey, addDays } = require('../../utils/dates');
const { AppProvider, useApp } = require('../AppContext');
const { __resetAfterMomentForTests, flushMoment } = require('../../utils/afterMoment');
const { __resetDeviceSettingsForTests, getDeviceSetting } = require('../../utils/deviceSettings');

let app;
function Probe() { app = useApp(); return null; }
const flush = async () => {
  for (let i = 0; i < 20; i++) await act(async () => { await Promise.resolve(); });
  act(() => { flushMoment(); });
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
};

async function mount() {
  let r;
  await act(async () => { r = TestRenderer.create(React.createElement(AppProvider, null, React.createElement(Probe))); });
  await flush();
  return r;
}

const TODAY = localDateKey();
const d = (n) => addDays(TODAY, -n);
const READ = [{ id: 'r', name: 'Read', type: 'daily', createdAt: '2025-01-01', sortOrder: 0 }];
// Done on each day from d(from) to d(to) (from > to).
function doneDays(from, to) {
  const out = {};
  for (let i = from; i >= to; i--) out[d(i)] = { r: 1 };
  return out;
}
const settingsWith = (patch) => ({ reminders: [], streakFreezes: [], skips: {}, milestones: [], ...patch });

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  Object.assign(mockStore, { hasOnboarded: true, lastUserId: 'u1', completions: {}, habits: READ });
  jest.clearAllMocks();
  feedback.__resetForTests();
  __resetAfterMomentForTests();
  __resetDeviceSettingsForTests();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); console.warn.mockRestore?.(); });

test('first run on a device (no lastSeen) shows nothing and records today', async () => {
  Object.assign(mockStore, { completions: doneDays(20, 2) }); // yesterday missed: a freeze covers it
  const r = await mount();
  expect(app.settings.streakFreezes).toContain(d(1));
  expect(app.streakNews).toBeNull();
  expect(getDeviceSetting('lastSeen')).toMatchObject({ date: TODAY, freezesUsed: app.settings.streakFreezes });
  act(() => r.unmount());
});

test('a freeze spent on yesterday since the last open: the freeze card, once', async () => {
  Object.assign(mockStore, {
    completions: doneDays(20, 2),
    deviceSettings: { lastSeen: { date: d(2), streak: 18, freezesUsed: [] } },
  });
  const r = await mount();
  expect(app.streakNews).toMatchObject({ kind: 'freeze', covered: d(1), count: 1, streak: 19, date: TODAY });
  expect(getDeviceSetting('lastSeen')).toMatchObject({ date: TODAY, streak: 19 });
  act(() => app.dismissStreakNews());
  expect(app.streakNews).toBeNull();
  // Later runs on the same date (a check-off and its un-check) do not bring it back.
  await act(async () => { app.incrementHabit('r'); });
  await flush();
  await act(async () => { app.decrementHabit('r'); });
  await flush();
  expect(app.streakNews).toBeNull();
  act(() => r.unmount());
});

test('remounting on the same date (sign out and back in) never shows the card again', async () => {
  Object.assign(mockStore, {
    completions: doneDays(20, 2),
    deviceSettings: { lastSeen: { date: d(2), streak: 18, freezesUsed: [] } },
  });
  let r = await mount();
  expect(app.streakNews?.kind).toBe('freeze');
  act(() => r.unmount());
  __resetDeviceSettingsForTests(); // the store is re-read from storage, as after a restart
  r = await mount();
  expect(app.streakNews).toBeNull();
  act(() => r.unmount());
});

test('the streak ended while away: the reset card, then Back on beat once', async () => {
  // A 21-day run to d(10); d(9) and every day since missed (the reconcile's 7-day lookback
  // cannot reach d(8)/d(9), so the streak stays ended whatever it freezes).
  Object.assign(mockStore, {
    completions: doneDays(30, 10),
    deviceSettings: { lastSeen: { date: d(9), streak: 21, freezesUsed: [] } },
  });
  const r = await mount();
  expect(app.getOverallStreak()).toBe(0);
  expect(app.streakNews).toMatchObject({ kind: 'reset', ended: 21 });
  expect(getDeviceSetting('lastSeen').backOnBeat).toBe(TODAY);
  let first;
  act(() => { first = app.takeBackOnBeat(); });
  expect(first).toBe(true);
  expect(app.takeBackOnBeat()).toBe(false);
  expect(getDeviceSetting('lastSeen').backOnBeat).toBeUndefined();
  act(() => r.unmount());
});

test('the check waits for the login pull: a day another device filled in is not missed', async () => {
  let resolvePull;
  sync.pullAllData.mockImplementationOnce(() => new Promise((res) => { resolvePull = res; }));
  Object.assign(mockStore, {
    completions: doneDays(30, 10), // stale local copy: the run looks ended
    settings: settingsWith({ streakFreezes: [] }),
    deviceSettings: { lastSeen: { date: d(9), streak: 21, freezesUsed: [] } },
  });
  const r = await mount();
  expect(app.streakNews).toBeNull();
  expect(getDeviceSetting('lastSeen').date).toBe(d(9));
  await act(async () => { resolvePull({ habits: READ, completions: doneDays(30, 1) }); });
  await flush();
  expect(app.getOverallStreak()).toBe(30);
  expect(app.streakNews).toBeNull();
  expect(getDeviceSetting('lastSeen')).toMatchObject({ date: TODAY, streak: 30 });
  act(() => r.unmount());
});

test('an in-session edit that spends a freeze is not announced (same date)', async () => {
  Object.assign(mockStore, {
    completions: doneDays(20, 1),
    deviceSettings: { lastSeen: { date: TODAY, streak: 20, freezesUsed: [] } },
  });
  const r = await mount();
  expect(app.streakNews).toBeNull();
  await act(async () => { app.toggleHabitDoneOn('r', d(1)); });
  await flush();
  expect(app.settings.streakFreezes).toContain(d(1));
  expect(app.streakNews).toBeNull();
  expect(getDeviceSetting('lastSeen').freezesUsed).toContain(d(1));
  act(() => r.unmount());
});

test('dev tool "Simulate missed yesterday" produces the freeze card', async () => {
  Object.assign(mockStore, {
    completions: doneDays(20, 1),
    deviceSettings: { lastSeen: { date: TODAY, streak: 20, freezesUsed: [] } },
  });
  const r = await mount();
  expect(app.streakNews).toBeNull();
  await act(async () => { await app.simulateMissedYesterday(); });
  await flush();
  expect(app.streakNews).toMatchObject({ kind: 'freeze', covered: d(1), streak: 19 });
  expect(sync.syncCompletion).toHaveBeenCalled();
  act(() => r.unmount());
});

test('Streak news: scheduled while today is open, cancelled once it is done', async () => {
  Object.assign(mockStore, {
    // Started 5 days ago, so no earlier missed day has used this month's freezes.
    habits: [{ ...READ[0], createdAt: d(5) }],
    completions: doneDays(5, 1),
    settings: settingsWith({ notificationsEnabled: true, extras: { streakNewsEnabled: true } }),
    deviceSettings: { lastSeen: { date: TODAY, streak: 5, freezesUsed: [] } },
  });
  const r = await mount();
  const last = () => notifications.requestStreakNews.mock.calls[notifications.requestStreakNews.mock.calls.length - 1];
  expect(last()[0]).toBe(TODAY);
  expect(last()[1]).toEqual({ title: 'Streak news', body: 'A freeze covered yesterday. Your 5-day streak holds.' });
  await act(async () => { app.incrementHabit('r'); });
  await flush();
  expect(last()[1]).toBeNull();
  act(() => r.unmount());
});

test('Streak news follows the freezes left this month (reset when none is left)', async () => {
  Object.assign(mockStore, {
    completions: doneDays(5, 1),
    settings: settingsWith({ notificationsEnabled: true, extras: { streakNewsEnabled: true } }),
    deviceSettings: { lastSeen: { date: TODAY, streak: 5, freezesUsed: [] } },
  });
  const r = await mount();
  // The habit is older than the run, so the days before it used this month's freezes (or, on
  // the first days of a month, the missed day before the run ends any freeze talk anyway).
  const calls = notifications.requestStreakNews.mock.calls;
  const content = calls[calls.length - 1][1];
  if (app.freezesLeft === 0) expect(content.body).toBe('Your streak ended at 5 days. Today starts a new one.');
  else expect(content.body).toBe('A freeze covered yesterday. Your 5-day streak holds.');
  act(() => r.unmount());
});

test('Streak news off (the default): only cancels', async () => {
  Object.assign(mockStore, { completions: doneDays(5, 1) });
  const r = await mount();
  expect(notifications.requestStreakNews).toHaveBeenCalled();
  notifications.requestStreakNews.mock.calls.forEach(([, content]) => expect(content).toBeNull());
  act(() => r.unmount());
});

// ── Review M2 / m1 ──────────────────────────────────────────────────────────────

test('an account switch drops the previous account\'s lastSeen: the first run on B only records', async () => {
  sync.pullAllData.mockImplementationOnce(() => Promise.resolve({ habits: READ, completions: doneDays(30, 10) }));
  Object.assign(mockStore, {
    lastUserId: 'someone-else',
    completions: {},
    deviceSettings: { lastSeen: { date: d(9), streak: 21, freezesUsed: [] } },
  });
  const r = await mount();
  expect(app.getOverallStreak()).toBe(0); // B's history: a run that ended while away
  expect(app.streakNews).toBeNull();
  expect(getDeviceSetting('lastSeen')).toMatchObject({ date: TODAY });
  act(() => r.unmount());
});

test('an offline login pull keeps the gate shut: no card, lastSeen untouched', async () => {
  sync.pullAllData.mockImplementationOnce(() => Promise.reject(new Error('offline')));
  Object.assign(mockStore, {
    completions: doneDays(30, 10),
    deviceSettings: { lastSeen: { date: d(9), streak: 21, freezesUsed: [] } },
  });
  const r = await mount();
  expect(app.streakNews).toBeNull();
  expect(getDeviceSetting('lastSeen').date).toBe(d(9));
  act(() => r.unmount());
});

describe('a date change while open waits for the foreground pull (pullsSettled)', () => {
  // Mount at 23:59:50 on day A, cross midnight into B: the midnight tick starts a delta pull.
  const A = '2026-07-14';
  const B = '2026-07-15';
  const before = (n) => addDays(A, -n);
  let resolveDelta;
  const delta = (rows) => ({
    habits: [], habitIds: null, challenges: [], challengeIds: null, pastChallenges: [],
    completions: rows, dailySnapshots: [], moods: [], settings: null,
  });
  async function crossMidnight() {
    jest.setSystemTime(new Date(2026, 6, 14, 23, 59, 50));
    sync.pullChangesSince.mockImplementation(() => new Promise((res) => { resolveDelta = res; }));
    const out = {};
    for (let i = 1; i <= 12; i++) out[before(i)] = { r: 1 };
    Object.assign(mockStore, {
      habits: [{ ...READ[0], createdAt: before(12) }],
      completions: out, // A itself is not done on this device
      deviceSettings: { lastSeen: { date: A, streak: 12, freezesUsed: [] } },
    });
    const r = await mount();
    expect(app.streakNews).toBeNull();
    await act(async () => { jest.advanceTimersByTime(15000); });
    await flush();
    expect(localDateKey()).toBe(B);
    return r;
  }

  test('a day another device finished arrives with the pull: no card', async () => {
    const r = await crossMidnight();
    // The pull is still in flight: A looks missed here, but the check has not run.
    expect(sync.pullChangesSince).toHaveBeenCalled();
    expect(app.streakNews).toBeNull();
    expect(getDeviceSetting('lastSeen').date).toBe(A);
    await act(async () => { resolveDelta(delta([{ date: A, habit_id: 'r', count: 1 }])); });
    await flush();
    expect(app.streakNews).toBeNull();
    expect(getDeviceSetting('lastSeen')).toMatchObject({ date: B, streak: 13 });
    act(() => r.unmount());
  });

  test('control: when the pull brings nothing, the check runs after it and A\'s freeze is news', async () => {
    const r = await crossMidnight();
    expect(app.streakNews).toBeNull();
    await act(async () => { resolveDelta(delta([])); });
    await flush();
    expect(app.streakNews).toMatchObject({ kind: 'freeze', covered: A, streak: 12 });
    act(() => r.unmount());
  });
});
