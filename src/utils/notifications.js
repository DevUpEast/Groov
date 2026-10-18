import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { dateAt } from './dates';
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
const REMINDER_PREFIX = 'reminder-';
const HABIT_PREFIX = 'habit-';
const EVENING_PREFIX = 'evening-habit-';
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
export async function applyReminderSchedule(settings, habits, { prompt = true, missesByHabit = {}, today } = {}) {
  if (Platform.OS === 'web') return;
  const desired = desiredDailyReminders(settings, habits, missesByHabit);

  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const ours = scheduled.filter(n =>
      n.identifier.startsWith(REMINDER_PREFIX) || n.identifier.startsWith(HABIT_PREFIX) || LEGACY_IDS.includes(n.identifier)
    );
    await Promise.all(ours.map(n => cancel(n.identifier)));
  } catch {}

  if (desired.length === 0) return;
  const granted = await requestPermissions({ prompt });
  if (!granted) return;

  for (const d of desired) {
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
export async function scheduleEveningHabitReminder(today, hour = 20, minute = 0) {
  if (Platform.OS === 'web') return;
  const identifier = `${EVENING_PREFIX}${today}`;
  await cancel(identifier);

  const fireDate = dateAt(today, hour, minute);
  if (fireDate <= new Date()) return; // time already passed today

  const granted = await requestPermissions();
  if (!granted) return;

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
