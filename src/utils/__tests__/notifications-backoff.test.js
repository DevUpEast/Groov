import { reminderDueWithBackoff, BACKOFF_AFTER_MISSES, BACKOFF_EVERY } from '../notifications';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date', TIME_INTERVAL: 'timeInterval' },
  AndroidImportance: { HIGH: 4 },
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
}));

describe('reminder back-off', () => {
  it('reminds daily until the miss threshold, then every Nth day', () => {
    expect(BACKOFF_AFTER_MISSES).toBe(3);
    expect(BACKOFF_EVERY).toBe(3);
    expect([0, 1, 2].map(reminderDueWithBackoff)).toEqual([true, true, true]);
    expect([3, 4, 5, 6, 7, 8, 9].map(reminderDueWithBackoff)).toEqual([true, false, false, true, false, false, true]);
  });
});
