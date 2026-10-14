import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { dateAt } from './dates';
import { to24h } from './time';

const ACCENT = '#4F46E5';

// Scheduled notification identifiers:
//   reminder-<id>        daily, from settings.reminders (global reminders)
//   habit-<habitId>      daily, from habit.reminder (per-habit reminders)
//   evening-habit-<date> one-off smart check-in for a given day
const REMINDER_PREFIX = 'reminder-';
const HABIT_PREFIX = 'habit-';
const EVENING_PREFIX = 'evening-habit-';
const LEGACY_IDS = ['morning-reminder', 'evening-reminder'];

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

// `prompt: false` only checks the current status and never shows the OS dialog.
async function requestPermissions({ prompt = true } = {}) {
  if (Platform.OS === 'web') return false;
  try {
    await setupAndroidChannel();
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

// Build the full list of daily reminders that should exist for this state.
function desiredDailyReminders(settings, habits) {
  if (!settings?.notificationsEnabled) return [];
  const out = [];
  for (const r of settings.reminders || []) {
    if (!r.enabled || r.habitId) continue;
    const { hour, minute } = to24h(r.time);
    out.push({ identifier: `${REMINDER_PREFIX}${r.id}`, hour, minute, title: `🔔 ${r.label}`, body: 'Time to check your habits!' });
  }
  for (const h of habits || []) {
    if (!h.reminder?.enabled) continue;
    const { hour, minute } = to24h(h.reminder);
    out.push({ identifier: `${HABIT_PREFIX}${h.id}`, hour, minute, title: `${h.icon ?? '🔔'} Time for: ${h.name}`, body: 'Tap to log your habit!' });
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
export async function applyReminderSchedule(settings, habits, { prompt = true } = {}) {
  if (Platform.OS === 'web') return;
  const desired = desiredDailyReminders(settings, habits);

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
      await Notifications.scheduleNotificationAsync({
        identifier: d.identifier,
        content: { title: d.title, body: d.body, sound: true, color: ACCENT },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: d.hour, minute: d.minute },
      });
    } catch (e) {
      console.warn('applyReminderSchedule failed for', d.identifier, e);
    }
  }
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
        title: '🌙 Habit Check-in',
        body: "You still have habits left to complete today. Keep that streak going!",
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

// Dev tool: fire an evening-style notification immediately
export async function sendTestNotification() {
  if (Platform.OS === 'web') return;
  const granted = await requestPermissions();
  if (!granted) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Finish Habits',
      body: "You still have habits left to complete today. Keep that streak going!",
      sound: true,
      color: ACCENT,
    },
    trigger: null,
  }).catch(() => {});
}
