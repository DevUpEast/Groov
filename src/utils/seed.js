// Demo / dev-tool history seed (mockup `?demo=1`, Settings dev tools). Pure so the
// rules are testable: the caller applies the result with functional state updates.
import { addDays } from './dates';
import { snapshotOf } from './dayStatus';

export const SEED_DAYS = 30;
// The seeded history ends in a run of this many perfect days (a gap day before it), so the
// demo opens on a real overall streak (D-00's "12-day streak"). Independent random days
// alone are rarely perfect for 4 habits (~0.75^4), which gave the demo a streak of 0 and one
// done beat (C-04 carry, C-05).
export const SEED_STREAK_DAYS = 12;

// Fixed seed for the mockup demo history, so before/after shot matrices see the same data.
export const DEMO_SEED = 20261017;

// mulberry32: a small deterministic PRNG returning floats in [0, 1), like Math.random.
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Never move a habit's start later; only pull it back to `floor`.
export function backdateCreatedAt(habit, floor) {
  return habit.createdAt && habit.createdAt < floor ? habit : { ...habit, createdAt: floor };
}

// Fills the SEED_DAYS days before `today` with completions and a snapshot of `habits` for
// each of those days. The `streakDays` days before today are perfect, the day before them
// misses its first habit (so the overall streak is exactly `streakDays`), and older days
// are random. `streakDays: 0` (the dev tool) gives all-random days with no forced gap (each habit hits its goal on 55-95 % of days).
//
// - Existing data wins: seeded days go underneath `completions` and `snapshot`.
// - Today's snapshot is never replaced by a seeded or empty one: a non-empty
//   `snapshot[today]` is kept, otherwise it becomes the live list. (The old seed
//   copied a stale `today: []` over the fresh snapshot and blanked today, STA-2.)
// - Habits are backdated to `floor` (today - 31) so the seeded days are not before
//   their createdAt, which would exclude every seeded day from history.
export function buildSeed(habits, completions, snapshot, today, rand = Math.random, { streakDays = SEED_STREAK_DAYS } = {}) {
  const floor = addDays(today, -(SEED_DAYS + 1));
  const daySnapshot = snapshotOf(habits);
  const pastCompletions = {};
  const pastSnapshot = {};
  // The gap day's miss goes on a habit that an untouched day does not satisfy (not atMost).
  const gapIndex = habits.findIndex(h => h.type !== 'atMost');
  for (let i = 1; i <= SEED_DAYS; i++) {
    const key = addDays(today, -i);
    const day = {};
    habits.forEach((h, n) => {
      // Always draw, so the older random days do not depend on `streakDays`.
      const rate = 0.55 + rand() * 0.4;
      const hit = rand() < rate;
      const done = i <= streakDays ? true : streakDays > 0 && i === streakDays + 1 && n === gapIndex ? false : hit;
      if (done) day[h.id] = h.volumeGoal || 1;
    });
    if (Object.keys(day).length > 0) pastCompletions[key] = day;
    pastSnapshot[key] = daySnapshot;
  }
  return {
    floor,
    pastCompletions,
    pastSnapshot,
    completions: applySeedCompletions(completions, pastCompletions),
    snapshot: applySeedSnapshot(snapshot, pastSnapshot, today, habits),
    habits: habits.map(h => backdateCreatedAt(h, floor)),
  };
}

export function applySeedCompletions(prev, pastCompletions) {
  return { ...pastCompletions, ...(prev || {}) };
}

export function applySeedSnapshot(prev, pastSnapshot, today, habits) {
  const p = prev || {};
  return { ...pastSnapshot, ...p, [today]: p[today]?.length ? p[today] : snapshotOf(habits) };
}

// Settings → Dev tools → "Seed perfect streak N" (C-08): a deterministic run for testing the
// milestone moments. For the current `habits` it writes `n` consecutive perfect days ending
// yesterday (every habit scheduled that day gets its goal; a limit habit stays untouched,
// which meets it), writes their snapshots, and moves every habit's `createdAt` to the first
// day of the run, so the day before it has no habit and ends the chain: the overall streak is
// exactly `n`. Today's counts for these habits are cleared, so the next check-off of every
// habit takes the streak to n + 1. Skips on the run and today are dropped, and recorded
// milestones above `n` are removed so crossing them can celebrate again. Pure: the caller
// applies the result.
export function buildPerfectStreak({ habits, completions, snapshot, skips, milestones, today, n, isScheduledOn }) {
  const start = addDays(today, -n);
  const ids = new Set(habits.map(h => h.id));
  const run = habits.map(h => ({ ...h, createdAt: start }));
  const daySnapshot = snapshotOf(run);
  const nextCompletions = { ...(completions || {}) };
  const nextSnapshot = { ...(snapshot || {}) };
  const strip = (day) => Object.fromEntries(Object.entries(day || {}).filter(([id]) => !ids.has(id)));
  for (let i = 1; i <= n; i++) {
    const key = addDays(today, -i);
    const day = strip(nextCompletions[key]);
    run.forEach((h) => {
      if (h.type === 'atMost') return;
      if (isScheduledOn && !isScheduledOn(h.schedule, key)) return;
      day[h.id] = h.volumeGoal || 1;
    });
    if (Object.keys(day).length > 0) nextCompletions[key] = day; else delete nextCompletions[key];
    nextSnapshot[key] = daySnapshot;
  }
  const todayDay = strip(nextCompletions[today]);
  if (Object.keys(todayDay).length > 0) nextCompletions[today] = todayDay; else delete nextCompletions[today];
  if (!nextSnapshot[today]?.length) nextSnapshot[today] = daySnapshot;
  const nextSkips = { ...(skips || {}) };
  for (let i = 0; i <= n; i++) delete nextSkips[addDays(today, -i)];
  return {
    start,
    habits: run,
    completions: nextCompletions,
    snapshot: nextSnapshot,
    skips: nextSkips,
    milestones: (milestones || []).filter(m => !(m.days > n)),
  };
}

// ── C-09 dev tools (Settings → Dev tools) ─────────────────────────────────────
// Freezes reconcile on the real date, so the date offset cannot exercise them; these work on
// the real date instead (plan C-09, Critic A item 6). Pure: the caller applies the result.

// Drop `ids`' counts on `day` (the day disappears when nothing is left). Returns the new map
// and the [day, habitId] pairs that were cleared (the cloud rows to zero).
function clearDay(completions, day, ids) {
  const next = { ...(completions || {}) };
  const cleared = [];
  const kept = {};
  Object.entries(next[day] || {}).forEach(([id, n]) => {
    if (ids.has(id)) { if (n) cleared.push([day, id]); } else kept[id] = n;
  });
  if (Object.keys(kept).length > 0) next[day] = kept; else delete next[day];
  return { completions: next, cleared };
}

/**
 * "Simulate missed yesterday": clear yesterday's counts for the current habits and move
 * lastSeen back to two days ago (knowing every freeze except one on yesterday), so the next
 * since-last-open check sees yesterday as a day that passed while the app was away: a freeze
 * covers it if one is left this month (the freeze card), else the streak ends (the reset card).
 */
export function planMissedYesterday({ completions, habits, today, freezes, lastSeen }) {
  const yesterday = addDays(today, -1);
  const { completions: next, cleared } = clearDay(completions, yesterday, new Set(habits.map(h => h.id)));
  const before = lastSeen && typeof lastSeen === 'object' ? lastSeen : {};
  return {
    yesterday,
    completions: next,
    cleared,
    lastSeen: {
      ...before,
      date: addDays(today, -2),
      freezesUsed: (freezes || []).filter(f => f !== yesterday),
    },
  };
}

/**
 * "Use up freezes this month": this month's freezes become the 1st and the 2nd, with their
 * counts cleared, so both are genuinely missed days a freeze covers and the reconcile keeps
 * them; freezesLeftInMonth then reads 0 and a later missed day ends the streak. Any other
 * freeze this month is released (on yesterday, it no longer covers the day). Needs two earlier
 * days of the month: null on the 1st and 2nd.
 */
export function planUseUpFreezes({ completions, habits, today, freezes }) {
  if (Number(today.slice(8, 10)) < 3) return null;
  const month = today.slice(0, 7);
  const days = [`${month}-01`, `${month}-02`];
  const ids = new Set(habits.map(h => h.id));
  let next = completions;
  const cleared = [];
  days.forEach((day) => {
    const r = clearDay(next, day, ids);
    next = r.completions;
    cleared.push(...r.cleared);
  });
  const others = (freezes || []).filter(f => f.slice(0, 7) !== month);
  return { days, completions: next, cleared, freezes: [...others, ...days].sort() };
}
