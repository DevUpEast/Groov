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
  // S-10: synced keys the settings row has no column for (the `extras` jsonb column).
  // Every new synced setting goes in here; no new top-level key may be added (a jest
  // check round-trips DEFAULT_SETTINGS through settingsToRow/rowToSettings).
  extras: {},
};

// ── S-10 key classification ──────────────────────────────────────────────────
// Synced settings live in the `settings` row: the top-level keys above each have a
// column, and everything else synced goes in `extras` (one jsonb column). Device-local
// state lives in src/utils/deviceSettings.js and never syncs. The full table is in
// CLAUDE.md ("Settings persistence").
//
// Known `extras` keys and how two copies merge (cloud pull, backup import):
// - `hints` { hintId: true }: OR-merged per id, so a dismissed tip never comes back,
//   whichever device synced last (C-03 longPress, X-01 challengeTip, O-01b linkPrompt).
// - `milestonesBackfilled` (C-08): OR-merged.
// - `streakNewsEnabled` (C-09) and any other key: the incoming copy wins; a key only
//   one side has is kept, so keys a newer app version wrote survive an older merge.
export const EXTRAS_OR_FLAGS = ['milestonesBackfilled'];
export const EXTRAS_OR_MAPS = ['hints'];

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

export function normalizeExtras(extras) {
  return isPlainObject(extras) ? extras : {};
}

// Merge two `extras` objects: `incoming` (cloud or backup) wins per key, except the
// monotonic OR keys, where a `true` on either side stays `true`.
export function mergeExtras(incoming, local) {
  const a = normalizeExtras(incoming);
  const b = normalizeExtras(local);
  const out = { ...b, ...a };
  for (const key of EXTRAS_OR_FLAGS) {
    if (a[key] === true || b[key] === true) out[key] = true;
  }
  for (const key of EXTRAS_OR_MAPS) {
    if (!(key in a) && !(key in b)) continue;
    const ma = normalizeExtras(a[key]);
    const mb = normalizeExtras(b[key]);
    const merged = { ...mb, ...ma };
    for (const id of Object.keys(merged)) if (ma[id] === true || mb[id] === true) merged[id] = true;
    out[key] = merged;
  }
  return out;
}

// `extras` with one hint marked seen (C-03, X-01, O-01b call this via AppContext.setHint).
export function withHint(settings, hintId) {
  const extras = normalizeExtras(settings?.extras);
  const hints = normalizeExtras(extras.hints);
  if (hints[hintId] === true) return extras;
  return { ...extras, hints: { ...hints, [hintId]: true } };
}

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

// Normalise stored or pulled settings. With `local` (a cloud pull or a backup import
// over current state), the incoming copy wins per top-level key and `extras` is merged
// with mergeExtras, so a local extras key the cloud lacks (an old server without the
// column, or another app version) is never wiped. Unknown top-level keys are dropped
// on a merge: nothing may live outside `extras`.
export function migrateSettings(s, local) {
  if (local === undefined) return migrateOne(s);
  const base = migrateOne(s);
  const known = Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((k) => [k, base[k]]));
  return { ...known, extras: mergeExtras(s ? s.extras : {}, local ? local.extras : {}) };
}

function migrateOne(s) {
  if (!s) return DEFAULT_SETTINGS;
  if (s.reminders && Array.isArray(s.reminders)) {
    return {
      ...DEFAULT_SETTINGS,
      ...s,
      skips: s.skips && typeof s.skips === 'object' ? s.skips : {},
      streakFreezes: Array.isArray(s.streakFreezes) ? s.streakFreezes : [],
      milestones: Array.isArray(s.milestones) ? s.milestones : [],
      extras: normalizeExtras(s.extras),
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
