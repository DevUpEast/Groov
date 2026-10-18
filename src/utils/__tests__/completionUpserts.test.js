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

  it('a foreground pull skips rows whose local value is still queued (m3)', async () => {
    busyUntil = Date.now() + 1500;
    queueUpsert(jest.fn(), 'u1', DAY, 'w', 5, opts);
    const rows = [{ date: DAY, habit_id: 'w', count: 3 }, { date: DAY, habit_id: 'r', count: 1 }];
    expect(withoutPendingRows(rows)).toEqual([{ date: DAY, habit_id: 'r', count: 1 }]);
    flushMoment();
    await Promise.resolve(); await Promise.resolve(); // the send has resolved
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

describe('C-06b round 2: pending upserts survive a kill', () => {
  const { configurePendingUpserts, resendPendingUpserts, overlayPendingUpserts, __resetPendingUpsertsForTests, PENDING_UPSERTS_KEY } = require('../completionUpserts');
  let disk;
  const store = { load: async (k) => disk[k] ?? null, save: (k, v) => { disk[k] = JSON.parse(JSON.stringify(v)); } };
  beforeEach(() => { disk = {}; __resetPendingUpsertsForTests(); configurePendingUpserts(store); });

  it('a queued row is on disk at once and leaves it once sent', async () => {
    const send = jest.fn(async () => true);
    busyUntil = Date.now() + 1500;
    queueUpsert(send, 'u1', DAY, 'w', 8, opts);
    await Promise.resolve(); // one coalesced write per tick
    expect(disk[PENDING_UPSERTS_KEY]).toEqual({ [upsertKey(DAY, 'w')]: { userId: 'u1', day: DAY, habitId: 'w', count: 8, queuedAt: expect.any(Number) } });
    flushMoment();
    await Promise.resolve(); await Promise.resolve();
    expect(send).toHaveBeenCalledWith('u1', DAY, 'w', 8);
    expect(disk[PENDING_UPSERTS_KEY]).toEqual({});
  });

  it('killed inside the moment: the next launch sends the row before the pull, for this user only', async () => {
    busyUntil = Date.now() + 1500;
    queueUpsert(jest.fn(), 'u1', DAY, 'w', 8, opts);
    queueUpsert(jest.fn(), 'u2', DAY, 'x', 3, opts);
    await Promise.resolve();
    // The kill: the moment never ends, the process goes. A fresh module state on launch.
    __resetPendingUpsertsForTests();
    __resetAfterMomentForTests();
    configurePendingUpserts(store);
    const send = jest.fn(async () => true);
    const left = await resendPendingUpserts(send, 'u1');
    expect(send.mock.calls).toEqual([['u1', DAY, 'w', 8]]);
    expect(left).toEqual([]);
    await Promise.resolve();
    expect(disk[PENDING_UPSERTS_KEY]).toEqual({});
  });

  it('a row that still fails stays on disk and is laid over the pulled completions', async () => {
    disk[PENDING_UPSERTS_KEY] = { [upsertKey(DAY, 'w')]: { userId: 'u1', day: DAY, habitId: 'w', count: 8, queuedAt: Date.now() } };
    const left = await resendPendingUpserts(async () => false, 'u1');
    expect(left).toHaveLength(1);
    await Promise.resolve();
    expect(Object.keys(disk[PENDING_UPSERTS_KEY])).toEqual([upsertKey(DAY, 'w')]);
    expect(overlayPendingUpserts({ [DAY]: { w: 7, r: 1 } }, left)).toEqual({ [DAY]: { w: 8, r: 1 } });
  });
});

describe('C-06b round 2 review: pending rows and local wipes, age, pulls, retries', () => {
  const cu = require('../completionUpserts');
  let disk;
  const store = { load: async (k) => disk[k] ?? null, save: (k, v) => { disk[k] = JSON.parse(JSON.stringify(v)); } };
  const tick = () => new Promise((r) => setImmediate ? r() : r());
  const microtasks = async () => { await Promise.resolve(); await Promise.resolve(); };
  beforeEach(() => { disk = {}; cu.__resetPendingUpsertsForTests(); cu.configurePendingUpserts(store); });

  it('Reset all data / an account switch: no old row is written back or replayed (M1)', async () => {
    busyUntil = Date.now() + 1500;
    const sendA = jest.fn(async () => true);
    cu.queueUpsert(sendA, 'userA', DAY, 'w', 8, opts);
    await microtasks();
    expect(Object.keys(disk[cu.PENDING_UPSERTS_KEY])).toHaveLength(1);
    // The wipe: dropMoment + dropPendingUpserts, then the store is cleared.
    dropMomentForTest();
    cu.dropPendingUpserts();
    disk = {};
    // A tap after the wipe (user B), then the app is killed and relaunched.
    const sendB = jest.fn(async () => true);
    cu.queueUpsert(sendB, 'userB', DAY, 'r', 1, opts);
    await microtasks();
    expect(Object.values(disk[cu.PENDING_UPSERTS_KEY]).map(r => r.userId)).toEqual(['userB']);
    cu.__resetPendingUpsertsForTests();
    __resetAfterMomentForTests();
    cu.configurePendingUpserts(store);
    // User B launches again: only B's own row goes up; nothing of A is left anywhere.
    const resend = jest.fn(async () => true);
    await cu.resendPendingUpserts(resend, 'userB');
    expect(resend.mock.calls).toEqual([['userB', DAY, 'r', 1]]);
    // And had A logged back in, there is nothing of A's left to replay either.
    const resendA = jest.fn(async () => true);
    await cu.resendPendingUpserts(resendA, 'userA');
    expect(resendA).not.toHaveBeenCalled();
    expect(sendA).not.toHaveBeenCalled();
  });

  it('a send in flight across a wipe does not put its row back', async () => {
    let finish;
    const send = jest.fn(() => new Promise((r) => { finish = r; }));
    cu.queueUpsert(send, 'u1', DAY, 'w', 8);
    expect(send).toHaveBeenCalled();
    cu.dropPendingUpserts();
    finish(false);
    await microtasks();
    expect(cu.isPendingRow(DAY, 'w')).toBe(false);
    expect(disk[cu.PENDING_UPSERTS_KEY]).toEqual({});
  });

  it('rows older than 48 h are dropped, not replayed (m2)', async () => {
    const now = Date.now();
    disk[cu.PENDING_UPSERTS_KEY] = {
      [upsertKey(DAY, 'old')]: { userId: 'u1', day: DAY, habitId: 'old', count: 3, queuedAt: now - cu.PENDING_MAX_AGE_MS - 1 },
      [upsertKey(DAY, 'new')]: { userId: 'u1', day: DAY, habitId: 'new', count: 2, queuedAt: now - 1000 },
    };
    const send = jest.fn(async () => true);
    await cu.resendPendingUpserts(send, 'u1', now);
    expect(send.mock.calls).toEqual([['u1', DAY, 'new', 2]]);
  });

  it('a failed send keeps its row out of a foreground pull, and the foreground retries it (m1)', async () => {
    const send = jest.fn(async () => false);
    cu.queueUpsert(send, 'u1', DAY, 'w', 8);
    await microtasks();
    expect(cu.isPendingRow(DAY, 'w')).toBe(true);
    const pulled = [{ date: DAY, habit_id: 'w', count: 7 }, { date: DAY, habit_id: 'r', count: 1 }];
    expect(withoutPendingRows(pulled)).toEqual([{ date: DAY, habit_id: 'r', count: 1 }]);
    const retry = jest.fn(async () => true);
    cu.retryPendingUpserts(retry, 'u1');
    await microtasks();
    expect(retry).toHaveBeenCalledWith('u1', DAY, 'w', 8);
    expect(cu.isPendingRow(DAY, 'w')).toBe(false);
  });

  it('disk writes are coalesced to one per tick (m3)', async () => {
    const saves = [];
    cu.configurePendingUpserts({ load: store.load, save: (k, v) => saves.push(Object.keys(v).length) });
    busyUntil = Date.now() + 1500;
    for (let i = 0; i < 5; i++) cu.queueUpsert(jest.fn(), 'u1', DAY, `h${i}`, 1, opts);
    await microtasks();
    expect(saves).toEqual([5]);
  });
});

function dropMomentForTest() { require('../afterMoment').dropMoment(); }
