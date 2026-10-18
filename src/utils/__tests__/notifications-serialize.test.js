// #186: reminder scheduling passes are debounced and serialized so an older pass can
// never re-add a reminder that a newer pass cancelled.

// A fake OS scheduler. Every call is async so passes really interleave, and
// `mockGate` lets a test hold a pass open in the middle of its cancel step.
const mockOs = new Map();
let mockGate = null;
const tick = () => new Promise(r => setImmediate(r));

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date', TIME_INTERVAL: 'timeInterval' },
  AndroidImportance: { HIGH: 4 },
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  setNotificationChannelAsync: jest.fn(async () => {}),
  setNotificationCategoryAsync: jest.fn(async () => {}),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getAllScheduledNotificationsAsync: jest.fn(async () => {
    const list = [...mockOs.keys()].map(identifier => ({ identifier }));
    if (mockGate) await mockGate;
    return list;
  }),
  cancelScheduledNotificationAsync: jest.fn(async (id) => { await null; mockOs.delete(id); }),
  scheduleNotificationAsync: jest.fn(async ({ identifier }) => { await null; mockOs.set(identifier, true); return identifier; }),
}));

const Notifications = require('expo-notifications');
const {
  requestReminderSchedule, cancelPendingReminderSchedule, applyReminderSchedule, REMINDER_SCHEDULE_DEBOUNCE_MS,
} = require('../notifications');

const morning = (enabled) => ({ id: 'm', label: 'Morning', time: { hour12: 8, minute: 0, ampm: 'AM' }, enabled });
const settingsWith = (enabled) => ({ notificationsEnabled: true, reminders: [morning(enabled)] });

beforeEach(() => {
  mockOs.clear();
  mockGate = null;
  jest.clearAllMocks();
  cancelPendingReminderSchedule();
});

// Lets debounce timers fire and every queued pass settle.
async function settle() {
  for (let i = 0; i < 20; i++) {
    jest.advanceTimersByTime(REMINDER_SCHEDULE_DEBOUNCE_MS);
    await tick();
  }
}

describe('serialized reminder scheduling', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] }));
  afterEach(() => jest.useRealTimers());

  it('the debounce is a named constant', () => {
    expect(REMINDER_SCHEDULE_DEBOUNCE_MS).toBeGreaterThan(0);
    expect(REMINDER_SCHEDULE_DEBOUNCE_MS).toBeLessThanOrEqual(500);
  });

  it('unserialized passes can race: an older pass re-adds a cancelled reminder (the bug)', async () => {
    jest.useRealTimers();
    let release;
    mockGate = new Promise(r => { release = r; });
    const older = applyReminderSchedule(settingsWith(true), [], { prompt: false });
    await tick();
    mockGate = null;
    await applyReminderSchedule(settingsWith(false), [], { prompt: false }); // newer: off
    release();
    await older;
    expect(mockOs.has('reminder-m')).toBe(true); // the off reminder came back
  });

  it('two overlapping passes: the later state wins and an off reminder stays off', async () => {
    // First pass turns the reminder on and is held open mid-cancel.
    let release;
    mockGate = new Promise(r => { release = r; });
    const first = requestReminderSchedule(settingsWith(true), [], { prompt: false });
    jest.advanceTimersByTime(REMINDER_SCHEDULE_DEBOUNCE_MS);
    await tick();
    expect(Notifications.getAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);

    // The user turns it off while the first pass is still in flight.
    mockGate = null;
    const second = requestReminderSchedule(settingsWith(false), [], { prompt: false });
    release();
    await settle();
    await Promise.all([first, second]);

    expect(mockOs.has('reminder-m')).toBe(false);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('on -> off -> on -> off in quick succession leaves it off', async () => {
    for (const on of [true, false, true, false]) {
      requestReminderSchedule(settingsWith(on), [], { prompt: false });
      jest.advanceTimersByTime(REMINDER_SCHEDULE_DEBOUNCE_MS / 2);
      await tick();
    }
    await settle();
    expect(mockOs.has('reminder-m')).toBe(false);
  });

  it('a burst of N changes results in one effective schedule pass', async () => {
    const N = 8;
    const done = [];
    for (let i = 0; i < N; i++) {
      done.push(requestReminderSchedule(settingsWith(i % 2 === 1), [], { prompt: false }));
    }
    await settle();
    await Promise.all(done);
    // One pass: one read of the OS list and one schedule call for the final (on) state.
    expect(Notifications.getAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mockOs.has('reminder-m')).toBe(true);
  });

  it('an error in one pass does not wedge the queue', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // `reminders: 5` is not iterable, so building the desired list throws.
    await Promise.all([requestReminderSchedule({ notificationsEnabled: true, reminders: 5 }, [], {}), settle()]);
    expect(warn).toHaveBeenCalledWith('reminder scheduling pass failed', expect.any(TypeError));

    await Promise.all([requestReminderSchedule(settingsWith(true), [], { prompt: false }), settle()]);
    expect(mockOs.has('reminder-m')).toBe(true);
    warn.mockRestore();
  });

  it('per-habit back-off still applies through the queue', async () => {
    const habit = { id: 'h1', name: 'Read', icon: null, reminder: { enabled: true, hour12: 9, minute: 0, ampm: 'PM' } };
    await Promise.all([requestReminderSchedule({ notificationsEnabled: true, reminders: [] }, [habit], { missesByHabit: { h1: 4 } }), settle()]);
    expect(mockOs.has('habit-h1')).toBe(false);
    await Promise.all([requestReminderSchedule({ notificationsEnabled: true, reminders: [] }, [habit], { missesByHabit: { h1: 1 } }), settle()]);
    expect(mockOs.has('habit-h1')).toBe(true);
    expect(Notifications.scheduleNotificationAsync.mock.calls.at(-1)[0].content.categoryIdentifier).toBe('habit-reminder');
  });

  it('cancelPendingReminderSchedule drops a queued pass', async () => {
    requestReminderSchedule(settingsWith(true), [], { prompt: false });
    cancelPendingReminderSchedule();
    await settle();
    expect(Notifications.getAllScheduledNotificationsAsync).not.toHaveBeenCalled();
    expect(mockOs.has('reminder-m')).toBe(false);
  });
});
