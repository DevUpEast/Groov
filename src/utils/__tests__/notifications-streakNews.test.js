// C-09 review B1/M1: the real "Streak news" scheduling against a fake OS scheduler
// (expo-notifications mocked at the library level). Every pass leaves at most one note,
// tomorrow's; cancelling, sign-out and a new day's open clear every streak-news-* note.
const mockOs = new Map();
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
  getAllScheduledNotificationsAsync: jest.fn(async () => [...mockOs.entries()].map(([identifier, req]) => ({ identifier, ...req }))),
  cancelScheduledNotificationAsync: jest.fn(async (id) => { mockOs.delete(id); }),
  scheduleNotificationAsync: jest.fn(async (req) => { mockOs.set(req.identifier, req); return req.identifier; }),
}));

const Notifications = require('expo-notifications');
const {
  requestStreakNews, clearRemindersOnSignOut, cancelPendingReminderSchedule, STREAK_NEWS_HOUR, streakNewsId,
} = require('../notifications');

const CONTENT = { title: 'Streak news', body: 'A freeze covered yesterday. Your 5-day streak holds.' };
// Far enough ahead that every trigger is in the future.
const D = '2099-03-10';
const ids = () => [...mockOs.keys()].sort();
// Let the chain run (a few awaits per pass).
const settle = async () => { for (let i = 0; i < 10; i++) await tick(); };

beforeEach(() => {
  mockOs.clear();
  jest.clearAllMocks();
  cancelPendingReminderSchedule();
});

test('schedules tomorrow at STREAK_NEWS_HOUR with the given copy, without prompting', async () => {
  requestStreakNews(D, CONTENT);
  await settle();
  expect(ids()).toEqual(['streak-news-2099-03-11']);
  expect(streakNewsId(D)).toBe('streak-news-2099-03-11');
  const req = mockOs.get('streak-news-2099-03-11');
  expect(req.content).toMatchObject({ title: CONTENT.title, body: CONTENT.body, data: { kind: 'streakNews' } });
  const at = req.trigger.date;
  expect([at.getFullYear(), at.getMonth(), at.getDate(), at.getHours(), at.getMinutes()]).toEqual([2099, 2, 11, STREAK_NEWS_HOUR, 0]);
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});

test('opening the app on the next day drops this morning\'s note and keeps only the newest', async () => {
  requestStreakNews(D, CONTENT); // last night: the note for the morning of D+1
  await settle();
  // D+1: the app is open, today is again unfinished: only D+2's note remains.
  requestStreakNews('2099-03-11', CONTENT);
  await settle();
  expect(ids()).toEqual(['streak-news-2099-03-12']);
  // D+1 finished (or a fix of yesterday made the news moot): nothing remains.
  requestStreakNews('2099-03-11', null);
  await settle();
  expect(ids()).toEqual([]);
});

test('content null (opt-out, master switch off, a done or rest day) cancels every streak-news note', async () => {
  mockOs.set('streak-news-2099-03-10', {});
  mockOs.set('streak-news-2099-03-11', {});
  mockOs.set('reminder-morning', {});
  requestStreakNews(D, null);
  await settle();
  expect(ids()).toEqual(['reminder-morning']);
});

test('sign-out cancels today\'s and tomorrow\'s notes', async () => {
  mockOs.set('streak-news-2099-03-10', {});
  mockOs.set('streak-news-2099-03-11', {});
  clearRemindersOnSignOut(D);
  await settle();
  expect(ids().filter(id => id.startsWith('streak-news-'))).toEqual([]);
});

test('a newer request wins: a stale schedule never lands after a cancel', async () => {
  requestStreakNews(D, CONTENT);
  requestStreakNews(D, null);
  await settle();
  expect(ids()).toEqual([]);
});
