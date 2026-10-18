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

// ── Since last open (C-09) ───────────────────────────────────────────────────
// One-time Today cards for what happened to the streak while the app was away: a freeze
// covered a day ("A freeze covered yesterday. Your 12-day streak holds."), or the streak
// ended ("Your streak ended at 12 days. Today starts a new one."), and after a reset the
// first check-off is greeted with "Back on beat." `lastSeen` (deviceSettings, device-local,
// so a cloud pull can never move it) is { date, streak, freezesUsed, backOnBeat? }.

// A streak this long or longer gets the reset card when it ends (a 1-day run is not news).
export const RESET_MIN_STREAK = 2;
// How far back the reset walk looks for the day that ended the streak.
export const SINCE_LAST_OPEN_MAX_DAYS = 60;

const isDateKey = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k);

/**
 * Compare the last-seen state with now. Pure.
 *
 * `prev`: the stored lastSeen, or null on the first run on this device / account.
 * `now`: { date (the real local date), streak (the overall streak now; today unfinished does
 *   not break it), freezes (settings.streakFreezes, already reconciled), statusOf(key) (the
 *   overall day status with freezes and skips applied: 'done' | 'rest' | 'missed'),
 *   streakEndingOn(key) (the overall streak counted back from a past day) }.
 *
 * Returns { event, lastSeen }: `event` is null, { kind: 'freeze', covered, count, streak } or
 * { kind: 'reset', ended }, and `lastSeen` is what to store.
 * - No previous record (first run, new device, account switch): nothing fires.
 * - Same date (or the clock went back): nothing fires; the record just follows the data, so
 *   an in-session edit (un-checking yesterday spends a freeze) is never announced later.
 * - A new date: freezes spent on days since the last open that the record did not know are
 *   news while the streak stands; the streak ending on a day since the last open (a missed day
 *   no freeze covered, a run of RESET_MIN_STREAK+ before it, and no new streak since) is news.
 *   A reset arms "Back on beat" (`backOnBeat` = the reset date) for the next check-off; a
 *   streak that is going again by the next new date drops it.
 */
export function sinceLastOpen(prev, now) {
  const freezes = Array.isArray(now.freezes) ? now.freezes : [];
  const valid = prev && typeof prev === 'object' && isDateKey(prev.date);
  const lastSeen = { date: now.date, streak: now.streak, freezesUsed: freezes };
  if (valid && isDateKey(prev.backOnBeat)) lastSeen.backOnBeat = prev.backOnBeat;
  if (!valid || prev.date >= now.date) return { event: null, lastSeen };

  // A new date: a running streak means the user is already back (another device, the widget).
  if (now.streak > 0) delete lastSeen.backOnBeat;

  // Uncovered missed days between the last open (inclusive: it may have ended unfinished
  // after the app was closed) and yesterday. The streak that ended is the longest run going
  // into one of them: usually the one the user had at the last open, ended by the first.
  let missed = false;
  let ended = 0;
  let key = addDays(now.date, -1);
  for (let i = 0; i < SINCE_LAST_OPEN_MAX_DAYS && key >= prev.date; i++) {
    if (now.statusOf(key) === 'missed') {
      missed = true;
      if (now.streak === 0) ended = Math.max(ended, now.streakEndingOn(addDays(key, -1)));
    }
    key = addDays(key, -1);
  }
  if (missed && now.streak === 0) {
    if (ended >= RESET_MIN_STREAK) {
      lastSeen.backOnBeat = now.date;
      return { event: { kind: 'reset', ended }, lastSeen };
    }
    return { event: null, lastSeen };
  }

  const known = new Set(Array.isArray(prev.freezesUsed) ? prev.freezesUsed : []);
  const spent = freezes.filter(f => !known.has(f) && f >= prev.date && f < now.date).sort();
  if (spent.length > 0 && now.streak > 0) {
    return { event: { kind: 'freeze', covered: spent[spent.length - 1], count: spent.length, streak: now.streak }, lastSeen };
  }
  return { event: null, lastSeen };
}

/** Whether two lastSeen records are the same (skip the write when nothing changed). */
export function sameLastSeen(a, b) {
  if (!a || !b) return a === b;
  const fa = a.freezesUsed || [];
  const fb = b.freezesUsed || [];
  return a.date === b.date && a.streak === b.streak && (a.backOnBeat || null) === (b.backOnBeat || null)
    && fa.length === fb.length && fa.every((f, i) => f === fb[i]);
}

/**
 * The opt-in "Streak news" notification for tomorrow morning, predicted tonight. Pure.
 * `todayStatus` is today judged as if it were over (overallDayStatus with tomorrow as
 * "today"): 'missed' while a scheduled habit is still open. Returns null (nothing to say),
 * { kind: 'freeze', streak } (a freeze is left this month, so tomorrow it covers today) or
 * { kind: 'reset', ended }.
 */
export function streakNewsTonight({ todayStatus, streak, freezesLeft }) {
  if (todayStatus !== 'missed') return null;
  if (freezesLeft > 0) return streak >= 1 ? { kind: 'freeze', streak } : null;
  return streak >= RESET_MIN_STREAK ? { kind: 'reset', ended: streak } : null;
}
