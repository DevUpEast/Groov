import {
  normalizeSchedule, isScheduledOn, describeSchedule, weekStart, dayStatus,
  habitStreak, bestHabitStreak, habitsDueOn, remainingThisWeek, gridDayStatus,
} from '../schedule';

// 2026-10-12 is a Monday.
const MON = '2026-10-12', TUE = '2026-10-13', WED = '2026-10-14', THU = '2026-10-15',
  SAT = '2026-10-17', SUN = '2026-10-18';
const doneSet = (...keys) => { const s = new Set(keys); return k => s.has(k); };

describe('normalizeSchedule', () => {
  it('defaults to daily', () => {
    expect(normalizeSchedule(undefined)).toEqual({ type: 'daily' });
    expect(normalizeSchedule({ type: 'bogus' })).toEqual({ type: 'daily' });
  });
  it('dedupes, sorts and bounds weekdays; all 7 days collapses to daily', () => {
    expect(normalizeSchedule({ type: 'weekdays', days: [5, 1, 1, 9, -1] })).toEqual({ type: 'weekdays', days: [1, 5] });
    expect(normalizeSchedule({ type: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] })).toEqual({ type: 'daily' });
    expect(normalizeSchedule({ type: 'weekdays', days: [] })).toEqual({ type: 'daily' });
  });
  it('clamps perWeek targets to 1..6', () => {
    expect(normalizeSchedule({ type: 'perWeek', target: 0 })).toEqual({ type: 'perWeek', target: 1 });
    expect(normalizeSchedule({ type: 'perWeek', target: 12 })).toEqual({ type: 'perWeek', target: 6 });
    expect(normalizeSchedule({ type: 'perWeek', target: '3' })).toEqual({ type: 'perWeek', target: 3 });
  });
});

describe('isScheduledOn / describeSchedule / weekStart', () => {
  it('weekday schedules match the local weekday', () => {
    const wk = { type: 'weekdays', days: [1, 2, 3, 4, 5] };
    expect(isScheduledOn(wk, MON)).toBe(true);
    expect(isScheduledOn(wk, SAT)).toBe(false);
    expect(isScheduledOn({ type: 'daily' }, SAT)).toBe(true);
    expect(isScheduledOn({ type: 'perWeek', target: 2 }, SAT)).toBe(true);
  });
  it('describes common patterns', () => {
    expect(describeSchedule(undefined)).toBe('Every day');
    expect(describeSchedule({ type: 'weekdays', days: [1, 2, 3, 4, 5] })).toBe('Weekdays');
    expect(describeSchedule({ type: 'weekdays', days: [0, 6] })).toBe('Weekends');
    expect(describeSchedule({ type: 'weekdays', days: [1, 3, 5] })).toBe('Mo We Fr');
    expect(describeSchedule({ type: 'perWeek', target: 3 })).toBe('3× per week');
  });
  it('weeks start on Monday', () => {
    expect(weekStart(SUN)).toBe(MON);
    expect(weekStart(MON)).toBe(MON);
    expect(weekStart(WED)).toBe(MON);
  });
});

describe('dayStatus', () => {
  it('daily: done or missed', () => {
    expect(dayStatus({ type: 'daily' }, MON, WED, doneSet(MON))).toBe('done');
    expect(dayStatus({ type: 'daily' }, TUE, WED, doneSet(MON))).toBe('missed');
  });
  it('weekdays: unscheduled days are rest days', () => {
    const wk = { type: 'weekdays', days: [1, 3] };
    expect(dayStatus(wk, TUE, WED, doneSet())).toBe('rest');
    expect(dayStatus(wk, MON, WED, doneSet())).toBe('missed');
    expect(dayStatus(wk, TUE, WED, doneSet(TUE))).toBe('done'); // bonus completion still counts
  });
  it('perWeek: undone days are neutral while the target is still reachable', () => {
    const pw = { type: 'perWeek', target: 3 };
    // Wednesday, nothing done yet this week: Mon/Tue are rest (5 open slots incl. today)
    expect(dayStatus(pw, MON, WED, doneSet())).toBe('rest');
    expect(dayStatus(pw, TUE, WED, doneSet())).toBe('rest');
    // Saturday with only 1 done: Sat + Sun open = 1 + 2 = 3 -> still reachable
    expect(dayStatus(pw, THU, SAT, doneSet(MON))).toBe('rest');
    // Sunday with 1 done and Sunday open: 1 + 1 < 3 -> the week is lost
    expect(dayStatus(pw, THU, SUN, doneSet(MON))).toBe('missed');
    // Target met: every other day of that week is rest
    expect(dayStatus(pw, THU, SUN, doneSet(MON, TUE, WED))).toBe('rest');
    // A previous week that ended short is missed
    expect(dayStatus(pw, '2026-10-07', WED, doneSet('2026-10-05'))).toBe('missed');
    expect(dayStatus(pw, '2026-10-07', WED, doneSet('2026-10-05', '2026-10-06', '2026-10-09'))).toBe('rest');
  });
});

describe('habitStreak', () => {
  it('daily streak ends at the first missed day; unfinished today does not break it', () => {
    const done = doneSet(MON, TUE);
    expect(habitStreak({ type: 'daily' }, WED, WED, done)).toBe(2);
    expect(habitStreak({ type: 'daily' }, WED, WED, doneSet(MON, TUE, WED))).toBe(3);
    expect(habitStreak({ type: 'daily' }, WED, WED, doneSet(MON))).toBe(0);
  });
  it('weekday streaks skip rest days', () => {
    const wk = { type: 'weekdays', days: [1, 2, 3, 4, 5] };
    // Fri 9th and Mon 12th done, weekend in between: streak 2
    expect(habitStreak(wk, MON, MON, doneSet('2026-10-09', MON))).toBe(2);
    // Thu 8th done, Fri 9th missed, Mon 12th done: streak 1
    expect(habitStreak(wk, MON, MON, doneSet('2026-10-08', MON))).toBe(1);
  });
  it('perWeek streaks count completions across weeks that met their target', () => {
    const pw = { type: 'perWeek', target: 2 };
    // Last week: Mon 5, Wed 7 (target met). This week: Mon 12. Today Tue 13.
    expect(habitStreak(pw, TUE, TUE, doneSet('2026-10-05', '2026-10-07', MON))).toBe(3);
    // Last week only 1 done -> it ended short -> streak is just this week's 1
    expect(habitStreak(pw, TUE, TUE, doneSet('2026-10-05', MON))).toBe(1);
  });
  it('respects maxDays', () => {
    expect(habitStreak({ type: 'daily' }, WED, WED, () => true, { maxDays: 10 })).toBe(10);
  });
});

describe('bestHabitStreak', () => {
  it('finds the longest run in a range', () => {
    const done = doneSet('2026-10-01', '2026-10-02', '2026-10-03', '2026-10-06', MON, TUE, WED);
    expect(bestHabitStreak({ type: 'daily' }, '2026-10-01', WED, WED, done)).toBe(3);
    expect(bestHabitStreak({ type: 'daily' }, '2026-10-05', WED, WED, done)).toBe(3);
  });
});

describe('habitsDueOn / remainingThisWeek', () => {
  it('filters snapshot habits by schedule', () => {
    const habits = [
      { id: 'a' },
      { id: 'b', schedule: { type: 'weekdays', days: [6] } },
      { id: 'c', schedule: { type: 'perWeek', target: 1 } },
    ];
    expect(habitsDueOn(habits, MON).map(h => h.id)).toEqual(['a', 'c']);
    expect(habitsDueOn(habits, SAT).map(h => h.id)).toEqual(['a', 'b', 'c']);
  });
  it('reports what a perWeek habit still needs this week', () => {
    const pw = { type: 'perWeek', target: 3 };
    expect(remainingThisWeek(pw, WED, doneSet(MON))).toBe(2);
    expect(remainingThisWeek(pw, WED, doneSet(MON, TUE, WED))).toBe(0);
    expect(remainingThisWeek({ type: 'daily' }, WED, doneSet())).toBe(0);
  });
});

describe('gridDayStatus (STA-4: today is pending, never missed)', () => {
  const daily = { type: 'daily' };
  it('today, scheduled and not done, is pending', () => {
    expect(gridDayStatus(daily, SAT, SAT, doneSet())).toBe('pending');
    expect(gridDayStatus({ type: 'weekdays', days: [6] }, SAT, SAT, doneSet())).toBe('pending');
  });
  it('a past missed day stays missed', () => {
    expect(gridDayStatus(daily, THU, SAT, doneSet())).toBe('missed');
  });
  it('done, rest and excused days are unchanged, today included', () => {
    expect(gridDayStatus(daily, SAT, SAT, doneSet(SAT))).toBe('done');
    expect(gridDayStatus({ type: 'weekdays', days: [1] }, SAT, SAT, doneSet())).toBe('rest');
    expect(gridDayStatus(daily, SAT, SAT, doneSet(), k => k === SAT)).toBe('rest');
  });
  it('matches dayStatus everywhere except today-missed', () => {
    for (const key of [MON, TUE, WED, THU, SAT]) {
      const plain = dayStatus(daily, key, SAT, doneSet(TUE));
      const grid = gridDayStatus(daily, key, SAT, doneSet(TUE));
      expect(grid).toBe(key === SAT && plain === 'missed' ? 'pending' : plain);
    }
  });
});
