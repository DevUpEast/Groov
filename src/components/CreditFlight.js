// The day-complete credit (plan §4.1 beat 7a, §4.2; C-07). On the creditDeparts beat (+500)
// a 12 pt gold dot with a ✓ leaves the checked card's check and flies a curved path to the
// ring centre (the sticky-bar ring when the strip has scrolled away), arriving on the
// resolution beat (+750), where the gold sweep, the chord, the haptic, the ring pulse and
// RingBurst take over.
//
// - Nothing re-renders: the dot is always mounted (hidden) and the path is Animated.Values
//   set from the measured points (creditAnchors), so the flight is one native timing.
// - The curve and the easing (emphasizedAccel, then emphasizedDecel) are baked into the
//   interpolation of one linear 0 -> 1 value (`creditCurveSamples`), because a native timing
//   takes one easing.
// - The dot stays in the ring centre until the resolution beat fires (on a busy JS thread
//   that can be a few frames after it lands), then hands over to the gold sweep and the ring ✓.
// - An un-check (or a step that breaks the day) cancels the pending resolution: a dot in the
//   air vanishes. A card that scrolled away or unmounted sends it from the strip edge (§4.2).
// - Reduced motion and the choreography flag off emit no creditDeparts beat, so no flight.
// - The layer clips to the Today body (inside the safe area) and never takes a touch.
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, InteractionManager, StyleSheet, View } from 'react-native';
import CheckMark from './ui/CheckMark';
import { amount, duration, easing } from '../theme/motion';
import { subscribeBeats, findBeat, LATE_MIN_MS } from '../utils/beatBus';
import { measureNode, measureAnchor, checkKey, relativeTo, centreOf, departurePoint } from '../utils/creditAnchors';
import { logFrames } from '../services/feedback';
import { frameLogOn } from '../hooks/useTween';

const SIZE = amount.creditSize;
const STEPS = 16;
const FRAME_MS = 16;
const linear = (x) => x;

/**
 * The normalised path (pure, tested): for t in [0, 1] (linear time), the eased progress u and
 * the share of the x and y distance covered at u on a quadratic Bézier from (0, 0) to (1, 1)
 * whose control point is (along, rise). Returns `{ input, ex, ey }` for interpolate().
 */
export function creditCurveSamples(steps = STEPS, { along, rise } = amount.creditCurve, ease = easing.credit) {
  const input = [];
  const ex = [];
  const ey = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = ease(t);
    input.push(t);
    ex.push(2 * (1 - u) * u * along + u * u);
    ey.push(2 * (1 - u) * u * rise + u * u);
  }
  return { input, ex, ey };
}

/** The bottom-most credit source of `fromIds` that is on screen (pure, tested). */
export function pickDeparture({ sources, layer, edge, cover }) {
  for (let i = sources.length - 1; i >= 0; i -= 1) {
    const p = sources[i] ? departurePoint({ source: sources[i], layer, cover }) : null;
    if (p) return p;
  }
  return departurePoint({ source: null, layer, edge });
}

/**
 * `theme`; `targets()` returns the anchor keys to fly to at this moment: `{ ring, edge, cover }`
 * (TodayScreen: the strip ring, or the sticky ring + bar once scrolled).
 */
export default function CreditFlight({ theme, targets }) {
  const layerRef = useRef(null);
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const v = useRef(null);
  if (!v.current) {
    v.current = { vis: new Animated.Value(0), t: new Animated.Value(1), sx: new Animated.Value(0), sy: new Animated.Value(0), dx: new Animated.Value(0), dy: new Animated.Value(0) };
  }
  const run = useRef({ id: 0, anim: null });

  const style = useMemo(() => {
    const { vis, t, sx, sy, dx, dy } = v.current;
    const { input, ex, ey } = creditCurveSamples();
    const px = t.interpolate({ inputRange: input, outputRange: ex, extrapolate: 'clamp' });
    const py = t.interpolate({ inputRange: input, outputRange: ey, extrapolate: 'clamp' });
    return {
      // Shown from departure until the ring resolves: a late resolution beat (a busy JS
      // thread) finds the credit waiting in the ring centre, never an empty gap.
      opacity: vis,
      transform: [
        { translateX: Animated.add(sx, Animated.multiply(dx, px)) },
        { translateY: Animated.add(sy, Animated.multiply(dy, py)) },
        { scale: t.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.6, 1, 1], extrapolate: 'clamp' }) },
      ],
    };
  }, []);

  // Connect the native animation graph while the app is idle, not on the first day complete
  // (the first native start of every interpolation node cost ~100 ms of JS on the release
  // emulator build, right on the resolution beat). A no-op run to the value it is already at.
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      const value = v.current.t;
      Animated.timing(value, { toValue: value.__getValue(), duration: duration.press, useNativeDriver: true }).start();
    });
    return () => task.cancel();
  }, []);

  useEffect(() => {
    const stop = () => {
      run.current.id += 1;
      run.current.anim?.stop();
      run.current.anim = null;
      v.current.vis.setValue(0);
    };
    const fly = async (item) => {
      stop();
      const id = run.current.id;
      const keys = targetsRef.current?.() || {};
      const fromIds = [].concat(item.creditFrom ?? item.habitId ?? []);
      const [layer, ring, edge, cover, ...sources] = await Promise.all([
        measureNode(layerRef.current),
        measureAnchor(keys.ring),
        keys.edge ? measureAnchor(keys.edge) : null,
        keys.cover ? measureAnchor(keys.cover) : null,
        ...fromIds.map((h) => measureAnchor(checkKey(h))),
      ]);
      if (id !== run.current.id || !layer || !ring) return;
      // Measuring outlasted the flight's window: the ring has resolved already, no credit.
      if (!resolutionPending()) return;
      const rel = (r) => relativeTo(r, layer);
      const start = pickDeparture({ sources: sources.map(rel), layer, edge: rel(edge), cover: rel(cover) });
      const end = centreOf(rel(ring));
      if (!start || !end) return;
      const { t, sx, sy, dx, dy } = v.current;
      sx.setValue(start.x - SIZE / 2);
      sy.setValue(start.y - SIZE / 2);
      dx.setValue(end.x - start.x);
      dy.setValue(end.y - start.y);
      // Land on the resolution beat whatever the measuring cost (at least LATE_MIN_MS of flight).
      // It lands a frame early: its end event then never shares the +750 frame with the
      // day.complete haptic and chord (C-07 review M2); the dot waits in the ring anyway.
      const left = item.tapAt + item.at + item.duration - Date.now() - FRAME_MS;
      const length = Math.max(LATE_MIN_MS, left);
      t.setValue(0);
      v.current.vis.setValue(1);
      const done = watch(t, item);
      const anim = Animated.timing(t, { toValue: 1, duration: length, easing: linear, useNativeDriver: true });
      run.current.anim = anim;
      anim.start(({ finished }) => {
        done?.(finished);
        if (run.current.anim !== anim) return;
        run.current.anim = null;
        // Landed with no resolution still to come (it fired during the flight): hide now.
        if (!resolutionPending()) v.current.vis.setValue(0);
      });
    };
    const off = subscribeBeats(({ type, item }) => {
      if (type === 'fire' && item.beat === 'creditDeparts') fly(item);
      // The credit has landed: the gold sweep and the ring ✓ take over from it.
      // It fades over duration.press, so it covers the ring until the JS-driven gold sweep has
      // painted its first frames (the sticky ring's can trail the strip's by a few frames).
      else if (type === 'fire' && item.beat === 'resolution') {
        Animated.timing(v.current.vis, { toValue: 0, duration: duration.press, easing: easing.standard, useNativeDriver: true }).start();
      }
      // The day is no longer complete (an un-check inside the moment): the credit vanishes.
      else if (type === 'cancel' && item.beat === 'resolution') stop();
    });
    return () => { off(); stop(); };
  }, []);

  return (
    <View ref={layerRef} collapsable={false} style={styles.layer} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      <Animated.View style={[styles.dot, { backgroundColor: theme.signature }, style]}>
        <CheckMark color={theme.bg} size={SIZE - 4} strokeWidth={1.6} />
      </Animated.View>
    </View>
  );
}

const resolutionPending = () => findBeat({ beat: 'resolution' })?.status === 'pending';

// The frame log (frameLog dev flag, __DEV__): the flight's first and last frame against the
// planned 500-750 window, like the other beat-driven runs (C-06b).
function watch(value, item) {
  if (!frameLogOn()) return null;
  const startedAt = Date.now();
  let first = null;
  let last = null;
  let count = 0;
  const id = value.addListener(() => { const now = Date.now(); if (first == null) first = now; last = now; count += 1; });
  return (finished) => {
    value.removeListener(id);
    if (finished && first != null) logFrames({ name: 'credit', tapAt: item.tapAt, target: item.at, length: item.duration, startedAt, first, last, count });
  };
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  dot: {
    position: 'absolute', left: 0, top: 0, width: SIZE, height: SIZE, borderRadius: SIZE / 2,
    alignItems: 'center', justifyContent: 'center',
  },
});
