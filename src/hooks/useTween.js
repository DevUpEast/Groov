// Value tweens and beat-held values (plan §2.9, §4.1; C-06b). Shared by the Today ring, the
// check draw, the count rolls and (V-01) the Progress stat values.
//
// useTween(target, opts) returns an Animated.Value that follows `target`:
// - no `beat`: every change tweens over `duration` (capped at 150 ms under reduced motion),
//   unless `onlyOnBeat`;
// - with `beat` (a src/utils/beatBus.js match): a change made while a matching beat is
//   pending waits for it, then runs over the beat's own length (planBeats already shortens it
//   under reduced motion), so the ring starts at +125 and ends at +425 whatever the render
//   cost; a change inside a beat that has already fired runs over what is left of its window;
//   a change with no beat (a sync pull, the widget, the choreography flag off) tweens, or with
//   `onlyOnBeat` jumps, which is the immediate state;
// - `from(prev, next)`: a start value for a change (the check draw restarts from 0);
// - `anticipate(item, current)`: start a run from the beat itself, before its render (the
//   ring's gold sweep at +750); provisional until a render confirms it, else reconciled;
// - `fromCommit`: a fired beat's run starts at the commit over its full length (the card);
// - `log` (a name, or a function of the target): in __DEV__ (or with the frameLog dev flag) an Animated listener records the first
//   and last frame of each beat-driven run and writes them to the Feedback log against the
//   beat's planned window (acceptance a).
//
// useBeatValue(value, match, opts) holds a discrete value (a count label, the ring's complete
// state, a chip's claim) until its beat: returns `{ value, beat }`, where `beat` is the item
// that released the shown value (null when it changed outside a moment). `release: 'end'`
// waits for the end of the beat's window instead of its start (the beat-row mark fills at
// +425, when the ring tween lands).
import { useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import { Animated } from 'react-native';
import { duration as durations, easing as easings, reducedDuration } from '../theme/motion';
import { useReducedMotion } from '../utils/a11y';
import { findBeat, matchesBeat, remainingOf, rideLength, subscribeBeats } from '../utils/beatBus';
import { logFrames } from '../services/feedback';

// Less than a frame left: show the end state instead of a one-frame tween.
const FRAME_MS = 16;
const keyOf = (match) => (match ? JSON.stringify(match) : '');

export function frameLogOn() {
  if (typeof __DEV__ !== 'undefined' && __DEV__) return true;
  // Release builds: the device-local frameLog dev flag (required lazily: it pulls in storage).
  try { return require('../utils/devFlags').getDevFlag('frameLog'); } catch { return false; }
}

// Records the first and last frame of one run (Date.now() of the listener calls).
function watchFrames(value, name, item) {
  if (!name || !item || typeof logFrames !== 'function' || !frameLogOn()) return null;
  const startedAt = Date.now();
  let first = null;
  let last = null;
  let count = 0;
  const id = value.addListener(() => {
    const now = Date.now();
    if (first == null) first = now;
    last = now;
    count += 1;
  });
  return (finished) => {
    value.removeListener(id);
    if (!finished || first == null) return;
    logFrames({ name, tapAt: item.tapAt, target: item.at, length: item.duration, startedAt, first, last, count });
  };
}

export default function useTween(target, opts = {}) {
  const {
    beat: match = null, onlyOnBeat = false, duration: ms = durations.value,
    easing = easings.standard, useNativeDriver = false, from = null, log = null, anticipate = null,
    fromCommit = false,
  } = opts;
  const reduced = useReducedMotion();
  const value = useRef(null);
  if (!value.current) value.current = new Animated.Value(target);
  const last = useRef(target); // the target the value is at or heading to
  const latest = useRef(target); // the prop as last rendered
  latest.current = target;
  const prev = useRef(target);
  const waiting = useRef(false);
  const provisional = useRef(null); // an anticipated target no render has confirmed yet
  const reconcileTimer = useRef(null);
  const anim = useRef(null);
  const cfg = useRef(opts);
  cfg.current = { ms, easing, useNativeDriver, from, log, onlyOnBeat, reduced, anticipate, fromCommit };

  const run = (item, { full = false } = {}) => {
    const c = cfg.current;
    const v = value.current;
    anim.current?.stop();
    anim.current = null;
    waiting.current = false;
    const to = last.current;
    if (!item && c.onlyOnBeat) { v.setValue(to); return; }
    const length = item ? (full ? item.duration : rideLength(item)) : (c.reduced ? reducedDuration(c.ms) : c.ms);
    if (length < FRAME_MS) { v.setValue(to); return; }
    const start = c.from ? c.from(prev.current, to) : null;
    if (start != null) v.setValue(start);
    const done = watchFrames(v, typeof c.log === 'function' ? c.log(to) : c.log, item);
    const a = Animated.timing(v, {
      toValue: to,
      duration: length,
      easing: c.reduced ? easings.standard : c.easing,
      useNativeDriver: c.useNativeDriver,
    });
    anim.current = a;
    a.start(({ finished }) => { done?.(finished); if (anim.current === a) anim.current = null; });
  };

  // An anticipated target that no render confirmed (round 1 B1: the day broke before the
  // resolution beat, so `complete` never changed): go back to the real target.
  const reconcile = () => {
    reconcileTimer.current = null;
    if (provisional.current == null) return;
    provisional.current = null;
    if (Object.is(last.current, latest.current)) return;
    prev.current = last.current;
    last.current = latest.current;
    const hit = findBeat(match);
    if (hit && hit.status === 'pending') { waiting.current = true; return; }
    run(null);
  };

  // A change of target: wait for a pending beat, ride a fired one, or (no moment) tween/jump.
  // A layout effect, so a jump is in place before the frame paints. With `fromCommit` a fired
  // beat's run starts here, at the commit, over its full length (the card's confirm: the
  // tap's render takes ~100 ms, which would otherwise eat most of the 200 ms draw).
  useLayoutEffect(() => {
    if (provisional.current != null && Object.is(provisional.current, target)) {
      provisional.current = null; // the render caught up with the anticipated run
      return;
    }
    if (Object.is(last.current, target)) return;
    provisional.current = null;
    prev.current = last.current;
    last.current = target;
    const hit = findBeat(match);
    if (hit && hit.status === 'pending') { waiting.current = true; return; }
    run(hit ? hit.item : null, { full: !!(hit && cfg.current.fromCommit) });
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  const matchKey = keyOf(match);
  useEffect(() => {
    if (!match) return undefined;
    return subscribeBeats(({ type, item }) => {
      if (!matchesBeat(item, match)) return;
      if (!waiting.current) {
        // A beat fires in a timer or the tap handler, before React renders the change it
        // brings. With `anticipate(item, current)` the caller names that target, so the run
        // starts now instead of after the render. The target stays provisional until a render
        // confirms it; if none has by the end of the beat, the value goes back (reconcile).
        const to = type === 'fire' && cfg.current.anticipate ? cfg.current.anticipate(item, last.current) : null;
        if (to == null || Object.is(to, last.current)) return;
        prev.current = last.current;
        last.current = to;
        provisional.current = to;
        run(item);
        clearTimeout(reconcileTimer.current);
        reconcileTimer.current = setTimeout(reconcile, rideLength(item) + FRAME_MS);
        return;
      }
      if (type === 'fire') { run(item); return; }
      // Cancelled: a newer beat may have replaced it; otherwise show the change now.
      const hit = findBeat(match);
      if (!hit || hit.status !== 'pending') run(hit ? hit.item : null);
    });
  }, [matchKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { anim.current?.stop(); clearTimeout(reconcileTimer.current); }, []);
  return value.current;
}

/** See the header. */
export function useBeatValue(value, match, { isEqual = Object.is, release = 'start' } = {}) {
  const [, force] = useReducer((x) => x + 1, 0);
  const shown = useRef(null);
  if (!shown.current) shown.current = { value, beat: null };
  const latest = useRef(value);
  latest.current = value;
  const waiting = useRef(null); // the pending item (or 'any') the shown value waits for
  const timer = useRef(null);

  // Decided during render so the held value never paints a frame early.
  if (!isEqual(shown.current.value, value)) {
    const hit = findBeat(match);
    if (hit && (hit.status === 'pending' || (release === 'end' && remainingOf(hit.item) > 0))) {
      if (!waiting.current) waiting.current = hit;
      if (hit.status === 'fired' && !timer.current) {
        timer.current = setTimeout(() => { timer.current = null; releaseNow(hit.item); }, remainingOf(hit.item));
      }
    } else {
      shown.current = { value, beat: hit ? hit.item : null };
      waiting.current = null;
    }
  } else if (waiting.current) {
    // The value went back to what is shown (a quick un-check): nothing to wait for.
    waiting.current = null;
  }

  function releaseNow(item) {
    waiting.current = null;
    if (isEqual(shown.current.value, latest.current)) return;
    shown.current = { value: latest.current, beat: item };
    force();
  }

  const matchKey = keyOf(match);
  useEffect(() => {
    if (!match) return undefined;
    const off = subscribeBeats(({ type, item }) => {
      if (!waiting.current || !matchesBeat(item, match)) return;
      if (type === 'fire') {
        if (release === 'end' && item.duration > 0) {
          clearTimeout(timer.current);
          timer.current = setTimeout(() => { timer.current = null; releaseNow(item); }, item.duration);
        } else releaseNow(item);
        return;
      }
      // Cancelled (an un-check): the change that cancelled it is about to render, so do not
      // show the held value now (it would flash "Day complete" for a frame); re-render and
      // let the render decide against the new value and whatever is pending then.
      const hit = findBeat(match);
      if (!hit || hit.status !== 'pending') { clearTimeout(timer.current); timer.current = null; waiting.current = null; force(); }
    });
    return () => { off(); clearTimeout(timer.current); timer.current = null; };
  }, [matchKey, release]); // eslint-disable-line react-hooks/exhaustive-deps

  return shown.current;
}
