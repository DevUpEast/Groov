import { addDays } from './dates';
import { dayStatus } from './schedule';

// Count consecutive "done" days ending at `startKey`, walking backwards one calendar
// day at a time. `isDoneOnDate(key)` decides whether a given local date key counts.
export function countBackStreak(startKey, isDoneOnDate) {
  let streak = 0;
  let key = startKey;
  while (isDoneOnDate(key)) {
    streak++;
    key = addDays(key, -1);
  }
  return streak;
}

// Status of a whole day across every habit that existed that day:
//   'done'   every scheduled habit met its goal (and at least one was scheduled)
//   'rest'   nothing was scheduled (or every habit was a rest day)
//   'missed' at least one scheduled habit was not done
// `habitsOn(key)` returns the habits that existed on that day (snapshot) and
// `isDone(key, habitId)` whether a habit met its goal that day.
export function overallDayStatus(key, today, habitsOn, isDone) {
  const habits = habitsOn(key) || [];
  if (habits.length === 0) return 'rest';
  let scheduled = 0;
  for (const h of habits) {
    const st = dayStatus(h.schedule, key, today, (k) => isDone(k, h.id));
    if (st === 'missed') return 'missed';
    if (st === 'done') scheduled++;
  }
  return scheduled > 0 ? 'done' : 'rest';
}

// Overall streak: consecutive days (ending at `startKey`) where every scheduled
// habit was done. Rest days keep the chain alive without adding to it, and an
// unfinished *today* does not break the streak the user is still defending.
export function overallStreak(startKey, today, habitsOn, isDone, { maxDays = 3660 } = {}) {
  let streak = 0;
  let key = startKey;
  for (let i = 0; i < maxDays; i++) {
    const st = overallDayStatus(key, today, habitsOn, isDone);
    if (st === 'done') streak++;
    else if (st === 'missed' && key !== today) break;
    key = addDays(key, -1);
    if (key < '1970-01-01') break;
  }
  return streak;
}

// Longest overall streak between `fromKey` and `toKey` (inclusive).
export function bestOverallStreak(fromKey, toKey, today, habitsOn, isDone) {
  let best = 0, run = 0;
  let key = fromKey;
  while (key <= toKey) {
    const st = overallDayStatus(key, today, habitsOn, isDone);
    if (st === 'done') { run++; if (run > best) best = run; }
    else if (st === 'missed' && key !== today) run = 0;
    key = addDays(key, 1);
  }
  return best;
}
