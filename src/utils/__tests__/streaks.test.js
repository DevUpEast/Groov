import { countBackStreak } from '../streaks';

describe('countBackStreak', () => {
  it('returns 0 when today is not done', () => {
    expect(countBackStreak('2026-10-14', () => false)).toBe(0);
  });

  it('counts consecutive days back from the start key', () => {
    const done = new Set(['2026-10-14', '2026-10-13', '2026-10-12', '2026-10-09']);
    expect(countBackStreak('2026-10-14', k => done.has(k))).toBe(3);
  });

  it('crosses month boundaries', () => {
    const done = new Set(['2026-11-01', '2026-10-31', '2026-10-30']);
    expect(countBackStreak('2026-11-01', k => done.has(k))).toBe(3);
  });

  it('can start from a day in the past', () => {
    const done = new Set(['2026-10-10', '2026-10-09']);
    expect(countBackStreak('2026-10-10', k => done.has(k))).toBe(2);
    expect(countBackStreak('2026-10-11', k => done.has(k))).toBe(0);
  });
});

import { overallDayStatus, overallStreak, bestOverallStreak } from '../streaks';

describe('overall streak with schedules', () => {
  // 2026-10-12 is a Monday.
  const habits = [
    { id: 'daily' },
    { id: 'wk', schedule: { type: 'weekdays', days: [1, 3, 5] } },
  ];
  const habitsOn = () => habits;
  const mk = (map) => (key, id) => !!map[key]?.includes(id);

  it('a day where every scheduled habit is done counts; unscheduled ones are ignored', () => {
    const isDone = mk({ '2026-10-13': ['daily'] }); // Tuesday: wk not scheduled
    expect(overallDayStatus('2026-10-13', '2026-10-14', habitsOn, isDone)).toBe('done');
    expect(overallDayStatus('2026-10-12', '2026-10-14', habitsOn, mk({ '2026-10-12': ['daily'] }))).toBe('missed');
  });

  it('days with no habits are rest days and do not break the chain', () => {
    const on = (k) => (k === '2026-10-13' ? [] : habits);
    const isDone = mk({ '2026-10-12': ['daily', 'wk'], '2026-10-14': ['daily', 'wk'] });
    expect(overallStreak('2026-10-14', '2026-10-14', on, isDone)).toBe(2);
  });

  it('an unfinished today does not break the streak', () => {
    const isDone = mk({ '2026-10-12': ['daily', 'wk'], '2026-10-13': ['daily'] });
    expect(overallStreak('2026-10-14', '2026-10-14', habitsOn, isDone)).toBe(2);
    // ...but a missed yesterday does
    expect(overallStreak('2026-10-14', '2026-10-14', habitsOn, mk({ '2026-10-12': ['daily', 'wk'] }))).toBe(0);
  });

  it('best streak scans a range', () => {
    const only = [{ id: 'daily' }];
    const isDone = mk({ '2026-10-01': ['daily'], '2026-10-02': ['daily'], '2026-10-05': ['daily'] });
    expect(bestOverallStreak('2026-10-01', '2026-10-06', '2026-10-06', () => only, isDone)).toBe(2);
  });
});

import { reconcileFreezes, freezesLeftInMonth, FREEZES_PER_MONTH } from '../streaks';

describe('streak freezes', () => {
  const statusFrom = (missed) => (k) => (missed.includes(k) ? 'missed' : 'done');

  it('freezes up to two missed days per month, oldest first', () => {
    const today = '2026-10-14';
    const out = reconcileFreezes([], today, statusFrom(['2026-10-09', '2026-10-11', '2026-10-13']));
    expect(out).toEqual(['2026-10-09', '2026-10-11']);
    expect(freezesLeftInMonth(out, today)).toBe(0);
    expect(FREEZES_PER_MONTH).toBe(2);
  });

  it('never freezes today and respects the floor', () => {
    const out = reconcileFreezes([], '2026-10-14', statusFrom(['2026-10-14', '2026-10-08']), { floor: '2026-10-09' });
    expect(out).toEqual([]);
  });

  it('gives a freeze back when the day is filled in later', () => {
    const out = reconcileFreezes(['2026-10-12'], '2026-10-14', statusFrom([]));
    expect(out).toEqual([]);
  });

  it('returns the same reference when nothing changes', () => {
    const f = ['2026-10-12'];
    expect(reconcileFreezes(f, '2026-10-14', statusFrom(['2026-10-12']))).toBe(f);
  });

  it('excused days keep the chain alive', () => {
    const only = [{ id: 'a' }];
    const isDone = (k) => ['2026-10-12', '2026-10-14'].includes(k);
    const excused = (k) => k === '2026-10-13';
    expect(overallStreak('2026-10-14', '2026-10-14', () => only, (k) => isDone(k), { isExcused: excused })).toBe(2);
    expect(overallStreak('2026-10-14', '2026-10-14', () => only, (k) => isDone(k))).toBe(1);
  });
});
