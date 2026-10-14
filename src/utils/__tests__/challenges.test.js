import { daysSinceStart, currentChallengeDay, isChallengeExpired } from '../challenges';

const ch = (days, startDate = '2026-10-10') => ({ days, startDate });

describe('daysSinceStart', () => {
  it('is 0 on the start day and before it', () => {
    expect(daysSinceStart(ch(3), '2026-10-10')).toBe(0);
    expect(daysSinceStart(ch(3), '2026-10-01')).toBe(0);
  });
  it('counts elapsed days', () => {
    expect(daysSinceStart(ch(3), '2026-10-12')).toBe(2);
  });
  it('is 0 without a start date', () => {
    expect(daysSinceStart({ days: 3 }, '2026-10-12')).toBe(0);
  });
});

describe('currentChallengeDay', () => {
  it('is 1-based and clamps to the challenge length', () => {
    expect(currentChallengeDay(ch(3), '2026-10-10')).toBe(1);
    expect(currentChallengeDay(ch(3), '2026-10-12')).toBe(3);
    expect(currentChallengeDay(ch(3), '2026-10-20')).toBe(3);
  });
});

describe('isChallengeExpired', () => {
  it('is false during the challenge window', () => {
    expect(isChallengeExpired(ch(3), '2026-10-10')).toBe(false);
    expect(isChallengeExpired(ch(3), '2026-10-12')).toBe(false);
  });
  it('is true the day after the last day', () => {
    expect(isChallengeExpired(ch(3), '2026-10-13')).toBe(true);
    expect(isChallengeExpired(ch(3), '2026-11-13')).toBe(true);
  });
  it('never expires without a start date', () => {
    expect(isChallengeExpired({ days: 3 }, '2026-12-31')).toBe(false);
  });
  it('is correct across the fall DST change', () => {
    expect(isChallengeExpired(ch(2, '2026-10-31'), '2026-11-01')).toBe(false);
    expect(isChallengeExpired(ch(2, '2026-10-31'), '2026-11-02')).toBe(true);
  });
});
