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
// send. A foreground calls `retryPendingUpserts` for rows that failed since. The store is
// injected (`configurePendingUpserts({ load, save })`) so this stays pure.
// - Rows older than PENDING_MAX_AGE_MS (48 h, by `queuedAt`) are dropped, not replayed.
// - A local wipe (Reset all data, an account switch, account deletion) calls
//   `dropPendingUpserts()` next to dropMoment(): the map and the disk key are cleared, and a
//   send or resend still in flight from before the wipe can no longer write rows back
//   (round 2 review M1).
// - Disk writes are coalesced to one per tick (queueMicrotask).
export const PENDING_UPSERTS_KEY = 'pendingUpserts';
export const PENDING_MAX_AGE_MS = 48 * 60 * 60 * 1000;
let store = null;
let pendingRows = new Map(); // key -> { userId, day, habitId, count, queuedAt }
let generation = 0; // bumped by a wipe; work started before it is ignored
let saveQueued = false;

const defer = typeof queueMicrotask === 'function' ? queueMicrotask : (fn) => Promise.resolve().then(fn);

export function configurePendingUpserts(s) {
  store = s;
}

function writeNow() {
  saveQueued = false;
  if (!store) return;
  try { store.save(PENDING_UPSERTS_KEY, Object.fromEntries(pendingRows)); } catch { /* best effort */ }
}

function savePending() {
  if (saveQueued) return;
  saveQueued = true;
  const gen = generation;
  defer(() => { if (gen === generation) writeNow(); else saveQueued = false; });
}

/** A local wipe: forget every pending row, in memory and on disk. */
export function dropPendingUpserts() {
  generation += 1;
  pendingRows = new Map();
  saveQueued = false;
  writeNow();
}

/** The local count for this row is newer than the cloud's (it has not been sent yet). */
export function isPendingRow(day, habitId) {
  return pendingRows.has(upsertKey(day, habitId));
}

function sendRow(send, key, row) {
  const gen = generation;
  let result;
  try { result = send(row.userId, row.day, row.habitId, row.count); } catch { return; }
  Promise.resolve(result).then((ok) => {
    // `false` = the write failed: keep the row for a retry.
    if (gen !== generation || ok === false || pendingRows.get(key) !== row) return;
    pendingRows.delete(key);
    savePending();
  }, () => {});
}

/** Queue one habit's count for `day` (after the current check-off moment). */
export function queueUpsert(send, userId, day, habitId, count, opts) {
  if (!userId) return;
  const key = upsertKey(day, habitId);
  const row = { userId, day, habitId, count, queuedAt: Date.now() };
  pendingRows.set(key, row);
  savePending();
  afterMoment(key, () => sendRow(send, key, row), opts);
}

const fresh = (r, now) => typeof r.queuedAt === 'number' && now - r.queuedAt <= PENDING_MAX_AGE_MS;

/**
 * Next launch: send the rows a kill left behind for `userId` (other users' rows and rows
 * older than 48 h are dropped) and wait for them, so the login pull reads them back.
 * Resolves to the rows still unsent.
 */
export async function resendPendingUpserts(send, userId, now = Date.now()) {
  if (!store || !userId) return [];
  const gen = generation;
  let stored = null;
  try { stored = await store.load(PENDING_UPSERTS_KEY); } catch { stored = null; }
  if (gen !== generation) return [];
  const rows = Object.values(stored || {}).filter((r) => r && r.userId === userId && fresh(r, now) && !pendingRows.has(upsertKey(r.day, r.habitId)));
  const left = [];
  await Promise.all(rows.map(async (r) => {
    let ok = false;
    try { ok = (await send(r.userId, r.day, r.habitId, r.count)) !== false; } catch { ok = false; }
    if (!ok) left.push(r);
  }));
  if (gen !== generation) return [];
  left.forEach((r) => { if (!pendingRows.has(upsertKey(r.day, r.habitId))) pendingRows.set(upsertKey(r.day, r.habitId), r); });
  savePending();
  return left;
}

/**
 * A foreground: send again the rows of `userId` whose send failed (not those still waiting
 * for the moment), and forget rows older than 48 h.
 */
export function retryPendingUpserts(send, userId, now = Date.now()) {
  if (!userId) return;
  let dropped = false;
  pendingRows.forEach((row, key) => {
    if (!fresh(row, now)) { pendingRows.delete(key); dropped = true; return; }
    if (row.userId !== userId || isPendingAfterMoment(key)) return;
    sendRow(send, key, row);
  });
  if (dropped) savePending();
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
  saveQueued = false;
  generation += 1;
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
  // Also rows whose send failed and wait for a retry (round 2 review m1).
  return rows.filter(r => !isPendingAfterMoment(upsertKey(r.date, r.habit_id)) && !isPendingRow(r.date, r.habit_id));
}
