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
