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
