import { buildSeed, applySeedSnapshot, applySeedCompletions, backdateCreatedAt, SEED_DAYS, seededRandom, DEMO_SEED } from '../seed';
import { makeDayRules, snapshotOf } from '../dayStatus';
import { overallStreak, bestOverallStreak } from '../streaks';
import { addDays } from '../dates';

const TODAY = '2026-10-17';
const habits = [
  { id: '1', name: 'Move', type: 'daily', volumeGoal: 1, createdAt: TODAY },
  { id: '2', name: 'Water', type: 'volume', volumeGoal: 8, createdAt: TODAY },
];
const always = () => 0; // rand() = 0: every habit hits its goal every seeded day

describe('buildSeed (demo / dev-tool history)', () => {
  it("keeps a non-empty today snapshot and repairs an empty one from the live list (STA-2)", () => {
    const kept = [{ id: '1', name: 'Move', type: 'daily', volumeGoal: 1, schedule: { type: 'daily' } }];
    expect(buildSeed(habits, {}, { [TODAY]: kept }, TODAY, always).snapshot[TODAY]).toBe(kept);
    // The stale closure value the old seed copied over the fresh snapshot:
    expect(buildSeed(habits, {}, { [TODAY]: [] }, TODAY, always).snapshot[TODAY]).toEqual(snapshotOf(habits));
    expect(buildSeed(habits, {}, {}, TODAY, always).snapshot[TODAY]).toEqual(snapshotOf(habits));
  });

  it('backdates createdAt to the floor (today - 31) and never moves an older start later', () => {
    const seed = buildSeed(habits, {}, {}, TODAY, always);
    expect(seed.floor).toBe(addDays(TODAY, -31));
    expect(seed.habits.map(h => h.createdAt)).toEqual([seed.floor, seed.floor]);
    const old = { id: '9', createdAt: '2025-01-01' };
    expect(backdateCreatedAt(old, seed.floor)).toBe(old);
  });

  it('seeds the 30 days before today, never today, under existing data', () => {
    const existing = { [TODAY]: { 1: 1 }, [addDays(TODAY, -2)]: { 2: 3 } };
    const seed = buildSeed(habits, existing, {}, TODAY, always);
    expect(Object.keys(seed.pastSnapshot)).toHaveLength(SEED_DAYS);
    expect(seed.pastCompletions[TODAY]).toBeUndefined();
    expect(seed.completions[TODAY]).toEqual({ 1: 1 });
    expect(seed.completions[addDays(TODAY, -2)]).toEqual({ 2: 3 }); // existing data wins
    expect(seed.completions[addDays(TODAY, -1)]).toEqual({ 1: 1, 2: 8 });
    expect(seed.completions[addDays(TODAY, -31)]).toBeUndefined();
  });

  it('the functional updaters keep a fresh today snapshot that the stale closure missed', () => {
    const seed = buildSeed(habits, {}, { [TODAY]: [] }, TODAY, always);
    const fresh = { [TODAY]: snapshotOf(habits) }; // what the snapshot effect queued first
    const next = applySeedSnapshot(fresh, seed.pastSnapshot, TODAY, habits);
    expect(next[TODAY]).toBe(fresh[TODAY]);
    expect(applySeedCompletions({ [TODAY]: { 1: 1 } }, seed.pastCompletions)[TODAY]).toEqual({ 1: 1 });
  });

  it('seeded history counts after backdating: Mark-all today gives a 31-day streak', () => {
    const seed = buildSeed(habits, { [TODAY]: { 1: 1, 2: 8 } }, { [TODAY]: [] }, TODAY, always);
    const rules = makeDayRules({ today: TODAY, snapshot: seed.snapshot, liveHabits: seed.habits, allHabits: seed.habits, completions: seed.completions });
    expect(rules.summary(TODAY)).toMatchObject({ completed: 2, total: 2 });
    expect(overallStreak(TODAY, TODAY, rules.habitsOn, rules.isDone)).toBe(SEED_DAYS + 1);
    expect(bestOverallStreak(seed.floor, TODAY, TODAY, rules.habitsOn, rules.isDone)).toBe(SEED_DAYS + 1);
    // Without the backdate every seeded day would be before createdAt and excluded.
    const notBackdated = makeDayRules({ today: TODAY, snapshot: seed.snapshot, liveHabits: habits, allHabits: habits, completions: seed.completions });
    expect(notBackdated.summary(addDays(TODAY, -1))).toMatchObject({ before: true, total: 0 });
  });
});

describe('seededRandom (deterministic mockup demo history)', () => {
  it('repeats the same sequence for the same seed and stays in [0, 1)', () => {
    const a = seededRandom(DEMO_SEED);
    const b = seededRandom(DEMO_SEED);
    const xs = Array.from({ length: 200 }, () => a());
    expect(Array.from({ length: 200 }, () => b())).toEqual(xs);
    expect(xs.every(x => x >= 0 && x < 1)).toBe(true);
    expect(new Set(xs).size).toBeGreaterThan(190);
    expect(seededRandom(DEMO_SEED + 1)()).not.toBe(xs[0]);
  });

  it('gives buildSeed identical history on every run', () => {
    const one = buildSeed(habits, {}, {}, TODAY, seededRandom(DEMO_SEED));
    const two = buildSeed(habits, {}, {}, TODAY, seededRandom(DEMO_SEED));
    expect(two.completions).toEqual(one.completions);
    expect(two.snapshot).toEqual(one.snapshot);
  });
});
