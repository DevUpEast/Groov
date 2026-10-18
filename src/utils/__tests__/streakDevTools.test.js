// C-09 dev tools (Settings → Dev tools): deterministic forgiveness moments on the real date.
import { planMissedYesterday, planUseUpFreezes } from '../seed';
import { freezesLeftInMonth } from '../streaks';

const habits = [{ id: 'a' }, { id: 'b' }];

describe('planMissedYesterday', () => {
  test('clears yesterday for the current habits and moves lastSeen back two days', () => {
    const plan = planMissedYesterday({
      completions: { '2026-10-17': { a: 1, b: 2, gone: 1 }, '2026-10-16': { a: 1 } },
      habits,
      today: '2026-10-18',
      freezes: ['2026-10-03', '2026-10-17'],
      lastSeen: { date: '2026-10-18', streak: 9, freezesUsed: ['2026-10-03'], backOnBeat: '2026-10-10' },
    });
    expect(plan.yesterday).toBe('2026-10-17');
    expect(plan.completions).toEqual({ '2026-10-17': { gone: 1 }, '2026-10-16': { a: 1 } });
    expect(plan.cleared).toEqual([['2026-10-17', 'a'], ['2026-10-17', 'b']]);
    // Every freeze but yesterday's is known, so a freeze on yesterday reads as new.
    expect(plan.lastSeen).toEqual({ date: '2026-10-16', streak: 9, freezesUsed: ['2026-10-03'], backOnBeat: '2026-10-10' });
  });

  test('works without a stored lastSeen and drops an emptied day', () => {
    const plan = planMissedYesterday({ completions: { '2026-10-17': { a: 1 } }, habits, today: '2026-10-18', freezes: [] });
    expect(plan.completions).toEqual({});
    expect(plan.lastSeen).toEqual({ date: '2026-10-16', freezesUsed: [] });
  });
});

describe('planUseUpFreezes', () => {
  test('the 1st and 2nd become the month\'s freezes, their counts cleared', () => {
    const plan = planUseUpFreezes({
      completions: { '2026-10-01': { a: 1 }, '2026-10-02': { b: 1, x: 1 }, '2026-10-17': { a: 1 } },
      habits,
      today: '2026-10-18',
      freezes: ['2026-09-20', '2026-10-17'],
    });
    expect(plan.days).toEqual(['2026-10-01', '2026-10-02']);
    expect(plan.completions).toEqual({ '2026-10-02': { x: 1 }, '2026-10-17': { a: 1 } });
    expect(plan.cleared).toEqual([['2026-10-01', 'a'], ['2026-10-02', 'b']]);
    // Other months are kept; this month's other freeze (yesterday's) is released.
    expect(plan.freezes).toEqual(['2026-09-20', '2026-10-01', '2026-10-02']);
    expect(freezesLeftInMonth(plan.freezes, '2026-10-18')).toBe(0);
  });

  test('works from the 3rd; disabled (null) on the 1st and 2nd', () => {
    expect(planUseUpFreezes({ completions: {}, habits, today: '2026-11-01', freezes: [] })).toBeNull();
    expect(planUseUpFreezes({ completions: {}, habits, today: '2026-11-02', freezes: [] })).toBeNull();
    expect(planUseUpFreezes({ completions: {}, habits, today: '2026-11-03', freezes: [] }).freezes).toEqual(['2026-11-01', '2026-11-02']);
  });
});
