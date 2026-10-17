import { to24h, to12h, formatTime12 } from '../time';

describe('to24h', () => {
  it('maps the 12-hour edge cases', () => {
    expect(to24h({ hour12: 12, minute: 0, ampm: 'AM' })).toEqual({ hour: 0, minute: 0 });
    expect(to24h({ hour12: 12, minute: 30, ampm: 'PM' })).toEqual({ hour: 12, minute: 30 });
    expect(to24h({ hour12: 8, minute: 5, ampm: 'PM' })).toEqual({ hour: 20, minute: 5 });
    expect(to24h({ hour12: 1, minute: 0, ampm: 'AM' })).toEqual({ hour: 1, minute: 0 });
  });
  it('falls back to 8:00 AM for missing input', () => {
    expect(to24h(null)).toEqual({ hour: 8, minute: 0 });
    expect(to24h({})).toEqual({ hour: 8, minute: 0 });
  });
});

describe('to12h', () => {
  it('round-trips with to24h', () => {
    for (let h = 0; h < 24; h++) {
      expect(to24h(to12h(h, 15))).toEqual({ hour: h, minute: 15 });
    }
  });
  it('labels midnight and noon correctly', () => {
    expect(to12h(0)).toEqual({ hour12: 12, minute: 0, ampm: 'AM' });
    expect(to12h(12)).toEqual({ hour12: 12, minute: 0, ampm: 'PM' });
  });
});

describe('formatTime12', () => {
  it('pads minutes', () => {
    expect(formatTime12({ hour12: 8, minute: 5, ampm: 'PM' })).toBe('8:05 PM');
    expect(formatTime12(null)).toBe('-');
  });
});

describe('native picker conversions', () => {
  const { timeToDate, from24h, formatTimeForClock } = require('../time');

  it('timeToDate sets the local hour and minute and keeps the base day', () => {
    const base = new Date(2026, 9, 17, 14, 3, 27, 500);
    const d = timeToDate({ hour12: 7, minute: 45, ampm: 'AM' }, base);
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 17]);
    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([7, 45, 0, 0]);
    expect(timeToDate({ hour12: 12, minute: 0, ampm: 'AM' }, base).getHours()).toBe(0);
    expect(timeToDate({ hour12: 12, minute: 30, ampm: 'PM' }, base).getHours()).toBe(12);
  });

  it('from24h maps a picker Date back to the stored shape', () => {
    expect(from24h(new Date(2026, 0, 1, 7, 45))).toEqual({ hour12: 7, minute: 45, ampm: 'AM' });
    expect(from24h(new Date(2026, 0, 1, 0, 5))).toEqual({ hour12: 12, minute: 5, ampm: 'AM' });
    expect(from24h(new Date(2026, 0, 1, 23, 59))).toEqual({ hour12: 11, minute: 59, ampm: 'PM' });
    expect(from24h(13, 7)).toEqual({ hour12: 1, minute: 7, ampm: 'PM' });
  });

  it('round-trips every minute of the day through a Date', () => {
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m++) {
        const stored = to12h(h, m);
        expect(from24h(timeToDate(stored))).toEqual(stored);
      }
    }
  });

  it('formats the preview for 12- and 24-hour clocks', () => {
    const t = { hour12: 7, minute: 45, ampm: 'AM' };
    expect(formatTimeForClock(t, true)).toBe('07:45');
    expect(formatTimeForClock(t, false)).toBe('7:45 AM');
    expect(formatTimeForClock({ hour12: 12, minute: 0, ampm: 'AM' }, true)).toBe('00:00');
    expect(formatTimeForClock(null, true)).toBe('-');
  });
});
