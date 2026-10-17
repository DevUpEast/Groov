// Demo / dev-tool history seed (mockup `?demo=1`, Settings dev tools). Pure so the
// rules are testable: the caller applies the result with functional state updates.
import { addDays } from './dates';
import { snapshotOf } from './dayStatus';

export const SEED_DAYS = 30;

// Never move a habit's start later; only pull it back to `floor`.
export function backdateCreatedAt(habit, floor) {
  return habit.createdAt && habit.createdAt < floor ? habit : { ...habit, createdAt: floor };
}

// Fills the SEED_DAYS days before `today` with random completions (each habit hits
// its goal on 55-95 % of days) and a snapshot of `habits` for each of those days.
//
// - Existing data wins: seeded days go underneath `completions` and `snapshot`.
// - Today's snapshot is never replaced by a seeded or empty one: a non-empty
//   `snapshot[today]` is kept, otherwise it becomes the live list. (The old seed
//   copied a stale `today: []` over the fresh snapshot and blanked today, STA-2.)
// - Habits are backdated to `floor` (today - 31) so the seeded days are not before
//   their createdAt, which would exclude every seeded day from history.
export function buildSeed(habits, completions, snapshot, today, rand = Math.random) {
  const floor = addDays(today, -(SEED_DAYS + 1));
  const daySnapshot = snapshotOf(habits);
  const pastCompletions = {};
  const pastSnapshot = {};
  for (let i = 1; i <= SEED_DAYS; i++) {
    const key = addDays(today, -i);
    const day = {};
    for (const h of habits) {
      const rate = 0.55 + rand() * 0.4;
      if (rand() < rate) day[h.id] = h.volumeGoal || 1;
    }
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
