// The visual half of the check-off moment (plan §4.1, C-06b). useCheckoffMoment (C-06a) plans
// the beats; this module carries the visual ones to the components that animate them, so a
// beat reaches HabitCard and TodayHeader without re-rendering the Today screen.
//
// - `expectBeat(item)`: a visual beat is scheduled (its timer is running). A component whose
//   data changes while a matching beat is pending holds the old look until the beat fires
//   (the ring waits for +125, the gold ring for +750).
// - `emitBeat(item)`: the beat is due. Components waiting on it start their animation.
// - `cancelBeat(item)`: an un-check or a coalesced tap took it back. Waiting components look
//   again (`findBeat`) and, with nothing pending, show the new state at once.
// - `findBeat(match)`: the latest pending beat that matches, else the latest one that fired
//   and whose window (`at + duration` from the tap, plus FIRED_GRACE_MS) is still open. A change with neither is
//   not part of a moment (a sync pull, the widget, the choreography flag off) and is shown
//   immediately.
//
// Items are planBeats items plus `tapAt`. `match` is `{ beat: name | [names], habitId?,
// challengeId? }`. Pure module state, no React: the hooks live in src/hooks/useTween.js.
import { MOMENT_MS } from './beats';
import { beat, duration } from '../theme/motion';

// A fired beat still counts for this long after its window: a slow render (the dev build
// spends ~300 ms rendering Today after a tap) must not turn the check draw into a jump.
export const FIRED_GRACE_MS = beat.b4;
// A beat that is ridden late still plays for at least this long (capped at its own length).
export const LATE_MIN_MS = duration.reduced;

let pending = new Map(); // key -> item
let fired = new Map(); // key -> item
const listeners = new Set();

function notify(type, item) {
  listeners.forEach((fn) => { try { fn({ type, item }); } catch { /* a listener never breaks the moment */ } });
}

const startOf = (item) => item.tapAt + item.at;
const endOf = (item) => startOf(item) + (item.duration || 0);

export function matchesBeat(item, match) {
  if (!item || !match) return false;
  const names = Array.isArray(match.beat) ? match.beat : [match.beat];
  if (!names.includes(item.beat)) return false;
  // An item with no habit (Mark the rest's confirm) is for every card.
  if (match.habitId != null && item.habitId != null && item.habitId !== match.habitId) return false;
  if (match.challengeId != null && !(item.challengeIds || []).includes(match.challengeId)) return false;
  return true;
}

export function expectBeat(item) {
  pending.set(item.key, item);
}

export function cancelBeat(item) {
  if (pending.get(item.key) !== item) return;
  pending.delete(item.key);
  notify('cancel', item);
}

export function emitBeat(item) {
  if (pending.get(item.key) === item) pending.delete(item.key);
  fired.set(item.key, item);
  notify('fire', item);
}

/** See the header. Returns `{ status: 'pending' | 'fired', item }` or null. */
export function findBeat(match, now = Date.now()) {
  if (!match) return null;
  let best = null;
  pending.forEach((item, key) => {
    // A pending beat whose timer never ran (it would have fired long ago) is stale.
    if (now - startOf(item) > MOMENT_MS) { pending.delete(key); return; }
    if (matchesBeat(item, match) && (!best || startOf(item) > startOf(best))) best = item;
  });
  if (best) return { status: 'pending', item: best };
  fired.forEach((item, key) => {
    if (now >= endOf(item) + FIRED_GRACE_MS) { fired.delete(key); return; }
    if (matchesBeat(item, match) && (!best || startOf(item) > startOf(best))) best = item;
  });
  return best ? { status: 'fired', item: best } : null;
}

/** ms left in a fired beat's window (0 once it has passed). */
export function remainingOf(item, now = Date.now()) {
  return Math.max(0, endOf(item) - now);
}

/**
 * How long an animation riding this beat runs from now: what is left of its window, but never
 * less than LATE_MIN_MS (or the beat's own length when that is shorter), so a late start is
 * still seen. The Feedback log frame entries show the lateness.
 */
export function rideLength(item, now = Date.now()) {
  return Math.max(remainingOf(item, now), Math.min(item.duration || 0, LATE_MIN_MS));
}

export function subscribeBeats(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function __resetBeatBusForTests() {
  pending = new Map();
  fired = new Map();
  listeners.clear();
}
