// A number (or a short count like "3/4") that rolls when it changes (plan §4.1, C-06b): the
// old value slides 8 px out and fades while the new one slides in from the other side, up for
// a rise and down for a fall. Opacity and translate only, on the native driver.
// - `roll`: animate this change (the caller passes the beat that changed it). Without it the
//   new value is shown at once (a sync pull, the choreography flag off).
// - `duration`: the roll's length (default duration.state). Reduced motion: a 150 ms
//   cross-fade in place (§4.3 "count in place").
// - `Component` (default Text) and the rest of the props render each copy.
import React, { useLayoutEffect, useReducer, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { amount, duration as durations, easing, timing } from '../../theme/motion';
import { useReducedMotion } from '../../utils/a11y';

export const ROLL_PX = amount.rollPx;

const lead = (v) => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};

export default function RollingNumber({ value, roll = false, duration = durations.state, Component = Text, style, containerStyle, ...textProps }) {
  const reduced = useReducedMotion();
  const [, force] = useReducer((x) => x + 1, 0);
  const shown = useRef(value); // the value last committed
  const rolling = useRef(null); // { value, dir } while a roll runs
  const t = useRef(new Animated.Value(1)).current;
  const anim = useRef(null);

  // Decided in render, so the commit that brings the new value already rolls (round 2: a
  // layout-effect state change painted the new value, then the old one, then the roll).
  let prev = rolling.current;
  if (!Object.is(shown.current, value)) {
    if (roll) {
      prev = { value: shown.current, dir: lead(value) >= lead(shown.current) ? 1 : -1 };
      t.setValue(0);
    } else prev = null;
  }

  useLayoutEffect(() => {
    if (Object.is(shown.current, value)) return;
    const old = shown.current;
    shown.current = value;
    anim.current?.stop();
    if (!roll) { rolling.current = null; t.setValue(1); return; }
    rolling.current = { value: old, dir: lead(value) >= lead(old) ? 1 : -1 };
    const a = timing(t, { toValue: 1, duration, easing: easing.standard }, reduced);
    anim.current = a;
    a.start(({ finished }) => { if (finished && anim.current === a) { anim.current = null; rolling.current = null; force(); } });
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!prev) {
    return (
      <View style={containerStyle}>
        <Component style={style} {...textProps}>{value}</Component>
      </View>
    );
  }
  const px = reduced ? 0 : ROLL_PX * prev.dir;
  const inStyle = { opacity: t, transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [px, 0] }) }] };
  const outStyle = {
    // Gone by half the roll, so the two values never read as one stacked numeral (round 1 S3).
    opacity: t.interpolate({ inputRange: [0, amount.rollOutBy], outputRange: [1, 0], extrapolate: 'clamp' }),
    transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -px] }) }],
  };
  return (
    // Clipped to the numeral box while it rolls: the slide never shows outside the digits.
    <View style={[containerStyle, styles.clip]}>
      <Animated.View style={inStyle}>
        <Component style={style} {...textProps}>{value}</Component>
      </Animated.View>
      {/* The old value is decoration: the new one carries the text for screen readers. */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, outStyle]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
        <Component style={style} {...textProps}>{prev.value}</Component>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  clip: { overflow: 'hidden' },
});
