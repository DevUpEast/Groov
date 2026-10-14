import { createdAfter, mergeRecords, mergeCompletions, mergeSnapshots } from '../mergeSync';

const T = 1_700_000_000_000; // last pull

describe('createdAfter', () => {
  it('treats Date.now() ids as creation timestamps', () => {
    expect(createdAfter(String(T + 1), T)).toBe(true);
    expect(createdAfter(String(T - 1), T)).toBe(false);
  });
  it('treats legacy and non-numeric ids as old', () => {
    expect(createdAfter('1', T)).toBe(false);
    expect(createdAfter('starter', T)).toBe(false);
  });
});

describe('mergeRecords', () => {
  const a = { id: String(T - 5000), name: 'a' };
  const b = { id: String(T - 4000), name: 'b' };

  it('replaces changed records and keeps untouched ones', () => {
    const changed = [{ id: b.id, name: 'b2' }];
    const out = mergeRecords([a, b], changed, [a.id, b.id], T);
    expect(out).toEqual([a, { id: b.id, name: 'b2' }]);
  });

  it('adds records that only exist in the cloud', () => {
    const c = { id: String(T - 3000), name: 'c' };
    const out = mergeRecords([a], [c], [a.id, c.id], T);
    expect(out).toEqual([a, c]);
  });

  it('removes records deleted in the cloud', () => {
    const out = mergeRecords([a, b], [], [a.id], T);
    expect(out).toEqual([a]);
  });

  it('keeps records created locally after the last pull even if the cloud lacks them', () => {
    const fresh = { id: String(T + 100), name: 'fresh' };
    const out = mergeRecords([a, fresh], [], [a.id], T);
    expect(out).toEqual([a, fresh]);
  });

  it('skips deletion reconciliation when cloud ids are unknown', () => {
    const out = mergeRecords([a, b], [], null, T);
    expect(out).toEqual([a, b]);
  });
});

describe('mergeCompletions', () => {
  const local = { '2026-10-13': { h1: 1, h2: 3 }, '2026-10-14': { h1: 1 } };

  it('returns the same object when nothing changed', () => {
    expect(mergeCompletions(local, [])).toBe(local);
    expect(mergeCompletions(local, undefined)).toBe(local);
  });

  it('sets counts and adds new dates', () => {
    const out = mergeCompletions(local, [
      { date: '2026-10-14', habit_id: 'h2', count: 2 },
      { date: '2026-10-15', habit_id: 'h1', count: 1 },
    ]);
    expect(out['2026-10-14']).toEqual({ h1: 1, h2: 2 });
    expect(out['2026-10-15']).toEqual({ h1: 1 });
    expect(out['2026-10-13']).toBe(local['2026-10-13']);
  });

  it('removes entries with count 0 and empties dates', () => {
    const out = mergeCompletions(local, [
      { date: '2026-10-14', habit_id: 'h1', count: 0 },
      { date: '2026-10-13', habit_id: 'h2', count: 0 },
    ]);
    expect(out['2026-10-14']).toBeUndefined();
    expect(out['2026-10-13']).toEqual({ h1: 1 });
  });
});

describe('mergeSnapshots', () => {
  it('overwrites per date', () => {
    const local = { '2026-10-13': [{ id: 'h1' }] };
    const out = mergeSnapshots(local, [{ date: '2026-10-14', snapshot: [{ id: 'h1' }, { id: 'h2' }] }]);
    expect(Object.keys(out)).toEqual(['2026-10-13', '2026-10-14']);
    expect(out['2026-10-14']).toHaveLength(2);
  });
});
