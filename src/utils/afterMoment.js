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
// - Backgrounding the app runs everything queued straight away (`flushMoment`), so a save is
//   never lost to the app being suspended.

const queue = new Map(); // key -> fn, in insertion order
let timer = null;
let seq = 0;
let appStateSub = null;

function runAll() {
  timer = null;
  const jobs = [...queue.values()];
  queue.clear();
  jobs.forEach((fn) => { try { fn(); } catch (e) { if (__DEV__) console.warn('[afterMoment]', e?.message ?? e); } });
}

function arm(busyFor) {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const wait = busyFor();
    if (wait > 0) arm(busyFor); // another tap extended the moment
    else runAll();
  }, Math.max(1, busyFor()));
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
  const k = key == null ? `#${++seq}` : key;
  queue.delete(k); // re-insert so the order follows the latest call
  queue.set(k, fn);
  if (busyFor() <= 0) { if (timer) { clearTimeout(timer); timer = null; } runAll(); return; }
  arm(busyFor);
}

/** Run everything queued now (app backgrounded, provider unmounting). */
export function flushMoment() {
  if (timer) { clearTimeout(timer); timer = null; }
  runAll();
}

/** Number of queued jobs (tests and the dev log). */
export function pendingAfterMoment() {
  return queue.size;
}

export function __resetAfterMomentForTests() {
  if (timer) clearTimeout(timer);
  timer = null;
  queue.clear();
  seq = 0;
}
