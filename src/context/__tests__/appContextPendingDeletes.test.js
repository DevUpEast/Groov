// C-10 review: deletes waiting out their Snackbar Undo. A pending challenge is held out of
// effectiveChallenges (no claim, no completion, no expiry archive); the committed deletes return
// their cloud sync and update stateRef at once, so Settings' flush + push before sign-out never
// resurrects the row.
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


const TODAY = localDateKey();
const CH = (over) => ({ id: 'c1', name: 'Kickstart', description: '', days: 3, icon: '🏁', completedDays: [], completed: false, startDate: TODAY, linkedHabitIds: ['r'], ...over });
const HABITS = [{ id: 'r', name: 'Read', type: 'daily', createdAt: '2026-01-01', sortOrder: 0 }, { id: 'o', name: 'Old', type: 'daily', archived: true, createdAt: '2026-01-01', sortOrder: 1 }];

test('M2: a challenge waiting out its delete Undo is out of effectiveChallenges until released', async () => {
  Object.assign(mockStore, { habits: HABITS, challenges: [CH()] });
  const r = await mount();
  expect(app.effectiveChallenges.map(c => c.id)).toEqual(['c1']);
  await act(async () => { app.holdChallengeDelete('c1', true); });
  // Claims, the Mark-the-rest flush and Today's chips all read effectiveChallenges.
  expect(app.effectiveChallenges).toEqual([]);
  expect(app.challenges.map(c => c.id)).toEqual(['c1']);
  await act(async () => { app.holdChallengeDelete('c1', false); });
  expect(app.effectiveChallenges.map(c => c.id)).toEqual(['c1']);
  act(() => r.unmount());
});

test('M2: an expired challenge pending delete is not archived (no reward) while it waits', async () => {
  Object.assign(mockStore, { habits: HABITS, challenges: [CH()] });
  const r = await mount();
  await act(async () => { app.holdChallengeDelete('c1', true); });
  await act(async () => { app.editChallenge('c1', { startDate: addDays(TODAY, -10) }); });
  await flush();
  expect(app.challenges.map(c => c.id)).toEqual(['c1']);
  expect(app.pendingChallengeRewards).toEqual([]);
  // Undo: it is live again, and the expiry check archives it as usual.
  await act(async () => { app.holdChallengeDelete('c1', false); });
  await flush();
  expect(app.challenges).toEqual([]);
  expect(app.pendingChallengeRewards.map(c => c.id)).toEqual(['c1']);
  act(() => r.unmount());
});

test('M2: the committed delete clears the hold, archives to past and returns its cloud sync', async () => {
  Object.assign(mockStore, { habits: HABITS, challenges: [CH()] });
  const r = await mount();
  await act(async () => { app.holdChallengeDelete('c1', true); });
  let done;
  await act(async () => { done = app.deleteChallenge('c1'); });
  expect(done).toBeInstanceOf(Promise);
  await act(async () => { await done; });
  expect(sync.deleteChallengeSync).toHaveBeenCalledWith('u1', 'c1');
  expect(sync.syncPastChallenge).toHaveBeenCalled();
  expect(app.pendingChallengeDeletes).toEqual([]);
  expect(app.challenges).toEqual([]);
  expect(app.pastChallenges.map(c => c.id)).toContain('c1');
  act(() => r.unmount());
});

test('M1: a habit deleted right before sign-out is not pushed back by pushAllData', async () => {
  Object.assign(mockStore, { habits: HABITS, challenges: [CH({ linkedHabitIds: ['r', 'o'] })] });
  const r = await mount();
  let done;
  await act(async () => {
    done = app.deleteHabit('o');
    await done;
    await app.pushAllData();
  });
  expect(sync.deleteHabitSync).toHaveBeenCalledWith('u1', 'o');
  const pushed = sync.pushAllLocalData.mock.calls.at(-1)[1];
  expect(pushed.habits.map(h => h.id)).toEqual(['r']);
  expect(pushed.challenges[0].linkedHabitIds).toEqual(['r']);
  act(() => r.unmount());
});
