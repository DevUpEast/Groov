import {
  localDateKey, todayKey, isDateKey, parseDateKey, addDays, daysBetween, dateAt,
} from '../dates';

describe('localDateKey', () => {
  it('formats the local calendar date with zero padding', () => {
    expect(localDateKey(new Date(2026, 0, 5, 9, 30))).toBe('2026-01-05');
    expect(localDateKey(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31');
  });

  it('uses the local day, not the UTC day, late in the evening', () => {
    // 23:30 local. toISOString() would roll this into the next (or previous) UTC day
    // in any timezone that is not UTC itself; the local key must not.
    const late = new Date(2026, 5, 10, 23, 30);
    expect(localDateKey(late)).toBe('2026-06-10');
    const early = new Date(2026, 5, 10, 0, 15);
    expect(localDateKey(early)).toBe('2026-06-10');
  });

  it('defaults to now', () => {
    const now = new Date();
    expect(localDateKey()).toBe(localDateKey(now));
  });
});

describe('todayKey', () => {
  it('matches localDateKey(new Date()) with no offset', () => {
    expect(todayKey()).toBe(localDateKey(new Date()));
    expect(todayKey(0)).toBe(localDateKey(new Date()));
  });

  it('applies a day offset in both directions', () => {
    expect(todayKey(1)).toBe(addDays(localDateKey(new Date()), 1));
    expect(todayKey(-3)).toBe(addDays(localDateKey(new Date()), -3));
  });
});

describe('isDateKey', () => {
  it('accepts YYYY-MM-DD only', () => {
    expect(isDateKey('2026-10-14')).toBe(true);
    expect(isDateKey('2026-10-14T00:00:00.000Z')).toBe(false);
    expect(isDateKey('10/14/2026')).toBe(false);
    expect(isDateKey(null)).toBe(false);
    expect(isDateKey(20261014)).toBe(false);
  });
});

describe('parseDateKey', () => {
  it('returns a local Date at noon', () => {
    const d = parseDateKey('2026-03-08');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(8);
    expect(d.getHours()).toBe(12);
  });

  it('round-trips through localDateKey', () => {
    for (const key of ['2024-02-29', '2026-01-01', '2026-12-31', '2026-10-14']) {
      expect(localDateKey(parseDateKey(key))).toBe(key);
    }
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('is stable across the US DST transitions', () => {
    // Spring forward (2026-03-08) and fall back (2026-11-01) in America/*.
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-03-09', -1)).toBe('2026-03-08');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(addDays('2026-11-02', -1)).toBe('2026-11-01');
  });

  it('handles zero and large offsets', () => {
    expect(addDays('2026-10-14', 0)).toBe('2026-10-14');
    expect(addDays('2026-10-14', 365)).toBe('2027-10-14');
    expect(addDays('2026-10-14', -30)).toBe('2026-09-14');
  });
});

describe('daysBetween', () => {
  it('counts whole days, signed', () => {
    expect(daysBetween('2026-10-01', '2026-10-14')).toBe(13);
    expect(daysBetween('2026-10-14', '2026-10-01')).toBe(-13);
    expect(daysBetween('2026-10-14', '2026-10-14')).toBe(0);
  });

  it('is exact across DST changes', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
  });

  it('is consistent with addDays', () => {
    const start = '2026-01-15';
    for (const n of [-400, -31, -1, 0, 1, 28, 100, 400]) {
      expect(daysBetween(start, addDays(start, n))).toBe(n);
    }
  });
});

describe('dateAt', () => {
  it('builds a local Date for a key at a wall-clock time', () => {
    const d = dateAt('2026-10-14', 20, 15);
    expect(localDateKey(d)).toBe('2026-10-14');
    expect(d.getHours()).toBe(20);
    expect(d.getMinutes()).toBe(15);
    expect(d.getSeconds()).toBe(0);
  });
});
