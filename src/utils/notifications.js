import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { dateAt, addDays } from './dates';
import { to24h } from './time';
import { t } from '../i18n';
import { palette } from '../theme/tokens';
import { resolveAccent } from '../theme/accents';

// Android small-icon tint: the brand action colour, or the habit's accent on its own reminder.
const ACCENT = palette.light.action;
const habitTint = (habit) => resolveAccent(habit?.color, 'light').fill;

// Scheduled notification identifiers:
//   reminder-<id>        daily, from settings.reminders (global reminders)
//   habit-<habitId>      daily, from habit.reminder (per-habit reminders)
//   evening-habit-<date> one-off smart check-in for a given day
//   streak-news-<date>   one-off "Streak news" (C-09, opt-in) on the morning of <date>
const REMINDER_PREFIX = 'reminder-';
const HABIT_PREFIX = 'habit-';
const EVENING_PREFIX = 'evening-habit-';
const STREAK_NEWS_PREFIX = 'streak-news-';
// "Streak news" arrives the morning after an unfinished day, at this hour (local time).
export const STREAK_NEWS_HOUR = 9;
const LEGACY_IDS = ['morning-reminder', 'evening-reminder'];
const SNOOZE_PREFIX = 'snooze-';

// Notification categories carry the action buttons (Done / Snooze).
export const CATEGORY_HABIT = 'habit-reminder';
export const CATEGORY_GENERAL = 'general-reminder';
export const ACTION_DONE = 'done';
export const ACTION_SNOOZE = 'snooze';

// Back-off: after this many consecutive missed days a per-habit reminder only fires
// every BACKOFF_EVERY days, with gentler copy, so an ignored reminder stops nagging.
export const BACKOFF_AFTER_MISSES = 3;
export const BACKOFF_EVERY = 3;

let categoriesReady = false;
async function setupCategories() {
  if (Platform.OS === 'web' || categoriesReady) return;
  try {
    await Notifications.setNotificationCategoryAsync(CATEGORY_HABIT, [
      { identifier: ACTION_DONE, buttonTitle: t('notifications.doneAction'), options: { opensAppToForeground: false } },
      { identifier: ACTION_SNOOZE, buttonTitle: t('notifications.snoozeAction'), options: { opensAppToForeground: false } },
    ]);
    await Notifications.setNotificationCategoryAsync(CATEGORY_GENERAL, [
      { identifier: ACTION_SNOOZE, buttonTitle: t('notifications.snoozeAction'), options: { opensAppToForeground: false } },
    ]);
    categoriesReady = true;
  } catch {}
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function setupAndroidChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Groov',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: ACCENT,
    });
  } catch {}
}

// 'granted' | 'undetermined' | 'denied' without ever showing the OS dialog.
export async function getPermissionState() {
  if (Platform.OS === 'web') return 'denied';
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.status === 'granted') return 'granted';
    if (p.status === 'undetermined' || p.canAskAgain) return 'undetermined';
    return 'denied';
  } catch { return 'denied'; }
}

// Show the OS dialog (after our own primer) and report the outcome.
export async function requestOsPermission() {
  if (Platform.OS === 'web') return false;
  try {
    await setupAndroidChannel();
    await setupCategories();
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch { return false; }
}

// `prompt: false` only checks the current status and never shows the OS dialog.
async function requestPermissions({ prompt = true } = {}) {
  if (Platform.OS === 'web') return false;
  try {
    await setupAndroidChannel();
    await setupCategories();
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') return true;
    if (!prompt) return false;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (e) {
    return false;
  }
}

async function cancel(identifier) {
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
}

// Does a habit with `misses` consecutive missed days get its reminder today?
// Pure so it can be unit tested: the first BACKOFF_AFTER_MISSES misses still remind
// daily; after that only every BACKOFF_EVERY-th day.
export function reminderDueWithBackoff(misses) {
  if (misses < BACKOFF_AFTER_MISSES) return true;
  return (misses - BACKOFF_AFTER_MISSES) % BACKOFF_EVERY === 0;
}

// Build the full list of daily reminders that should exist for this state.
// `missesByHabit` maps habitId -> consecutive missed days (excluding today).
function desiredDailyReminders(settings, habits, missesByHabit = {}) {
  if (!settings?.notificationsEnabled) return [];
  const out = [];
  for (const r of settings.reminders || []) {
    if (!r.enabled || r.habitId) continue;
    const { hour, minute } = to24h(r.time);
    out.push({ identifier: `${REMINDER_PREFIX}${r.id}`, hour, minute, title: t('notifications.generalTitle', { label: r.label }), body: t('notifications.generalBody'), category: CATEGORY_GENERAL, data: { kind: 'general', reminderId: r.id } });
  }
  for (const h of habits || []) {
    if (!h.reminder?.enabled) continue;
    const misses = missesByHabit[h.id] || 0;
    if (!reminderDueWithBackoff(misses)) continue;
    const { hour, minute } = to24h(h.reminder);
    const backingOff = misses >= BACKOFF_AFTER_MISSES;
    out.push({
      identifier: `${HABIT_PREFIX}${h.id}`, hour, minute,
      title: backingOff ? t('notifications.habitTitleBackoff', { icon: h.icon ?? '🔔', name: h.name }) : t('notifications.habitTitle', { icon: h.icon ?? '🔔', name: h.name }),
      body: backingOff
        ? t('notifications.habitBodyBackoff')
        : h.intention ? t('notifications.habitBodyIntention', { intention: h.intention }) : t('notifications.habitBody'),
      category: CATEGORY_HABIT,
      color: habitTint(h),
      data: { kind: 'habit', habitId: h.id },
      // A backed-off reminder is a one-off for today, not a daily repeat, so the
      // next day's evaluation decides whether it fires again.
      oneOff: backingOff,
    });
  }
  return out;
}

// Make the OS schedule match settings + habits exactly: cancel every daily reminder
// we own (including ones for habits that no longer exist), then schedule the
// desired set. Called on launch and whenever reminders change, so a notification
// can never be left behind or dropped by a toggle.
// `prompt` controls whether a missing permission triggers the OS dialog: the launch
// pass uses false so a fresh install is never greeted with a permission prompt;
// user-initiated changes use true.
// `isStale()` (optional) is checked before every OS schedule call: a pass that a newer
// one has superseded stops there, so it can never re-add a reminder the newer pass
// cancelled. Callers should go through requestReminderSchedule, which sets it.
export async function applyReminderSchedule(settings, habits, { prompt = true, missesByHabit = {}, today, isStale = () => false } = {}) {
  if (Platform.OS === 'web') return;
  const desired = desiredDailyReminders(settings, habits, missesByHabit);

  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const ours = scheduled.filter(n =>
      n.identifier.startsWith(REMINDER_PREFIX) || n.identifier.startsWith(HABIT_PREFIX) || LEGACY_IDS.includes(n.identifier)
    );
    await Promise.all(ours.map(n => cancel(n.identifier)));
  } catch {}

  if (desired.length === 0 || isStale()) return;
  const granted = await requestPermissions({ prompt });
  if (!granted) return;

  for (const d of desired) {
    if (isStale()) return;
    try {
      let trigger = { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: d.hour, minute: d.minute };
      if (d.oneOff && today) {
        const fireDate = dateAt(today, d.hour, d.minute);
        if (fireDate <= new Date()) continue; // today's slot already passed
        trigger = { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireDate };
      }
      await Notifications.scheduleNotificationAsync({
        identifier: d.identifier,
        content: { title: d.title, body: d.body, sound: true, color: d.color ?? ACCENT, categoryIdentifier: d.category, data: d.data },
        trigger,
      });
    } catch (e) {
      console.warn('applyReminderSchedule failed for', d.identifier, e);
    }
  }
}

// ── Serialized scheduling (#186) ──────────────────────────────────────────────
// applyReminderSchedule cancels then reschedules asynchronously, so two overlapping
// passes could interleave and an older pass could re-add a reminder that a newer
// pass had just cancelled. requestReminderSchedule fixes that in three ways:
//  - bursts (launch: settings, habits and the permission state land within a few
//    renders) are debounced by REMINDER_SCHEDULE_DEBOUNCE_MS and only the latest
//    arguments are used;
//  - passes run one at a time on a single promise chain;
//  - each pass carries a generation number and stops before its next OS call as
//    soon as a newer request exists.
// A pass that throws is logged and the chain carries on, so one bad pass never
// wedges the queue. The evening check-in (requestEveningCheckIn) and the sign-out
// sweep (clearRemindersOnSignOut) run on the same chain.
export const REMINDER_SCHEDULE_DEBOUNCE_MS = 250;

let scheduleGeneration = 0;
let scheduleChain = Promise.resolve();
let pendingTimer = null;
let pendingArgs = null;
let pendingWaiters = [];

let eveningGeneration = 0;
let streakNewsGeneration = 0;

// Append a task to the single scheduling chain. A task that throws is logged and the
// chain carries on.
function enqueue(task) {
  scheduleChain = scheduleChain.then(async () => {
    try {
      await task();
    } catch (e) {
      console.warn('reminder scheduling pass failed', e);
    }
  });
  return scheduleChain;
}

function runPass(args, gen) {
  const isStale = () => gen !== scheduleGeneration;
  return enqueue(async () => {
    if (isStale()) return;
    await applyReminderSchedule(args.settings, args.habits, { ...args.options, isStale });
  });
}

// Debounced, serialized applyReminderSchedule. Resolves once the pass that covers
// this request has finished (or was superseded).
export function requestReminderSchedule(settings, habits, options = {}) {
  const gen = ++scheduleGeneration;
  pendingArgs = { settings, habits, options };
  if (pendingTimer) clearTimeout(pendingTimer);
  return new Promise((resolve) => {
    pendingWaiters.push(resolve);
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      const args = pendingArgs;
      const waiters = pendingWaiters;
      pendingArgs = null;
      pendingWaiters = [];
      runPass(args, gen).then(() => waiters.forEach(w => w()));
    }, REMINDER_SCHEDULE_DEBOUNCE_MS);
  });
}

// Drop a debounced request that has not started yet (provider unmount / sign-out)
// and stop any running pass before its next OS call.
export function cancelPendingReminderSchedule() {
  scheduleGeneration++;
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = null;
  pendingArgs = null;
  const waiters = pendingWaiters;
  pendingWaiters = [];
  waiters.forEach(w => w());
}

// Serialized evening check-in: schedule (`schedule: true`) or cancel today's smart
// check-in. Runs on the scheduling chain with its own generation, so when two
// completions land close together the latest state wins and a "habits left" check-in
// cannot be scheduled after the last habit was done.
export function requestEveningCheckIn(today, { schedule, hour = 20, minute = 0 } = {}) {
  const gen = ++eveningGeneration;
  const isStale = () => gen !== eveningGeneration;
  return enqueue(async () => {
    if (isStale()) return;
    if (schedule) await scheduleEveningHabitReminder(today, hour, minute, { isStale });
    else await cancelEveningHabitReminder(today);
  });
}

// Sign-out: drop anything queued for the old user, then (on the chain, after any
// in-flight pass) cancel every daily reminder we own and today's evening check-in,
// so the signed-out device stops firing the previous user's reminders. A later
// user's first pass is queued behind this sweep and still runs.
export function clearRemindersOnSignOut(today) {
  cancelPendingReminderSchedule();
  eveningGeneration++;
  streakNewsGeneration++;
  return enqueue(async () => {
    await applyReminderSchedule({ notificationsEnabled: false }, [], { prompt: false });
    if (today) await cancelEveningHabitReminder(today);
    await cancelStreakNews();
  });
}

// "Streak news" (C-09, opt-in, settings.extras.streakNewsEnabled): while today is unfinished,
// a one-off notification for tomorrow at STREAK_NEWS_HOUR tells what tonight's missed day
// will do to the streak ("A freeze covered yesterday. Your 12-day streak holds." / "Your
// streak ended at 12 days. Today starts a new one."). `content` is { title, body } to
// schedule, or null to cancel. Serialized on the scheduling chain with its own generation,
// like the evening check-in, so the latest state wins.
// Every pass first cancels every pending `streak-news-*` note except the one it schedules
// (C-09 review B1): this morning's note goes as soon as the app is open on that day (the
// Today card has the news, and a fix of yesterday can make the note wrong), and an opt-out,
// the master switch or sign-out leave nothing behind.
export function requestStreakNews(today, content) {
  const gen = ++streakNewsGeneration;
  const isStale = () => gen !== streakNewsGeneration;
  return enqueue(async () => {
    if (isStale()) return;
    if (content) await scheduleStreakNews(today, content, { isStale });
    else await cancelStreakNews();
  });
}

export const streakNewsId = (today) => `${STREAK_NEWS_PREFIX}${addDays(today, 1)}`;

export async function scheduleStreakNews(today, { title, body }, { isStale = () => false } = {}) {
  if (Platform.OS === 'web') return;
  const identifier = streakNewsId(today);
  await cancelStreakNews();
  // Never prompts: the Settings switch asked through the primer when it was turned on.
  const granted = await requestPermissions({ prompt: false });
  if (!granted || isStale()) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: { title, body, sound: true, color: ACCENT, data: { kind: 'streakNews' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: dateAt(addDays(today, 1), STREAK_NEWS_HOUR, 0) },
    });
  } catch (e) {
    console.warn('scheduleStreakNews failed:', e);
  }
}

// Cancel every pending "Streak news" note (by id prefix, whatever day it was for).
export async function cancelStreakNews() {
  if (Platform.OS === 'web') return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(scheduled
      .filter(n => typeof n.identifier === 'string' && n.identifier.startsWith(STREAK_NEWS_PREFIX))
      .map(n => cancel(n.identifier)));
  } catch {}
}

// Re-deliver a notification's content in `minutes` (Snooze action).
export async function snoozeNotification(content, minutes = 60) {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `${SNOOZE_PREFIX}${Date.now()}`,
      content: {
        title: content?.title ?? t('notifications.reminderTitle'), body: content?.body ?? t('notifications.generalBody'),
        sound: true, color: ACCENT, categoryIdentifier: content?.categoryIdentifier ?? undefined, data: content?.data ?? {},
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: minutes * 60 },
    });
  } catch (e) {
    console.warn('snoozeNotification failed:', e);
  }
}

// Subscribe to notification taps / action buttons. `handler({ action, data, content })`
// is also called for the response that launched the app from a cold start.
export function listenForNotificationResponses(handler) {
  if (Platform.OS === 'web') return () => {};
  const toEvent = (resp) => ({
    action: resp.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER ? 'open' : resp.actionIdentifier,
    data: resp.notification?.request?.content?.data ?? {},
    content: resp.notification?.request?.content ?? {},
    id: resp.notification?.request?.identifier ?? null,
  });
  // Action buttons do not clear the notification on Android; do it ourselves.
  const handle = (resp) => {
    const evt = toEvent(resp);
    if (evt.action !== 'open' && evt.id) Notifications.dismissNotificationAsync(evt.id).catch(() => {});
    handler(evt);
  };
  Notifications.getLastNotificationResponseAsync().then(r => { if (r) handle(r); }).catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}

// App icon badge = number of habits still to do today (iOS; best-effort on Android).
export async function setBadge(count) {
  if (Platform.OS === 'web') return;
  try { await Notifications.setBadgeCountAsync(Math.max(0, count)); } catch {}
}

// Smart check-in: a one-off notification for `today` at hour:minute, cancelled once
// every habit is done. Date-keyed identifier so each day is independent.
// `isStale()` (set by requestEveningCheckIn) is checked right before the OS call.
export async function scheduleEveningHabitReminder(today, hour = 20, minute = 0, { isStale = () => false } = {}) {
  if (Platform.OS === 'web') return;
  const identifier = `${EVENING_PREFIX}${today}`;
  await cancel(identifier);

  const fireDate = dateAt(today, hour, minute);
  if (fireDate <= new Date()) return; // time already passed today

  const granted = await requestPermissions();
  if (!granted || isStale()) return;

  try {
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: t('notifications.eveningTitle'),
        body: t('notifications.eveningBody'),
        sound: true,
        color: ACCENT,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireDate },
    });
  } catch (e) {
    console.warn('scheduleEveningHabitReminder failed:', e);
  }
}

export async function cancelEveningHabitReminder(today) {
  if (Platform.OS === 'web') return;
  await cancel(`${EVENING_PREFIX}${today}`);
}

// Dev tool: fire a reminder immediately. With a habit it mimics that habit's
// reminder (Done / Snooze actions included) so the action handling can be tested.
export async function sendTestNotification(habit) {
  if (Platform.OS === 'web') return;
  const granted = await requestPermissions();
  if (!granted) return;
  await Notifications.scheduleNotificationAsync({
    content: habit ? {
      title: t('notifications.habitTitle', { icon: habit.icon ?? '🔔', name: habit.name }),
      body: t('notifications.testBody'),
      sound: true, color: habitTint(habit), categoryIdentifier: CATEGORY_HABIT, data: { kind: 'habit', habitId: habit.id },
    } : {
      title: t('notifications.finishTitle'),
      body: t('notifications.eveningBody'),
      sound: true, color: ACCENT, categoryIdentifier: CATEGORY_GENERAL, data: { kind: 'general' },
    },
    trigger: null,
  }).catch(() => {});
}
