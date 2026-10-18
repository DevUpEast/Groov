import { DEFAULT_SETTINGS, DEFAULT_REMINDERS, migrateSettings, reminderTimeForTimeOfDay } from '../settings';

describe('migrateSettings', () => {
  test('a new install (no stored settings) gets the global reminders switched off', () => {
    const s = migrateSettings(null);
    expect(s).toBe(DEFAULT_SETTINGS);
    expect(s.reminders.map(r => r.enabled)).toEqual([false, false]);
    expect(DEFAULT_REMINDERS.every(r => r.enabled === false)).toBe(true);
  });

  test('array branch keeps stored reminders exactly, on and off', () => {
    const stored = {
      notificationsEnabled: true,
      reminders: [
        { id: 'morning', label: 'Morning Reminder', time: { hour12: 7, minute: 30, ampm: 'AM' }, enabled: true },
        { id: 'evening', label: 'Evening Reminder', time: { hour12: 9, minute: 15, ampm: 'PM' }, enabled: false },
        { id: 'r-1', label: 'Lunch', time: { hour12: 12, minute: 0, ampm: 'PM' } },
      ],
    };
    const s = migrateSettings(stored);
    expect(s.reminders).toEqual([
      { id: 'morning', label: 'Morning Reminder', time: { hour12: 7, minute: 30, ampm: 'AM' }, enabled: true },
      { id: 'evening', label: 'Evening Reminder', time: { hour12: 9, minute: 15, ampm: 'PM' }, enabled: false },
      // A reminder saved before `enabled` existed counts as on.
      { id: 'r-1', label: 'Lunch', time: { hour12: 12, minute: 0, ampm: 'PM' }, enabled: true },
    ]);
  });

  test('array branch drops the old per-habit mirrors', () => {
    const s = migrateSettings({ reminders: [{ id: 'h', habitId: '42', time: { hour12: 8, minute: 0, ampm: 'AM' }, enabled: true }] });
    expect(s.reminders).toEqual([]);
  });

  test('legacy (pre-array) settings keep both reminders on at their stored times', () => {
    const s = migrateSettings({ notificationsEnabled: false, morningTime: '07:45', eveningTime: '21:30', theme: 'dark' });
    expect(s.notificationsEnabled).toBe(false);
    expect(s.theme).toBe('dark');
    expect(s.reminders).toEqual([
      { id: 'morning', label: 'Morning Reminder', time: { hour12: 7, minute: 45, ampm: 'AM' }, enabled: true },
      { id: 'evening', label: 'Evening Reminder', time: { hour12: 9, minute: 30, ampm: 'PM' }, enabled: true },
    ]);
  });

  test('legacy settings without times fall back to 8 AM / 8 PM, still on', () => {
    const s = migrateSettings({ soundEnabled: false });
    expect(s.soundEnabled).toBe(false);
    expect(s.reminders.map(r => [r.time, r.enabled])).toEqual([
      [{ hour12: 8, minute: 0, ampm: 'AM' }, true],
      [{ hour12: 8, minute: 0, ampm: 'PM' }, true],
    ]);
  });
});

describe('reminderTimeForTimeOfDay', () => {
  test('maps the onboarding time of day to a reminder time', () => {
    expect(reminderTimeForTimeOfDay('morning')).toEqual({ hour12: 8, minute: 0, ampm: 'AM' });
    expect(reminderTimeForTimeOfDay('afternoon')).toEqual({ hour12: 1, minute: 0, ampm: 'PM' });
    expect(reminderTimeForTimeOfDay('evening')).toEqual({ hour12: 8, minute: 0, ampm: 'PM' });
  });

  test('anytime (or unknown) gets no reminder', () => {
    expect(reminderTimeForTimeOfDay('anytime')).toBeNull();
    expect(reminderTimeForTimeOfDay(undefined)).toBeNull();
  });

  test('returns a fresh object each time', () => {
    const a = reminderTimeForTimeOfDay('morning');
    a.hour12 = 11;
    expect(reminderTimeForTimeOfDay('morning').hour12).toBe(8);
  });
});

// C-08 review B1: milestones are once ever, so a pull merges them as a union.
describe('mergeMilestones / migrateSettings milestones', () => {
  const { mergeMilestones, migrateSettings: migrate } = require('../settings');
  const m = (days, extra = {}) => ({ id: `streak-${days}`, days, date: '2026-10-18', ...extra });
  test('keeps local entries the incoming copy lacks; incoming wins per id; ordered by days', () => {
    const out = mergeMilestones([m(7, { date: '2026-10-01' })], [m(14, { silent: true }), m(7), m(3, { silent: true })]);
    expect(out.map(x => x.id)).toEqual(['streak-3', 'streak-7', 'streak-14']);
    expect(out[1].date).toBe('2026-10-01');
  });
  test('a cloud pull over local settings unions the milestones', () => {
    const local = migrate({ reminders: [], milestones: [m(3, { silent: true })] });
    const merged = migrate({ reminders: [], milestones: [m(1, { silent: true })] }, local);
    expect(merged.milestones.map(x => x.id)).toEqual(['streak-1', 'streak-3']);
  });
  test('bad input is ignored', () => {
    expect(mergeMilestones(null, undefined)).toEqual([]);
    expect(mergeMilestones([null, {}], 'x')).toEqual([]);
  });
});
