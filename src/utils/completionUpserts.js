import { afterMoment, isPendingAfterMoment } from './afterMoment';

// Every cloud upsert of a completion goes through one queue key per habit and day (C-06a
// review B1), `sync:<day>:<habitId>`, so whatever order the writes are queued in, the
// latest value per habit is the one sent. Before this, Mark the rest's deferred batch could
// land after its own Undo and put the 1s back in the cloud; the next pull then reverted the
// Undo on screen.
//
// `send(userId, day, habitId, count)` is services/sync.js syncCompletion (injected, so
// this module stays pure and testable).

export const upsertKey = (day, habitId) => `sync:${day}:${habitId}`;

// Durable pending upserts (C-06b round 2, the 8 -> 7 loss): the network write waits out the
// moment, and a force-stop, `adb install -r` or an OOM kill inside that wait never runs the
// background flush. So every queued row is also written to the AsyncStorage key
// PENDING_UPSERTS_KEY until `send` resolves true; on the next launch AppContext calls
// `resendPendingUpserts` before the login pull, so the cloud has the latest value before it
// replaces local completions, and `overlayPendingUpserts` keeps a row that still failed to
// send. The store is injected (`configurePendingUpserts({ load, save })`) so this stays pure.
export const PENDING_UPSERTS_KEY = 'pendingUpserts';
let store = null;
let pendingRows = new Map(); // key -> { userId, day, habitId, count }

export function configurePendingUpserts(s) {
  store = s;
}

function savePending() {
  if (!store) return;
  try { store.save(PENDING_UPSERTS_KEY, Object.fromEntries(pendingRows)); } catch { /* best effort */ }
}

/** Queue one habit's count for `day` (after the current check-off moment). */
export function queueUpsert(send, userId, day, habitId, count, opts) {
  if (!userId) return;
  const key = upsertKey(day, habitId);
  const row = { userId, day, habitId, count };
  pendingRows.set(key, row);
  savePending();
  afterMoment(key, () => {
    let result;
    try { result = send(userId, day, habitId, count); } catch { return; }
    Promise.resolve(result).then((ok) => {
      // `false` = the write failed: keep the row for the next launch.
      if (ok === false || pendingRows.get(key) !== row) return;
      pendingRows.delete(key);
      savePending();
    }, () => {});
  }, opts);
}

/**
 * Next launch: send the rows a kill left behind for `userId` (other users' rows are dropped)
 * and wait for them, so the login pull reads them back. Resolves to the rows still unsent.
 */
export async function resendPendingUpserts(send, userId) {
  if (!store || !userId) return [];
  let stored = null;
  try { stored = await store.load(PENDING_UPSERTS_KEY); } catch { stored = null; }
  const rows = Object.values(stored || {}).filter((r) => r && r.userId === userId && !pendingRows.has(upsertKey(r.day, r.habitId)));
  const left = [];
  await Promise.all(rows.map(async (r) => {
    let ok = false;
    try { ok = (await send(r.userId, r.day, r.habitId, r.count)) !== false; } catch { ok = false; }
    if (!ok) { left.push(r); pendingRows.set(upsertKey(r.day, r.habitId), r); }
  }));
  savePending();
  return left;
}

/** Put unsent rows back over pulled completions ({ day: { habitId: count } }). */
export function overlayPendingUpserts(completions, rows) {
  if (!rows?.length) return completions;
  const next = { ...(completions || {}) };
  rows.forEach((r) => { next[r.day] = { ...(next[r.day] || {}), [r.habitId]: r.count }; });
  return next;
}

export function __resetPendingUpsertsForTests() {
  store = null;
  pendingRows = new Map();
}

/** Queue a { habitId: count } map for `day`, one key per habit. */
export function queueUpserts(send, userId, day, counts, opts) {
  if (!userId || !counts) return;
  Object.entries(counts).forEach(([habitId, count]) => queueUpsert(send, userId, day, habitId, count, opts));
}

/**
 * Pulled completion rows ({ date, habit_id, count }) minus those whose local value is still
 * waiting to be sent (C-06a review m3): the pending local value is newer than the row.
 */
export function withoutPendingRows(rows) {
  if (!rows?.length) return rows;
  return rows.filter(r => !isPendingAfterMoment(upsertKey(r.date, r.habit_id)));
}
