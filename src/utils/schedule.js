// Habit schedules.
//
//   { type: 'daily' }                       due every day (the default; also what a
//                                           missing schedule means for old habits)
//   { type: 'weekdays', days: [1,2,3,4,5] } due on the listed weekdays (0 = Sunday)
//   { type: 'perWeek', target: 3 }          due N times per calendar week (Mon-Sun);
//                                           every day is "available" but a day only
//                                           counts against the streak if the week ends
//                                           short of the target.
//
// Every helper takes local date keys ('YYYY-MM-DD'); see dates.js.

import { parseDateKey, addDays, localDateKey } from './dates';
import { t } from '../i18n';

export const DEFAULT_SCHEDULE = { type: 'daily' };
const WEEKDAY_KEYS = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];

// Two-letter weekday labels (0 = Sunday) in the current locale.
export function weekdayLabels() {
  return WEEKDAY_KEYS.map(k => t(`weekday.short.${k}`));
}

// Single-letter weekday labels (0 = Sunday) for compact charts.
export function weekdayInitials() {
  return WEEKDAY_KEYS.map(k => t(`weekday.initial.${k}`));
}

export function normalizeSchedule(schedule) {
  if (!schedule || typeof schedule !== 'object') return DEFAULT_SCHEDULE;
  if (schedule.type === 'weekdays') {
    const days = Array.isArray(schedule.days)
      ? [...new Set(schedule.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
      : [];
    return days.length === 0 || days.length === 7 ? DEFAULT_SCHEDULE : { type: 'weekdays', days };
  }
  if (schedule.type === 'perWeek') {
    const target = Math.min(6, Math.max(1, Math.round(Number(schedule.target) || 1)));
    return { type: 'perWeek', target };
  }
  return DEFAULT_SCHEDULE;
}

export function weekdayOf(key) {
  return parseDateKey(key).getDay();
}

// Monday-based start of the week containing `key`.
export function weekStart(key) {
  const dow = weekdayOf(key);
  return addDays(key, -((dow + 6) % 7));
}

// Is this habit expected on `key`? perWeek habits are always "available".
export function isScheduledOn(schedule, key) {
  const s = normalizeSchedule(schedule);
  if (s.type === 'weekdays') return s.days.includes(weekdayOf(key));
  return true;
}

// Human label for the Habits list and detail screen.
export function describeSchedule(schedule) {
  const s = normalizeSchedule(schedule);
  if (s.type === 'daily') return t('schedule.everyDay');
  if (s.type === 'perWeek') return t('schedule.perWeek', { count: s.target });
  const days = s.days;
  if (days.length === 5 && days.join() === '1,2,3,4,5') return t('schedule.weekdays');
  if (days.length === 2 && days.join() === '0,6') return t('schedule.weekends');
  const labels = weekdayLabels();
  return days.map(d => labels[d]).join(' ');
}

// Count of goal-met days for this habit in the Mon-Sun week containing `key`,
// limited to days <= `upTo` (usually today) so future days never count.
export function completionsInWeek(key, upTo, isDoneOnDate) {
  const start = weekStart(key);
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    if (d > upTo) break;
    if (isDoneOnDate(d)) n++;
  }
  return n;
}

// Days a perWeek habit still needs this week (0 when the target is met).
export function remainingThisWeek(schedule, key, isDoneOnDate) {
  const s = normalizeSchedule(schedule);
  if (s.type !== 'perWeek') return 0;
  return Math.max(0, s.target - completionsInWeek(key, key, isDoneOnDate));
}

// Streak status of one habit on one day, used by the streak walker.
//   'done'   goal met (or, for perWeek, the week's target is already met)
//   'rest'   not scheduled today; the chain is preserved but the day does not count
//   'missed' scheduled and not done
//
// For perWeek habits a day is only a miss once the week is over (or `today` has
// arrived with no way left to reach the target). Unfinished weeks are neutral.
// `isExcused(key)` (optional) marks a day the user skipped or a streak freeze covered:
// it is a rest day for that habit unless the goal was met anyway.
export function dayStatus(schedule, key, today, isDoneOnDate, isExcused) {
  const s = normalizeSchedule(schedule);
  if (isDoneOnDate(key)) return 'done';
  if (isExcused && isExcused(key)) return 'rest';
  if (s.type === 'weekdays') return s.days.includes(weekdayOf(key)) ? 'missed' : 'rest';
  if (s.type === 'daily') return 'missed';
  // perWeek: judge the day by its week. Days in a week that has already met (or can
  // still meet) the target are rest days; only a week that ended short, or can no
  // longer reach the target, marks its undone days as missed.
  const start = weekStart(key);
  const end = addDays(start, 6);
  let doneInWeek = 0, openSlots = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    if (d > today) { openSlots++; continue; }
    if (isDoneOnDate(d)) doneInWeek++;
    else if (d === today) openSlots++;
  }
  if (doneInWeek >= s.target) return 'rest';
  if (end >= today && doneInWeek + openSlots >= s.target) return 'rest';
  return 'missed';
}

// Walk back from `startKey` counting the streak for one habit.
//   - `done` days extend the streak
//   - `rest` days are skipped without breaking it
//   - the first `missed` day ends it
// `today` being unfinished never breaks a streak: a missed *today* is treated as rest
// so the number shown during the day is the streak the user is defending.
export function habitStreak(schedule, startKey, today, isDoneOnDate, { maxDays = 3660, isExcused } = {}) {
  let streak = 0;
  let key = startKey;
  for (let i = 0; i < maxDays; i++) {
    const st = dayStatus(schedule, key, today, isDoneOnDate, isExcused);
    if (st === 'done') streak++;
    else if (st === 'missed') {
      if (key === today) { key = addDays(key, -1); continue; }
      break;
    }
    key = addDays(key, -1);
    if (key < '1970-01-01') break;
  }
  return streak;
}

// Best (longest) streak between `fromKey` and `toKey` inclusive, same rules.
export function bestHabitStreak(schedule, fromKey, toKey, today, isDoneOnDate, isExcused) {
  let best = 0, run = 0;
  let key = fromKey;
  while (key <= toKey) {
    const st = dayStatus(schedule, key, today, isDoneOnDate, isExcused);
    if (st === 'done') { run++; if (run > best) best = run; }
    else if (st === 'missed' && key !== today) run = 0;
    key = addDays(key, 1);
  }
  return best;
}

// Habits (from a snapshot or the live list) that are due on `key`.
export function habitsDueOn(habits, key) {
  return (habits || []).filter(h => isScheduledOn(h.schedule, key));
}

export { localDateKey };

// "Counts as done" for the ring, challenges and the all-done celebration on `key`:
// the goal was met that day, or the habit is simply not asked of the user that day
// (unscheduled weekday, or a perWeek target already met this week).
export function isSatisfiedOn(schedule, key, isDoneOnDate) {
  if (isDoneOnDate(key)) return true;
  const s = normalizeSchedule(schedule);
  if (s.type === 'weekdays') return !s.days.includes(weekdayOf(key));
  if (s.type === 'perWeek') return completionsInWeek(key, key, isDoneOnDate) >= s.target;
  return false;
}
