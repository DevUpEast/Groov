// C-06a review B1 / M3: completion upserts share one queue key per habit and day, so the
// latest value wins whatever order the writes were queued in; the live completions map
// counts rapid taps before a render.
const { queueUpsert, queueUpserts, upsertKey, withoutPendingRows } = require('../completionUpserts');
const { flushMoment, __resetAfterMomentForTests, pendingAfterMoment } = require('../afterMoment');
const { createLiveCompletions } = require('../liveCompletions');
const { applyMarkRest, revertMarkRest, countAfterIncrement } = require('../habits');

const DAY = '2026-10-18';
let busyUntil = 0;
const opts = { busyFor: () => Math.max(0, busyUntil - Date.now()) };

beforeEach(() => { jest.useFakeTimers(); __resetAfterMomentForTests(); busyUntil = 0; });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

describe('B1: Mark the rest, then Undo inside the moment', () => {
  const habits = [
    { id: 'r', name: 'Read', type: 'daily' },
    { id: 'm', name: 'Move', type: 'daily' },
    { id: 'q', name: 'No sugar', type: 'quit' },
  ];

  it('each habit gets exactly one upsert, with the restored value', () => {
    const send = jest.fn();
    busyUntil = Date.now() + 1500; // the markRest feedback opened the moment
    const before = { m: 1 }; // Move was already done by hand
    const satisfied = (h) => (before[h.id] || 0) >= 1;
    const { next, changedIds } = applyMarkRest(before, habits, [], satisfied);
    expect(changedIds.sort()).toEqual(['q', 'r']);
    queueUpserts(send, 'u1', DAY, Object.fromEntries(changedIds.map(id => [id, 1])), opts);

    jest.advanceTimersByTime(1000);
    busyUntil = Date.now() + 1500; // Undo plays habit.undone: the moment goes on
    const { syncMap } = revertMarkRest({ [DAY]: next }, DAY, before, changedIds);
    queueUpserts(send, 'u1', DAY, syncMap, opts);
    expect(send).not.toHaveBeenCalled();

    flushMoment();
    const calls = send.mock.calls.map(([, day, id, count]) => [day, id, count]).sort();
    expect(calls).toEqual([[DAY, 'q', 0], [DAY, 'r', 0]]);
  });

  it('the restored value also wins when the moment ends on its own', () => {
    const send = jest.fn();
    busyUntil = Date.now() + 1500;
    queueUpserts(send, 'u1', DAY, { r: 1 }, opts);
    jest.advanceTimersByTime(800);
    busyUntil = Date.now() + 1500;
    queueUpserts(send, 'u1', DAY, { r: 0 }, opts);
    jest.advanceTimersByTime(5000);
    expect(send.mock.calls).toEqual([['u1', DAY, 'r', 0]]);
  });
});

describe('queueUpsert', () => {
  it('ten rapid steps send the last count once; other habits and days stay separate', () => {
    const send = jest.fn();
    busyUntil = Date.now() + 1500;
    for (let i = 1; i <= 10; i++) queueUpsert(send, 'u1', DAY, 'w', i, opts);
    queueUpsert(send, 'u1', DAY, 'r', 1, opts);
    queueUpsert(send, 'u1', '2026-10-17', 'w', 8, opts);
    expect(pendingAfterMoment()).toBe(3);
    flushMoment();
    expect(send.mock.calls).toEqual([['u1', DAY, 'w', 10], ['u1', DAY, 'r', 1], ['u1', '2026-10-17', 'w', 8]]);
  });

  it('signed out: nothing is queued', () => {
    const send = jest.fn();
    queueUpsert(send, null, DAY, 'w', 1, opts);
    queueUpserts(send, null, DAY, { w: 1 }, opts);
    expect(pendingAfterMoment()).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('a foreground pull skips rows whose local value is still queued (m3)', () => {
    busyUntil = Date.now() + 1500;
    queueUpsert(jest.fn(), 'u1', DAY, 'w', 5, opts);
    const rows = [{ date: DAY, habit_id: 'w', count: 3 }, { date: DAY, habit_id: 'r', count: 1 }];
    expect(withoutPendingRows(rows)).toEqual([{ date: DAY, habit_id: 'r', count: 1 }]);
    flushMoment();
    expect(withoutPendingRows(rows)).toEqual(rows);
    expect(upsertKey(DAY, 'w')).toBe(`sync:${DAY}:w`);
  });
});

describe('live completions (acceptance (c))', () => {
  const water = { id: 'w', type: 'volume', volumeGoal: 8 };
  // incrementHabit's read-compute-write, against the live map.
  const increment = (live, setState) => {
    const cur = (live.get()[DAY] || {}).w || 0;
    const next = countAfterIncrement(water, cur, 1);
    const fn = prev => ({ ...prev, [DAY]: { ...(prev[DAY] || {}), w: next } });
    live.update(fn);
    setState(fn);
  };

  it('two increments before a render give 2, and the render keeps 2', () => {
    let state = {};
    const queued = [];
    const live = createLiveCompletions(state);
    increment(live, fn => queued.push(fn));
    increment(live, fn => queued.push(fn));
    expect(live.get()[DAY].w).toBe(2);
    // React applies the queued updaters in order at the next render.
    state = queued.reduce((s, fn) => fn(s), state);
    expect(live.sync(state)[DAY].w).toBe(2);
  });

  it('ten taps in one frame give 10', () => {
    const live = createLiveCompletions({});
    for (let i = 0; i < 10; i++) increment(live, () => {});
    expect(live.get()[DAY].w).toBe(10);
  });

  it('a new state from a pull or a widget toggle replaces the live map', () => {
    const live = createLiveCompletions({ [DAY]: { w: 2 } });
    const pulled = { [DAY]: { w: 6, r: 1 } };
    expect(live.sync(pulled)).toBe(pulled);
    expect(live.get()[DAY].w).toBe(6);
    // The same identity again is not a change: a write made since is kept.
    live.update(prev => ({ ...prev, [DAY]: { ...prev[DAY], w: 7 } }));
    expect(live.sync(pulled)[DAY].w).toBe(7);
    // A whole-map write (reset) works too.
    expect(live.update({})).toEqual({});
  });
});
