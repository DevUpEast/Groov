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
// `isExcused(key, habitId)` (optional) covers skipped habit-days and frozen days.
export function overallDayStatus(key, today, habitsOn, isDone, isExcused) {
  const habits = habitsOn(key) || [];
  if (habits.length === 0) return 'rest';
  let scheduled = 0;
  for (const h of habits) {
    const st = dayStatus(h.schedule, key, today, (k) => isDone(k, h.id), isExcused ? (k) => isExcused(k, h.id) : undefined);
    if (st === 'missed') return 'missed';
    if (st === 'done') scheduled++;
  }
  return scheduled > 0 ? 'done' : 'rest';
}

// Overall streak: consecutive days (ending at `startKey`) where every scheduled
// habit was done. Rest days keep the chain alive without adding to it, and an
// unfinished *today* does not break the streak the user is still defending.
export function overallStreak(startKey, today, habitsOn, isDone, { maxDays = 3660, isExcused } = {}) {
  let streak = 0;
  let key = startKey;
  for (let i = 0; i < maxDays; i++) {
    const st = overallDayStatus(key, today, habitsOn, isDone, isExcused);
    if (st === 'done') streak++;
    else if (st === 'missed' && key !== today) break;
    key = addDays(key, -1);
    if (key < '1970-01-01') break;
  }
  return streak;
}

// Longest overall streak between `fromKey` and `toKey` (inclusive).
export function bestOverallStreak(fromKey, toKey, today, habitsOn, isDone, isExcused) {
  let best = 0, run = 0;
  let key = fromKey;
  while (key <= toKey) {
    const st = overallDayStatus(key, today, habitsOn, isDone, isExcused);
    if (st === 'done') { run++; if (run > best) best = run; }
    else if (st === 'missed' && key !== today) run = 0;
    key = addDays(key, 1);
  }
  return best;
}

// ── Streak freezes ───────────────────────────────────────────────────────────
// Up to FREEZES_PER_MONTH missed days per calendar month are covered automatically,
// so one bad day never wipes a long streak. A freeze covers the whole day for every
// habit. `freezes` is a sorted list of frozen date keys and is reconciled against
// the data each day: a day that was frozen but has since been filled in (edit
// yesterday) gives its freeze back.
export const FREEZES_PER_MONTH = 2;

export function freezesUsedInMonth(freezes, key) {
  const month = key.slice(0, 7);
  return (freezes || []).filter(f => f.slice(0, 7) === month).length;
}

export function freezesLeftInMonth(freezes, key) {
  return Math.max(0, FREEZES_PER_MONTH - freezesUsedInMonth(freezes, key));
}

// Returns the new freezes list (same reference when nothing changed). Looks at the
// `lookback` days before `today`; today itself is never frozen because it is not over.
// `rawStatus(key)` must be the overall day status WITHOUT freezes (skips included).
export function reconcileFreezes(freezes, today, rawStatus, { lookback = 7, floor } = {}) {
  let next = [...(freezes || [])];
  let changed = false;
  const frozen = new Set(next);
  for (let i = lookback; i >= 1; i--) {
    const key = addDays(today, -i);
    if (floor && key < floor) continue;
    const st = rawStatus(key);
    if (frozen.has(key)) {
      if (st !== 'missed') { next = next.filter(f => f !== key); frozen.delete(key); changed = true; }
    } else if (st === 'missed' && freezesUsedInMonth(next, key) < FREEZES_PER_MONTH) {
      next.push(key); frozen.add(key); changed = true;
    }
  }
  if (!changed) return freezes || next;
  return next.sort();
}
