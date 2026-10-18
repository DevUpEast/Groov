// The day-complete burst (plan §4.1 beat 7c; C-07): 24 particles from the Today ring,
// 750 -> 1500 ms, on the resolution beat (when the credit lands). It replaces the old
// perfect-day confetti.
//
// - Particles start just outside the ring (`amount.burstFrom` x its radius), so none crosses
//   the green / gold stroke (no olive edge, C-06b round 1 M1), and fly out to about
//   `amount.burstTo` x the radius. They scale to the ring that is showing: the 88 pt strip
//   ring, or the 28 pt sticky-bar ring once scrolled.
// - Always mounted and hidden; one native timing drives every particle (no render).
// - The layer clips to the Today body (inside the safe area) and never takes a touch, so a tap
//   during the burst registers.
// - Reduced motion: no particles (§4.3). Choreography off: TodayScreen calls `play()` at the
//   tap instead of the beat (the old confetti's slot).
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { Animated, InteractionManager, StyleSheet, View } from 'react-native';
import { amount, celebration, duration, easing, useMotion } from '../theme/motion';
import { MOMENT_MS } from '../utils/beats';
import { subscribeBeats, LATE_MIN_MS } from '../utils/beatBus';
import { measureNode, measureAnchor, relativeTo, centreOf } from '../utils/creditAnchors';

// A fixed spread (no Math.random): every burst looks the same, and tests can check it.
const jitter = (i, k) => {
  const x = Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** The particles (pure, tested): angle, start / end distance (x ring radius), size, colour index. */
export function burstParticles(count = amount.burstParticles) {
  return Array.from({ length: count }, (_, i) => {
    const angle = ((i + jitter(i, 1) * 0.6) / count) * Math.PI * 2;
    return {
      dx: Math.cos(angle),
      dy: Math.sin(angle),
      from: amount.burstFrom,
      to: amount.burstTo * (0.75 + jitter(i, 2) * 0.5),
      size: 4 + (i % 3),
      color: i,
    };
  });
}

/** `theme`; `targets()` returns `{ ring }`, the anchor key of the ring that is showing. */
function RingBurst({ theme, targets }, ref) {
  const m = useMotion();
  const reducedRef = useRef(m.reduced);
  reducedRef.current = m.reduced;
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const layerRef = useRef(null);
  const v = useRef(null);
  if (!v.current) v.current = { vis: new Animated.Value(0), p: new Animated.Value(0), ox: new Animated.Value(0), oy: new Animated.Value(0), k: new Animated.Value(1) };
  const run = useRef({ id: 0, anim: null });
  const particles = useMemo(() => burstParticles(), []);
  const colors = theme.celebration || [theme.signature];

  const styles = useMemo(() => {
    const { vis, p, ox, oy, k } = v.current;
    // `vis` (never animated) hides a stopped burst: resetting `p` right after stopping its native
    // run lost to the native end event, which wrote the mid-run value back and the particles
    // reappeared (seen on the release build after an un-check during the burst).
    const opacity = Animated.multiply(vis, p.interpolate({ inputRange: [0, 0.06, 0.55, 1], outputRange: [0, 1, 1, 0], extrapolate: 'clamp' }));
    const scale = p.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5], extrapolate: 'clamp' });
    // Decelerating outward travel, baked into the interpolation (the timing itself is linear).
    const input = [0, 0.25, 0.5, 0.75, 1];
    const out = input.map((x) => easing.emphasizedDecel(x));
    return particles.map((q) => ({
      width: q.size,
      height: q.size,
      borderRadius: q.size / 2,
      opacity,
      transform: [
        { translateX: Animated.add(Animated.add(ox, -q.size / 2), Animated.multiply(k, p.interpolate({ inputRange: input, outputRange: out.map((e) => q.dx * (q.from + (q.to - q.from) * e)) }))) },
        { translateY: Animated.add(Animated.add(oy, -q.size / 2), Animated.multiply(k, p.interpolate({ inputRange: input, outputRange: out.map((e) => q.dy * (q.from + (q.to - q.from) * e)) }))) },
        { scale },
      ],
    }));
  }, [particles]);

  const stop = useCallback(() => {
    run.current.id += 1;
    run.current.anim?.stop();
    run.current.anim = null;
    v.current.vis.setValue(0);
  }, []);

  // `endAt`: when the burst should end (ms epoch); it starts as soon as the ring is measured.
  const play = useCallback(async (endAt = Date.now() + celebration.burst) => {
    if (reducedRef.current) return;
    stop();
    const id = run.current.id;
    const keys = targetsRef.current?.() || {};
    const [layer, ring] = await Promise.all([measureNode(layerRef.current), measureAnchor(keys.ring)]);
    if (id !== run.current.id || !layer || !ring) return;
    const r = relativeTo(ring, layer);
    const c = centreOf(r);
    const { p, ox, oy, k } = v.current;
    ox.setValue(c.x);
    oy.setValue(c.y);
    k.setValue(r.width / 2);
    p.setValue(0);
    v.current.vis.setValue(1);
    const anim = Animated.timing(p, { toValue: 1, duration: Math.max(LATE_MIN_MS, endAt - Date.now()), easing: (x) => x, useNativeDriver: true });
    run.current.anim = anim;
    anim.start(() => { if (run.current.anim === anim) run.current.anim = null; });
  }, [stop]);

  useImperativeHandle(ref, () => ({ play, stop }), [play, stop]);

  // Connect the native animation graph while the app is idle, not on the first day complete
  // (the first native start of every interpolation node cost ~100 ms of JS on the release
  // emulator build, right on the resolution beat). A no-op run to the value it is already at.
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      const value = v.current.p;
      Animated.timing(value, { toValue: value.__getValue(), duration: duration.press, useNativeDriver: true }).start();
    });
    return () => task.cancel();
  }, []);

  useEffect(() => {
    const off = subscribeBeats(({ type, item }) => {
      if (type === 'fire' && item.beat === 'resolution') play(item.tapAt + MOMENT_MS);
    });
    return () => { off(); stop(); };
  }, [play, stop]);

  return (
    <View ref={layerRef} collapsable={false} style={layerStyle.layer} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      {styles.map((s, i) => (
        <Animated.View key={i} style={[layerStyle.particle, { backgroundColor: colors[particles[i].color % colors.length] }, s]} />
      ))}
    </View>
  );
}

export default forwardRef(RingBurst);

const layerStyle = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  particle: { position: 'absolute', left: 0, top: 0 },
});
