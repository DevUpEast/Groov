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
