// C-09 (plan acceptance a): what happened to the streak since the last open.
import { sinceLastOpen, sameLastSeen, streakNewsTonight, RESET_MIN_STREAK } from '../streaks';
import { addDays } from '../dates';

const TODAY = '2026-10-18';
const d = (n) => addDays(TODAY, -n);

// A history described per day: 'done' | 'rest' | 'missed' (freezes and skips applied, as the
// caller's statusOf is). The streak walk counts done days back from a key; rest keeps the
// chain, a missed day ends it.
function world(days, { freezes = [] } = {}) {
  const statusOf = (k) => days[k] || 'done';
  const streakEndingOn = (key) => {
    let n = 0;
    let k = key;
    for (let i = 0; i < 400; i++) {
      const st = statusOf(k);
      if (st === 'missed') break;
      if (st === 'done') n++;
      k = addDays(k, -1);
      if (k < '2026-01-01') break;
    }
    return n;
  };
  // Today unfinished never breaks: the live streak walks from yesterday (today counted only
  // when done).
  const streak = (days[TODAY] === 'done' ? 1 : 0) + streakEndingOn(d(1));
  return { date: TODAY, streak, freezes, statusOf, streakEndingOn };
}
// A history that starts on `start`: every day before it is missed (ends any walk).
function since(start, days = {}, opts) {
  const all = { ...days };
  for (let k = addDays(start, -1); k >= '2026-09-01'; k = addDays(k, -1)) all[k] = all[k] || 'missed';
  all[TODAY] = all[TODAY] || 'open';
  return world(all, opts);
}

describe('sinceLastOpen', () => {
  test('first run (no record) only records', () => {
    const now = since('2026-10-01', { [d(1)]: 'rest' }, { freezes: [d(1)] });
    const { event, lastSeen } = sinceLastOpen(null, now);
    expect(event).toBeNull();
    expect(lastSeen).toEqual({ date: TODAY, streak: now.streak, freezesUsed: [d(1)] });
  });

  test('a corrupt record is treated as a first run', () => {
    const now = since('2026-10-01', { [d(1)]: 'missed' });
    expect(sinceLastOpen({ date: 'yesterday' }, now).event).toBeNull();
    expect(sinceLastOpen('x', now).event).toBeNull();
  });

  test('the same date never fires, even when a freeze appeared in-session', () => {
    const now = since('2026-10-01', { [d(1)]: 'rest' }, { freezes: [d(1)] });
    const prev = { date: TODAY, streak: 17, freezesUsed: [] };
    const { event, lastSeen } = sinceLastOpen(prev, now);
    expect(event).toBeNull();
    // ... and the record learns the freeze, so the next day does not announce it.
    expect(lastSeen.freezesUsed).toEqual([d(1)]);
    expect(sinceLastOpen({ ...lastSeen, date: d(0) }, { ...now, date: addDays(TODAY, 1) }).event).toBeNull();
  });

  test('a clock that went back never fires', () => {
    const now = since('2026-10-01', { [d(1)]: 'missed' });
    expect(sinceLastOpen({ date: addDays(TODAY, 1), streak: 5, freezesUsed: [] }, now).event).toBeNull();
  });

  test('a freeze spent on yesterday: freeze card with the streak that holds', () => {
    const now = since('2026-10-01', { [d(1)]: 'rest' }, { freezes: [d(1)] });
    const { event } = sinceLastOpen({ date: d(1), streak: 15, freezesUsed: [] }, now);
    expect(event).toEqual({ kind: 'freeze', covered: d(1), count: 1, streak: now.streak });
    expect(now.streak).toBe(16); // 10-01 .. 10-16, the frozen 17th adds nothing
  });

  test('a freeze the record already knew is not news', () => {
    const now = since('2026-10-01', { [d(3)]: 'rest' }, { freezes: [d(3)] });
    expect(sinceLastOpen({ date: d(1), streak: 14, freezesUsed: [d(3)] }, now).event).toBeNull();
  });

  test('a freeze on a day before the last open is not news (another device, old history)', () => {
    const now = since('2026-10-01', { [d(5)]: 'rest' }, { freezes: [d(5)] });
    expect(sinceLastOpen({ date: d(2), streak: 14, freezesUsed: [] }, now).event).toBeNull();
  });

  test('two freezes while away: one card with the count, the latest day covered', () => {
    const now = since('2026-10-01', { [d(1)]: 'rest', [d(2)]: 'rest' }, { freezes: [d(2), d(1)] });
    const { event } = sinceLastOpen({ date: d(3), streak: 14, freezesUsed: [] }, now);
    expect(event).toMatchObject({ kind: 'freeze', covered: d(1), count: 2 });
  });

  test('the last-open day itself can be the frozen one (closed before finishing it)', () => {
    const now = since('2026-10-01', { [d(1)]: 'rest' }, { freezes: [d(1)] });
    expect(sinceLastOpen({ date: d(1), streak: 15, freezesUsed: [] }, now).event?.kind).toBe('freeze');
  });

  test('a missed day with no freeze left: reset card with the streak that ended', () => {
    const now = since('2026-10-01', { [d(1)]: 'missed' });
    const { event, lastSeen } = sinceLastOpen({ date: d(1), streak: 16, freezesUsed: ['2026-10-01', '2026-10-02'] }, now);
    expect(now.streak).toBe(0);
    expect(event).toEqual({ kind: 'reset', ended: 16 });
    expect(lastSeen.backOnBeat).toBe(TODAY);
  });

  test('away several days, all missed: the card names the streak the user had going in', () => {
    const now = since('2026-10-01', { [d(1)]: 'missed', [d(2)]: 'missed', [d(3)]: 'missed', [d(4)]: 'missed' });
    expect(sinceLastOpen({ date: d(4), streak: 13, freezesUsed: [] }, now).event).toEqual({ kind: 'reset', ended: 13 });
  });

  test('a run that ended while away, with rest days after it, still gets its card', () => {
    const now = since('2026-10-01', { [d(3)]: 'missed', [d(2)]: 'rest', [d(1)]: 'rest' });
    const { event } = sinceLastOpen({ date: d(3), streak: 14, freezesUsed: [] }, now);
    expect(event).toEqual({ kind: 'reset', ended: 14 });
  });

  test('a short run ending is not news (below RESET_MIN_STREAK)', () => {
    const now = since(d(2), { [d(1)]: 'missed' });
    expect(now.streakEndingOn(d(2))).toBe(1);
    expect(RESET_MIN_STREAK).toBe(2);
    expect(sinceLastOpen({ date: d(1), streak: 1, freezesUsed: [] }, now).event).toBeNull();
  });

  test('a new streak already running (another device) gets no reset card, and drops Back on beat', () => {
    const now = since('2026-10-01', { [d(3)]: 'missed' });
    expect(now.streak).toBe(2);
    const { event, lastSeen } = sinceLastOpen({ date: d(4), streak: 14, freezesUsed: [], backOnBeat: d(4) }, now);
    expect(event).toBeNull();
    expect(lastSeen.backOnBeat).toBeUndefined();
  });

  test('a reset already announced is not announced again the next day', () => {
    // Reset seen on d(1); nothing done since; d(1) missed again.
    const now = since('2026-10-01', { [d(2)]: 'missed', [d(1)]: 'missed' });
    const { event, lastSeen } = sinceLastOpen({ date: d(1), streak: 0, freezesUsed: [], backOnBeat: d(1) }, now);
    expect(event).toBeNull();
    // Still waiting for the first check-off.
    expect(lastSeen.backOnBeat).toBe(d(1));
  });

  test('a reset outranks a freeze spent in the same absence', () => {
    const now = since('2026-10-01', { [d(3)]: 'rest', [d(1)]: 'missed' }, { freezes: [d(3)] });
    const { event } = sinceLastOpen({ date: d(4), streak: 13, freezesUsed: [] }, now);
    expect(event).toEqual({ kind: 'reset', ended: now.streakEndingOn(d(2)) });
  });

  test('a long absence with a streak running (another device) fires nothing', () => {
    const now = since('2026-10-01', {});
    expect(sinceLastOpen({ date: '2025-01-01', streak: 3, freezesUsed: [] }, now).event).toBeNull();
  });
});

describe('sameLastSeen', () => {
  test('compares every field', () => {
    const a = { date: TODAY, streak: 3, freezesUsed: ['2026-10-02'] };
    expect(sameLastSeen(a, { ...a })).toBe(true);
    expect(sameLastSeen(a, { ...a, streak: 4 })).toBe(false);
    expect(sameLastSeen(a, { ...a, freezesUsed: [] })).toBe(false);
    expect(sameLastSeen(a, { ...a, backOnBeat: TODAY })).toBe(false);
    expect(sameLastSeen(null, a)).toBe(false);
  });
});

describe('streakNewsTonight', () => {
  test('nothing when today is done or a rest day', () => {
    expect(streakNewsTonight({ todayStatus: 'done', streak: 5, freezesLeft: 2 })).toBeNull();
    expect(streakNewsTonight({ todayStatus: 'rest', streak: 5, freezesLeft: 0 })).toBeNull();
  });
  test('a freeze left: the streak holds', () => {
    expect(streakNewsTonight({ todayStatus: 'missed', streak: 5, freezesLeft: 1 })).toEqual({ kind: 'freeze', streak: 5 });
    expect(streakNewsTonight({ todayStatus: 'missed', streak: 0, freezesLeft: 1 })).toBeNull();
  });
  test('no freeze left: the streak ends (from RESET_MIN_STREAK days)', () => {
    expect(streakNewsTonight({ todayStatus: 'missed', streak: 5, freezesLeft: 0 })).toEqual({ kind: 'reset', ended: 5 });
    expect(streakNewsTonight({ todayStatus: 'missed', streak: 1, freezesLeft: 0 })).toBeNull();
  });
});
