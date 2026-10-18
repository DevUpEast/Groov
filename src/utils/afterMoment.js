import { AppState } from 'react-native';
import { quietIn } from '../services/feedback';

// Background work that must not land inside a check-off moment (plan §4.1: the beats run
// 0–1500 ms after the tap; C-06a carry). AsyncStorage saves, cloud upserts, the widget
// refresh, the app badge and notification rescheduling are queued here while a moment is
// playing (feedback.play in the last 1.5 s) and run once it is over. Outside a moment the
// work runs at once, so nothing changes for the rest of the app.
//
// - `key` coalesces: queuing the same key again replaces the queued work (the latest state
//   wins: ten rapid taps save the completions once and upsert the row once). `null` = always
//   run (analytics events).
// - Bounded: once the oldest queued job has waited MAX_DEFER_MS the queue runs even if taps
//   keep the moment open, so a crash while tapping loses at most that much.
// - Backgrounding the app runs everything queued straight away (`flushMoment`), so a save is
//   never lost to the app being suspended. Sign-out flushes first; a storage wipe drops the
//   queue (`dropMoment`) so nothing of the previous user is written back.

export const MAX_DEFER_MS = 3000;

const queue = new Map(); // key -> fn, in insertion order
let timer = null;
let seq = 0;
let firstQueuedAt = 0;
let appStateSub = null;

function runAll() {
  if (timer) { clearTimeout(timer); timer = null; }
  const jobs = [...queue.values()];
  queue.clear();
  jobs.forEach((fn) => { try { fn(); } catch (e) { if (__DEV__) console.warn('[afterMoment]', e?.message ?? e); } });
}

// Time to wait: the rest of the moment, but never past the cap.
function waitFor(busyFor) {
  const capLeft = firstQueuedAt + MAX_DEFER_MS - Date.now();
  return Math.min(busyFor(), capLeft);
}

function arm(busyFor) {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    if (waitFor(busyFor) > 0) arm(busyFor); // another tap extended the moment
    else runAll();
  }, Math.max(1, waitFor(busyFor)));
}

function watchAppState() {
  if (appStateSub || !AppState?.addEventListener) return;
  try {
    appStateSub = AppState.addEventListener('change', (s) => { if (s !== 'active') flushMoment(); });
  } catch { /* tests without AppState */ }
}

/**
 * Run `fn` now, or after the current check-off moment if one is playing. `opts.busyFor`
 * (tests) returns the ms left in the moment; it defaults to feedback.quietIn.
 */
export function afterMoment(key, fn, { busyFor = quietIn } = {}) {
  if (busyFor() <= 0 && queue.size === 0) { fn(); return; }
  watchAppState();
  if (queue.size === 0) firstQueuedAt = Date.now();
  const k = key == null ? `#${++seq}` : key;
  queue.delete(k); // re-insert so the order follows the latest call
  queue.set(k, fn);
  if (waitFor(busyFor) <= 0) { runAll(); return; }
  arm(busyFor);
}

/** Run everything queued now (app backgrounded, sign-out, provider unmounting). */
export function flushMoment() {
  runAll();
}

/** Forget everything queued (local data is about to be wiped: account switch, reset). */
export function dropMoment() {
  if (timer) { clearTimeout(timer); timer = null; }
  queue.clear();
}

/** Whether work under `key` is still queued (a foreground pull skips those rows). */
export function isPendingAfterMoment(key) {
  return queue.has(key);
}

/** Number of queued jobs (tests and the dev log). */
export function pendingAfterMoment() {
  return queue.size;
}

export function __resetAfterMomentForTests() {
  dropMoment();
  seq = 0;
  firstQueuedAt = 0;
}
