import {
  snapshotOf, habitsForDay, isHabitDoneOnDay, streakHabitsOn, summarizeDay, makeDayRules, isPerfectSummary,
  stampCreatedAt, earliestCreatedAt,
} from '../dayStatus';
import { overallDayStatus, overallStreak, bestOverallStreak } from '../streaks';
import { addDays } from '../dates';

// 2026-10-17 is a Saturday; its week starts Monday 2026-10-12.
const TODAY = '2026-10-17';
const d = (n) => addDays(TODAY, -n);

// Streak numbers exactly as AppContext computes them (getOverallStreak / getBestStreak).
function streaks(rules, { from, isExcused } = {}) {
  const current = overallStreak(TODAY, TODAY, rules.habitsOn, rules.isDone, { isExcused });
  const best = Math.max(bestOverallStreak(from || d(60), TODAY, TODAY, rules.habitsOn, rules.isDone, isExcused), current);
  return { current, best };
}

// Every habit done on each of `keys`.
function allDone(habits, keys) {
  const out = {};
  for (const k of keys) out[k] = Object.fromEntries(habits.map(h => [h.id, h.volumeGoal || 1]));
  return out;
}

describe('isHabitDoneOnDay', () => {
  const read = { id: 'read', type: 'daily', volumeGoal: 1, createdAt: d(3) };

  it("returns 'before' for a day before the habit's createdAt, even with a count", () => {
    expect(isHabitDoneOnDay(read, d(4), { [d(4)]: { read: 1 } })).toBe('before');
  });

  it('judges the goal from createdAt on (the creation day included)', () => {
    expect(isHabitDoneOnDay(read, d(3), { [d(3)]: { read: 1 } })).toBe(true);
    expect(isHabitDoneOnDay(read, d(2), {})).toBe(false);
  });

  it("an untouched 'atMost' day counts after creation but is 'before' ahead of it", () => {
    const coffee = { id: 'coffee', type: 'atMost', volumeGoal: 2, createdAt: d(3) };
    expect(isHabitDoneOnDay(coffee, d(2), {})).toBe(true);
    expect(isHabitDoneOnDay(coffee, d(5), {})).toBe('before');
  });

  it('a missing habit is not done', () => {
    expect(isHabitDoneOnDay(undefined, TODAY, {})).toBe(false);
  });
});

describe('habitsForDay', () => {
  const live = [
    { id: 'a', type: 'daily', volumeGoal: 1, createdAt: d(10) },
    { id: 'b', type: 'daily', volumeGoal: 1, createdAt: d(10) },
  ];

  it('today always uses the live list, even over an empty today snapshot (STA-2)', () => {
    const snapshot = { [TODAY]: [] };
    expect(habitsForDay(TODAY, TODAY, snapshot, live).map(h => h.id)).toEqual(['a', 'b']);
  });

  it("past days use that day's snapshot and fall back to the live list", () => {
    const snapshot = { [d(1)]: snapshotOf([live[0]]) };
    expect(habitsForDay(d(1), TODAY, snapshot, live).map(h => h.id)).toEqual(['a']);
    expect(habitsForDay(d(2), TODAY, snapshot, live).map(h => h.id)).toEqual(['a', 'b']);
  });

  it('fills createdAt into snapshot rows from all habits, archived ones included', () => {
    const archived = { id: 'old', type: 'daily', volumeGoal: 1, createdAt: d(30), archived: true };
    const snapshot = { [d(5)]: snapshotOf([live[0], archived]) };
    const out = habitsForDay(d(5), TODAY, snapshot, live, [...live, archived]);
    expect(out.map(h => h.createdAt)).toEqual([d(10), d(30)]);
    // A deleted habit (in no list) keeps no createdAt and is judged on its goal alone.
    const gone = habitsForDay(d(5), TODAY, { [d(5)]: [{ id: 'gone', type: 'daily' }] }, live);
    expect(gone[0].createdAt).toBeUndefined();
  });
});

describe('summarizeDay (Perfect Days and the heat map)', () => {
  it('a habit created later is excluded from the day, not counted as missed', () => {
    const habits = [
      { id: 'a', type: 'daily', volumeGoal: 1, createdAt: d(10) },
      { id: 'b', type: 'daily', volumeGoal: 1, createdAt: d(4) },
    ];
    const s = summarizeDay(d(5), TODAY, habits, { [d(5)]: { a: 1 } });
    expect(s.habits.map(h => h.status)).toEqual(['done', 'before']);
    expect(s).toMatchObject({ completed: 1, total: 1, before: false });
    expect(isPerfectSummary(s)).toBe(true);
  });

  it("seeded history before every habit's createdAt gives 'before' cells, not perfect ones", () => {
    const habits = [{ id: 'a', type: 'daily', volumeGoal: 1, createdAt: TODAY }];
    const s = summarizeDay(d(3), TODAY, habits, { [d(3)]: { a: 1 } });
    expect(s).toMatchObject({ completed: 0, total: 0, before: true });
    expect(isPerfectSummary(s)).toBe(false);
  });

  it('perWeek: a met weekly target turns the other days into rest days', () => {
    const gym = { id: 'gym', type: 'daily', volumeGoal: 1, schedule: { type: 'perWeek', target: 2 }, createdAt: d(30) };
    const completions = { '2026-10-12': { gym: 1 }, '2026-10-13': { gym: 1 } };
    expect(summarizeDay('2026-10-14', TODAY, [gym], completions)).toMatchObject({ completed: 0, total: 0 });
    expect(summarizeDay('2026-10-13', TODAY, [gym], completions)).toMatchObject({ completed: 1, total: 1 });
    // Last week ended short (1 of 2): its undone days are misses.
    const short = { '2026-10-06': { gym: 1 } };
    expect(summarizeDay('2026-10-07', TODAY, [gym], short)).toMatchObject({ completed: 0, total: 1 });
  });

  it('a skipped habit is a rest day: out of the total, the day can still be perfect', () => {
    const habits = [
      { id: 'a', type: 'daily', volumeGoal: 1, createdAt: d(30) },
      { id: 'b', type: 'daily', volumeGoal: 1, createdAt: d(30) },
    ];
    const isExcused = (k, id) => k === d(2) && id === 'b';
    const s = summarizeDay(d(2), TODAY, habits, { [d(2)]: { a: 1 } }, isExcused);
    expect(s).toMatchObject({ completed: 1, total: 1 });
    expect(s.habits.find(h => h.id === 'b').status).toBe('rest');
  });
});

describe('makeDayRules: streaks and Perfect Days agree', () => {
  it('pinned mixed day: A existed and was done, B was created the next day -> the day is done for the streak and for Perfect Days', () => {
    // The live list carries B's createdAt; the day's snapshot (backfilled later) lists both.
    const A = { id: 'A', type: 'daily', volumeGoal: 1, createdAt: d(3) };
    const B = { id: 'B', type: 'daily', volumeGoal: 1, createdAt: d(1) };
    const snapshot = { [d(2)]: snapshotOf([A, B]), [d(3)]: snapshotOf([A]) };
    const completions = { [d(3)]: { A: 1 }, [d(2)]: { A: 1 }, [d(1)]: { A: 1, B: 1 }, [TODAY]: { A: 1, B: 1 } };
    const rules = makeDayRules({ today: TODAY, snapshot, liveHabits: [A, B], allHabits: [A, B], completions });

    expect(overallDayStatus(d(2), TODAY, rules.habitsOn, rules.isDone)).toBe('done');
    expect(isPerfectSummary(rules.summary(d(2)))).toBe(true);
    expect(streaks(rules, { from: d(3) })).toEqual({ current: 4, best: 4 });
  });

  it('oldest habit created 5 days ago with 5 perfect days and today done: Best = 6', () => {
    const habits = [
      { id: 'a', type: 'daily', volumeGoal: 1, createdAt: d(5) },
      { id: 'b', type: 'volume', volumeGoal: 8, createdAt: d(5) },
    ];
    const keys = [d(5), d(4), d(3), d(2), d(1), TODAY];
    const rules = makeDayRules({ today: TODAY, snapshot: {}, liveHabits: habits, allHabits: habits, completions: allDone(habits, keys) });
    expect(streaks(rules)).toEqual({ current: 6, best: 6 });
    // The day before every habit existed still ends the walk (streak rule unchanged)...
    expect(overallDayStatus(d(6), TODAY, rules.habitsOn, rules.isDone)).toBe('missed');
    // ...but is not drawn or counted for Perfect Days.
    expect(rules.summary(d(6))).toMatchObject({ before: true, total: 0 });
  });

  it('an empty today snapshot cannot blank a finished today (STA-2)', () => {
    const habits = [
      { id: 'a', type: 'daily', volumeGoal: 1, createdAt: d(2) },
      { id: 'b', type: 'daily', volumeGoal: 1, createdAt: d(2) },
    ];
    const completions = allDone(habits, [d(2), d(1), TODAY]);
    const rules = makeDayRules({ today: TODAY, snapshot: { [TODAY]: [] }, liveHabits: habits, allHabits: habits, completions });
    expect(rules.summary(TODAY)).toMatchObject({ completed: 2, total: 2 });
    expect(streaks(rules)).toEqual({ current: 3, best: 3 });
  });

  it('an unfinished today does not break the streak and is not perfect yet', () => {
    const habits = [{ id: 'a', type: 'daily', volumeGoal: 1, createdAt: d(10) }];
    const rules = makeDayRules({ today: TODAY, snapshot: {}, liveHabits: habits, allHabits: habits, completions: allDone(habits, [d(2), d(1)]) });
    expect(streaks(rules, { from: d(10) }).current).toBe(2);
    expect(isPerfectSummary(rules.summary(TODAY))).toBe(false);
  });

  it('a frozen day keeps the streak and is not a perfect day', () => {
    const habits = [{ id: 'a', type: 'daily', volumeGoal: 1, createdAt: d(10) }];
    const rules = makeDayRules({ today: TODAY, snapshot: {}, liveHabits: habits, allHabits: habits, completions: allDone(habits, [d(3), d(1), TODAY]) });
    const frozen = (k) => k === d(2);
    expect(streaks(rules, { from: d(3), isExcused: frozen }).current).toBe(3);
    expect(rules.summary(d(2), frozen)).toMatchObject({ completed: 0, total: 0, before: false });
  });

  it('a habit created today is left out of yesterday, which stays perfect', () => {
    const A = { id: 'A', type: 'daily', volumeGoal: 1, createdAt: d(5) };
    const B = { id: 'B', type: 'daily', volumeGoal: 1, createdAt: TODAY };
    // No snapshot for yesterday: the live list (with B) is the fallback.
    const rules = makeDayRules({ today: TODAY, snapshot: {}, liveHabits: [A, B], allHabits: [A, B], completions: { [d(1)]: { A: 1 } } });
    expect(streakHabitsOn(rules.dayHabits(d(1)), d(1)).map(h => h.id)).toEqual(['A']);
    expect(isPerfectSummary(rules.summary(d(1)))).toBe(true);
  });
});

describe('undated habits cannot run the walk to its cap (S-08 review m1)', () => {
  // An undated atMost habit is "done" on every untouched day; with the mixed-day rule
  // the dated habit's pre-creation days would otherwise be excluded all the way back.
  const coffee = { id: 'coffee', type: 'atMost', volumeGoal: 2 }; // no createdAt
  const move = { id: 'move', type: 'daily', volumeGoal: 1, createdAt: d(9) };
  const water = { id: 'water', type: 'volume', volumeGoal: 8, createdAt: d(9) };
  const habits = [coffee, move, water];
  const completions = allDone([move, water], [d(9), d(8), d(7), d(6), d(5), d(4), d(3), d(2), d(1), TODAY]);

  it('the floor (earliest createdAt) ends the walk where the dated habits start', () => {
    const rules = makeDayRules({ today: TODAY, snapshot: {}, liveHabits: habits, allHabits: habits, completions });
    expect(rules.floor).toBe(d(9));
    expect(overallStreak(TODAY, TODAY, rules.habitsOn, rules.isDone)).toBe(10);
  });

  it('with no dated habit the floor falls back to accountCreatedAt', () => {
    const rules = makeDayRules({ today: TODAY, snapshot: {}, liveHabits: [coffee], allHabits: [coffee], completions: {}, accountCreatedAt: d(3) });
    expect(rules.floor).toBe(d(3));
  });

  it('stampCreatedAt dates an undated habit from its first logged day, else the fallback', () => {
    const stamped = stampCreatedAt(habits, { [d(20)]: { coffee: 1 }, [d(4)]: { coffee: 3 } }, TODAY);
    expect(stamped[0].createdAt).toBe(d(20));
    expect(stamped[1]).toBe(move); // dated habits untouched
    expect(stampCreatedAt([coffee], {}, TODAY)[0].createdAt).toBe(TODAY);
    const dated = [move, water];
    expect(stampCreatedAt(dated, {}, TODAY)).toBe(dated);
  });

  it('after stamping (as migrateHabits and backup import do) the streak stays sane', () => {
    const stamped = stampCreatedAt(habits, completions, TODAY); // coffee never logged -> today
    const rules = makeDayRules({ today: TODAY, snapshot: {}, liveHabits: stamped, allHabits: stamped, completions });
    expect(overallStreak(TODAY, TODAY, rules.habitsOn, rules.isDone)).toBe(10);
    expect(earliestCreatedAt(stamped)).toBe(d(9));
  });
});

// M0-polish F11: the per-habit streak (AppContext.getStreakForHabit) walks habitStreak
// with isHabitDoneOnDay(...) === true, so a day before createdAt is never "done", and a
// freeze or skip there is a rest day (no increment). Nothing before createdAt can count.
describe('per-habit streak never counts days before createdAt (F11)', () => {
  const { habitStreak, bestHabitStreak } = require('../schedule');
  const streakFor = (habit, completions, excusedKeys = []) => habitStreak(
    habit.schedule, TODAY, TODAY,
    (k) => isHabitDoneOnDay(habit, k, completions) === true,
    { isExcused: (k) => excusedKeys.includes(k) },
  );

  it('a habit created today, freezes and a stray log before it, today pending: 0', () => {
    const h = { id: 'w', type: 'volume', volumeGoal: 8, schedule: { type: 'daily' }, createdAt: TODAY };
    const completions = { [d(3)]: { w: 8 } };
    expect(streakFor(h, completions, [d(1), d(2)])).toBe(0);
    expect(bestHabitStreak(h.schedule, TODAY, TODAY, TODAY, (k) => isHabitDoneOnDay(h, k, completions) === true)).toBe(0);
  });

  it('an untouched atMost habit is not "done" before createdAt', () => {
    const h = { id: 'a', type: 'atMost', volumeGoal: 2, schedule: { type: 'daily' }, createdAt: d(2) };
    // d(2), d(1) and today are untouched (within the limit): 3, not a walk back to the cap.
    expect(streakFor(h, {}, [])).toBe(3);
  });

  it('done on its first day, then two frozen days, today pending: 1 (rest days hold, never add)', () => {
    const h = { id: 'w', type: 'volume', volumeGoal: 8, schedule: { type: 'daily' }, createdAt: d(3) };
    const completions = { [d(3)]: { w: 8 } };
    expect(streakFor(h, completions, [d(1), d(2), d(4), d(5)])).toBe(1);
  });

  it('a perWeek habit created mid-week gets no credit for the days before it existed', () => {
    const h = { id: 'p', type: 'daily', schedule: { type: 'perWeek', target: 2 }, createdAt: TODAY };
    expect(streakFor(h, {}, [d(1), d(2), d(8)])).toBe(0);
  });
});
