import { deriveAccountCreatedAt, earliestCompletionDate } from '../accountCreatedAt';
import { mergeCompletions } from '../mergeSync';

const TODAY = '2026-10-17';

describe('earliestCompletionDate', () => {
  it('returns the earliest day with a positive count', () => {
    expect(earliestCompletionDate({
      '2026-10-10': { a: 1 },
      '2026-09-02': { a: 0, b: 2 },
      '2026-10-01': { a: 1 },
    })).toBe('2026-09-02');
  });

  it('skips days where nothing is logged and keys that are not dates', () => {
    expect(earliestCompletionDate({ '2026-08-01': { a: 0 }, 'junk': { a: 1 }, '2026-09-05': { a: 1 } })).toBe('2026-09-05');
    expect(earliestCompletionDate({})).toBeNull();
    expect(earliestCompletionDate(null)).toBeNull();
  });
});

describe('deriveAccountCreatedAt', () => {
  it('falls back to today with no evidence (a new account)', () => {
    expect(deriveAccountCreatedAt({ today: TODAY })).toBe(TODAY);
    expect(deriveAccountCreatedAt({ stored: null, completions: {}, habits: [], today: TODAY })).toBe(TODAY);
  });

  it('after an account switch (stored = null) takes the pulled history, not today', () => {
    const completions = { '2026-09-01': { a: 1 }, '2026-10-16': { a: 1 } };
    const habits = [{ id: 'a', createdAt: '2026-09-03' }];
    expect(deriveAccountCreatedAt({ stored: null, completions, habits, today: TODAY })).toBe('2026-09-01');
  });

  it('takes the earliest habit createdAt when it precedes every completion', () => {
    const habits = [{ id: 'a', createdAt: '2026-08-20' }, { id: 'b', createdAt: '2026-10-01' }, { id: 'c' }];
    expect(deriveAccountCreatedAt({ completions: { '2026-09-01': { a: 1 } }, habits, today: TODAY })).toBe('2026-08-20');
  });

  it('reads the date part of a timestamp createdAt', () => {
    expect(deriveAccountCreatedAt({ habits: [{ createdAt: '2026-07-04T12:00:00Z' }], today: TODAY })).toBe('2026-07-04');
  });

  it('keeps an earlier stored value', () => {
    expect(deriveAccountCreatedAt({ stored: '2026-05-01', completions: { '2026-09-01': { a: 1 } }, today: TODAY })).toBe('2026-05-01');
  });

  it('lowers a stored "today" to the real first day on a login pull', () => {
    expect(deriveAccountCreatedAt({ stored: TODAY, completions: { '2026-09-01': { a: 1 } }, today: TODAY })).toBe('2026-09-01');
  });

  it('ignores future dates and invalid values', () => {
    expect(deriveAccountCreatedAt({
      stored: '2027-01-01',
      completions: { '2026-12-01': { a: 1 } },
      habits: [{ createdAt: '2026-11-11' }, { createdAt: 42 }, null],
      today: TODAY,
    })).toBe(TODAY);
  });

  describe('delta pull', () => {
    it('never raises the value', () => {
      const pulled = mergeCompletions({}, [{ date: '2026-10-15', habit_id: 'a', count: 1 }]);
      expect(deriveAccountCreatedAt({ stored: '2026-09-01', completions: pulled, habits: [{ createdAt: '2026-10-15' }], today: TODAY })).toBe('2026-09-01');
    });

    it('a deleted row (count 0) does not lower it', () => {
      const pulled = mergeCompletions({}, [{ date: '2026-01-01', habit_id: 'a', count: 0 }]);
      expect(deriveAccountCreatedAt({ stored: '2026-09-01', completions: pulled, habits: [], today: TODAY })).toBe('2026-09-01');
    });

    it('real earlier history from another device lowers it', () => {
      const pulled = mergeCompletions({}, [{ date: '2026-08-15', habit_id: 'a', count: 2 }]);
      expect(deriveAccountCreatedAt({ stored: '2026-09-01', completions: pulled, today: TODAY })).toBe('2026-08-15');
    });
  });
});
