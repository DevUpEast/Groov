// S-10 (review M1, m2, m3): the settings call sites in AppContext. Pull merges write the
// merged extras back, the no-cloud-habits push keeps the cloud's hints, two extras writes
// in one tick both land, an account switch never carries A's extras to B, and the badge
// migration has run before the first render.
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
const deviceSettings = require('../../utils/deviceSettings');
const { DEFAULT_SETTINGS } = require('../../utils/settings');
const { AppProvider, useApp } = require('../AppContext');
const { __resetAfterMomentForTests } = require('../../utils/afterMoment');

let app;
let firstRenderBadge;
function Probe() {
  app = useApp();
  if (firstRenderBadge === undefined) firstRenderBadge = deviceSettings.getDeviceSetting('badgeEnabled');
  return null;
}
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
  deviceSettings.__resetDeviceSettingsForTests();
  firstRenderBadge = undefined;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); console.warn.mockRestore?.(); });

const READ = [{ id: 'r', name: 'Read', type: 'daily', createdAt: '2026-01-01', sortOrder: 0 }];
const withExtras = (extras, more = {}) => ({ ...DEFAULT_SETTINGS, ...more, extras });

test('login pull: local hints survive, cloud columns win, the merged copy is written back once', async () => {
  Object.assign(mockStore, { habits: READ, settings: withExtras({ hints: { longPress: true } }) });
  sync.pullAllData.mockResolvedValueOnce({
    habits: READ, completions: {}, settings: withExtras({ hints: { challengeTip: true } }, { theme: 'dark' }), settingsHasExtras: true,
  });
  const r = await mount();
  expect(app.settings.theme).toBe('dark');
  expect(app.settings.extras.hints).toEqual({ longPress: true, challengeTip: true });
  expect(sync.writeBackSettings).toHaveBeenCalledTimes(1);
  const [uid, cloud, merged, opts] = sync.writeBackSettings.mock.calls[0];
  expect(uid).toBe('u1');
  expect(cloud.extras).toEqual({ hints: { challengeTip: true } });
  expect(merged.extras.hints).toEqual({ longPress: true, challengeTip: true });
  expect(merged.theme).toBe('dark');
  expect(opts).toEqual({ hasExtrasColumn: true });
  act(() => r.unmount());
});

test('login with no cloud habits: the local push carries the cloud hints, never an empty extras over them', async () => {
  Object.assign(mockStore, { settings: withExtras({}, { theme: 'dark' }) });
  sync.pullAllData.mockResolvedValueOnce({ habits: [], settings: withExtras({ hints: { challengeTip: true }, k: 1 }), settingsHasExtras: true });
  const r = await mount();
  expect(sync.pushAllLocalData).toHaveBeenCalledTimes(1);
  const pushed = sync.pushAllLocalData.mock.calls[0][1].settings;
  expect(pushed.theme).toBe('dark');
  expect(pushed.extras).toEqual({ hints: { challengeTip: true }, k: 1 });
  expect(app.settings.extras.hints).toEqual({ challengeTip: true });
  act(() => r.unmount());
});

test("account switch: A's extras never reach B (state or write-back)", async () => {
  Object.assign(mockStore, { lastUserId: 'someone-else', habits: READ, settings: withExtras({ hints: { fromA: true } }) });
  sync.pullAllData.mockResolvedValueOnce({ habits: READ, completions: {}, settings: withExtras({}), settingsHasExtras: true });
  const r = await mount();
  expect(app.settings.extras).toEqual({});
  const merged = sync.writeBackSettings.mock.calls[0][2];
  expect(merged.extras).toEqual({});
  act(() => r.unmount());
});

test('two extras writes in one tick both land (functional setSettings)', async () => {
  Object.assign(mockStore, { habits: READ });
  sync.pullAllData.mockResolvedValueOnce({ habits: null });
  const r = await mount();
  sync.syncSettings.mockClear();
  await act(async () => { app.setHint('longPress'); app.setHint('challengeTip'); app.updateExtras({ streakNewsEnabled: true }); });
  await flush();
  expect(app.settings.extras).toEqual({ hints: { longPress: true, challengeTip: true }, streakNewsEnabled: true });
  const last = sync.syncSettings.mock.calls.at(-1)[1];
  expect(last.extras).toEqual(app.settings.extras);
  // A hint already seen is a no-op (no extra upsert).
  sync.syncSettings.mockClear();
  await act(async () => { app.setHint('longPress'); });
  expect(sync.syncSettings).not.toHaveBeenCalled();
  act(() => r.unmount());
});

test('badge migration runs inside the load: an existing install starts with the badge on', async () => {
  Object.assign(mockStore, { habits: READ, settings: withExtras({}) });
  const r = await mount();
  expect(firstRenderBadge).toBe(true);
  // The load is also the first app open (C-03).
  expect(mockStore.deviceSettings).toEqual({ badgeEnabled: true, appOpens: 1 });
  act(() => r.unmount());
});

test('each load counts one app open on this device (C-03 tips wait for the 2nd)', async () => {
  Object.assign(mockStore, { habits: READ, settings: withExtras({}), deviceSettings: { badgeEnabled: true, appOpens: 1 } });
  const r = await mount();
  expect(mockStore.deviceSettings).toEqual({ badgeEnabled: true, appOpens: 2 });
  act(() => r.unmount());
});

test('badge migration: a new install (no stored settings) starts with it off; a stored choice is kept', async () => {
  let r = await mount();
  expect(firstRenderBadge).toBe(false);
  act(() => r.unmount());
  deviceSettings.__resetDeviceSettingsForTests();
  firstRenderBadge = undefined;
  Object.assign(mockStore, { settings: withExtras({}), deviceSettings: { badgeEnabled: false } });
  r = await mount();
  expect(firstRenderBadge).toBe(false);
  act(() => r.unmount());
});
