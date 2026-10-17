// Settings defaults and the stored-settings migration. Pure, so it can be unit tested
// without the React context (AppContext imports everything from here).

// Global reminders start off on a new install (S-05, ONB-2): the app has no
// notification permission yet, so an "on" reminder would never fire. Stored
// settings keep whatever the user had.
export const DEFAULT_REMINDERS = [
  { id: 'morning', label: 'Morning Reminder', time: { hour12: 8, minute: 0, ampm: 'AM' }, enabled: false },
  { id: 'evening', label: 'Evening Reminder', time: { hour12: 8, minute: 0, ampm: 'PM' }, enabled: false },
];

export const DEFAULT_SETTINGS = {
  notificationsEnabled: true,
  reminders: DEFAULT_REMINDERS,
  soundEnabled: true,
  hapticsEnabled: true,
  theme: 'system',
  eveningReminderEnabled: false,
  eveningReminderHour: 20,
  eveningReminderMinute: 0,
  // Streak forgiveness (#20): skips are { 'YYYY-MM-DD': [habitId] } the user chose to
  // sit out; streakFreezes are whole days covered automatically (2 per month).
  skips: {},
  streakFreezes: [],
  // Earned streak milestones: [{ id: 'streak-7', date }]. Big celebrations are
  // reserved for these (and challenge completion); a perfect day is a small cheer.
  milestones: [],
};

// Default per-habit reminder time for the time of day picked in onboarding (WID-6):
// morning 08:00, afternoon 13:00, evening 20:00. "Anytime" gets no reminder (null).
const TIME_OF_DAY_REMINDER = {
  morning: { hour12: 8, minute: 0, ampm: 'AM' },
  afternoon: { hour12: 1, minute: 0, ampm: 'PM' },
  evening: { hour12: 8, minute: 0, ampm: 'PM' },
};
export function reminderTimeForTimeOfDay(timeOfDay) {
  const t = TIME_OF_DAY_REMINDER[timeOfDay];
  return t ? { ...t } : null;
}

export function migrateSettings(s) {
  if (!s) return DEFAULT_SETTINGS;
  if (s.reminders && Array.isArray(s.reminders)) {
    return {
      ...DEFAULT_SETTINGS,
      ...s,
      skips: s.skips && typeof s.skips === 'object' ? s.skips : {},
      streakFreezes: Array.isArray(s.streakFreezes) ? s.streakFreezes : [],
      milestones: Array.isArray(s.milestones) ? s.milestones : [],
      // Per-habit reminders used to be mirrored in here; habit.reminder is now the
      // only source of truth, so drop any stale mirrors.
      reminders: s.reminders.filter(r => !r.habitId).map(r => ({
        ...r,
        time: r.time || { hour12: 8, minute: 0, ampm: 'AM' },
        enabled: r.enabled !== false,
      })),
    };
  }
  const migrateTime = (t, fallback) => {
    if (!t) return fallback;
    if (typeof t === 'object' && t.hour12 !== undefined) return t;
    const parts = String(t).split(':');
    const h = parseInt(parts[0]) || 8;
    const m = parseInt(parts[1]) || 0;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return { hour12, minute: m, ampm };
  };
  // Legacy (pre-array) settings: these users had both reminders on, so they stay on.
  return {
    ...DEFAULT_SETTINGS,
    notificationsEnabled: s.notificationsEnabled ?? true,
    soundEnabled: s.soundEnabled ?? true,
    hapticsEnabled: s.hapticsEnabled ?? true,
    theme: s.theme ?? 'system',
    eveningReminderEnabled: s.eveningReminderEnabled ?? false,
    eveningReminderHour: s.eveningReminderHour ?? 20,
    eveningReminderMinute: s.eveningReminderMinute ?? 0,
    reminders: [
      { id: 'morning', label: 'Morning Reminder', time: migrateTime(s.morningTime, { hour12: 8, minute: 0, ampm: 'AM' }), enabled: true },
      { id: 'evening', label: 'Evening Reminder', time: migrateTime(s.eveningTime, { hour12: 8, minute: 0, ampm: 'PM' }), enabled: true },
    ],
  };
}
