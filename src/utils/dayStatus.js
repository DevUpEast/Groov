// The one "done" rule for a habit on a day, shared by streaks, Perfect Days, the
// heat map, the habit detail grid, the share cards and the widget (S-08).
//
// Pure: no React, no storage. AppContext binds it to live state.
import { isGoalMet } from './habits';
import { dayStatus, normalizeSchedule } from './schedule';

// What a day's snapshot stores for each habit. Snapshot rows carry no createdAt;
// `habitsForDay` borrows it from the live list when it can.
export const snapshotOf = (habits) => (habits || []).map(h => ({
  id: h.id, name: h.name, icon: h.icon, type: h.type, volumeGoal: h.volumeGoal, schedule: normalizeSchedule(h.schedule),
}));

// Habits that count on `key`. Today always uses the live list (a stale or empty
// today snapshot can never blank the current day); past days use that day's
// snapshot and fall back to the live list when none was recorded.
// `allHabits` (default: `liveHabits`) supplies createdAt for snapshot rows, which
// do not store it; archived habits are in `allHabits` but not in `liveHabits`.
export function habitsForDay(key, today, snapshot, liveHabits, allHabits = liveHabits) {
  const live = liveHabits || [];
  const list = key === today ? live : ((snapshot && snapshot[key]) || live);
  if (!allHabits || allHabits.length === 0) return list;
  const created = new Map();
  for (const h of allHabits) if (h.createdAt) created.set(h.id, h.createdAt);
  return list.map(h => (h.createdAt || !created.has(h.id) ? h : { ...h, createdAt: created.get(h.id) }));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Give every habit a createdAt. A habit without one would count as existing on
// every day back to 1970 (an undated atMost habit is "done" on every untouched day,
// so the streak walk could run to its cap). Uses the habit's earliest logged day in
// `completions`, else `fallback` (normally today). Returns the same array when
// nothing needed stamping.
export function stampCreatedAt(habits, completions, fallback) {
  if (!Array.isArray(habits)) return habits;
  let first = null;
  const earliest = (id) => {
    if (!first) {
      first = new Map();
      for (const key of Object.keys(completions || {}).sort()) {
        if (!DATE_RE.test(key)) continue;
        for (const hid of Object.keys(completions[key] || {})) if (!first.has(hid)) first.set(hid, key);
      }
    }
    return first.get(id);
  };
  let changed = false;
  const out = habits.map(h => {
    if (!h || (typeof h.createdAt === 'string' && DATE_RE.test(h.createdAt))) return h;
    changed = true;
    return { ...h, createdAt: earliest(h.id) || fallback };
  });
  return changed ? out : habits;
}

// Earliest createdAt among `habits` (null when none is dated).
export function earliestCreatedAt(habits) {
  let min = null;
  for (const h of habits || []) if (h?.createdAt && (!min || h.createdAt < min)) min = h.createdAt;
  return min;
}

// true / false: goal met or not that day. 'before': the habit did not exist yet
// (the day is before its createdAt); callers exclude it rather than count a miss.
export function isHabitDoneOnDay(habit, key, completions) {
  if (!habit) return false;
  if (habit.createdAt && key < habit.createdAt) return 'before';
  return isGoalMet(habit, ((completions || {})[key] || {})[habit.id]);
}

// Habits the overall streak walk sees on `key`. A habit that did not exist yet is
// dropped when at least one other habit existed that day, so a mixed day is judged
// on the habits that existed. When every habit is before its createdAt the list is
// kept whole: each one reads as not done, so the day ends the walk exactly as it
// did before S-08 (no multi-year walk across days with no habits).
export function streakHabitsOn(dayHabits, key) {
  const existing = (dayHabits || []).filter(h => !(h.createdAt && key < h.createdAt));
  return existing.length > 0 ? existing : (dayHabits || []);
}

// Per-day summary for Perfect Days, the heat map, the bar chart and the share
// cards. Each habit gets a status: 'done' | 'missed' | 'rest' | 'before'.
// `total` counts only habits that were asked of the user (not rest, not before).
// `before` is true when habits exist but none of them existed yet that day: the
// day is not drawn and never counts, perfect or missed.
export function summarizeDay(key, today, dayHabits, completions, isExcused) {
  const habits = (dayHabits || []).map(h => {
    if (isHabitDoneOnDay(h, key, completions) === 'before') return { ...h, status: 'before' };
    const done = (k) => isHabitDoneOnDay(h, k, completions) === true;
    const excused = isExcused ? (k) => isExcused(k, h.id) : undefined;
    return { ...h, status: dayStatus(h.schedule, key, today, done, excused) };
  });
  const counted = habits.filter(h => h.status !== 'rest' && h.status !== 'before');
  const completed = counted.filter(h => h.status === 'done').length;
  const before = habits.length > 0 && habits.every(h => h.status === 'before');
  return { habits, completed, total: counted.length, before };
}

// The rules bound to one state, as AppContext uses them:
//   dayHabits(key)  habits on that day, createdAt filled in
//   habitsOn(key)   what the streak walk sees (streakHabitsOn)
//   isDone(key, id) the streak's per-habit test ('before' reads as not done)
//   summary(key, isExcused) the Perfect Days / heat map summary
//
// `floor` (default: the earliest createdAt in allHabits, else `accountCreatedAt`):
// before it no habit is excluded, so the walk ends where it did before S-08 even if
// some habit has no createdAt.
export function makeDayRules({ today, snapshot, liveHabits, allHabits, completions, accountCreatedAt, floor }) {
  const bound = floor !== undefined ? floor : (earliestCreatedAt(allHabits || liveHabits) || accountCreatedAt || null);
  // Streak walks ask for the same day once per habit; build each day's list once.
  const cache = new Map();
  const dayHabits = (key) => {
    if (!cache.has(key)) cache.set(key, habitsForDay(key, today, snapshot, liveHabits, allHabits));
    return cache.get(key);
  };
  return {
    dayHabits,
    floor: bound,
    habitsOn: (key) => (bound && key < bound ? dayHabits(key) : streakHabitsOn(dayHabits(key), key)),
    isDone: (key, id) => isHabitDoneOnDay(dayHabits(key).find(h => h.id === id), key, completions) === true,
    summary: (key, isExcused) => summarizeDay(key, today, dayHabits(key), completions, isExcused),
  };
}

// A day where every habit asked of the user was done (the Perfect Days rule).
export function isPerfectSummary(summary) {
  return !!summary && summary.total > 0 && summary.completed >= summary.total;
}
