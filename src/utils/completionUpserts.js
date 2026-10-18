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

/** Queue one habit's count for `day` (after the current check-off moment). */
export function queueUpsert(send, userId, day, habitId, count, opts) {
  if (!userId) return;
  afterMoment(upsertKey(day, habitId), () => send(userId, day, habitId, count), opts);
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
