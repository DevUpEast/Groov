// A number (or a short count like "3/4") that rolls when it changes (plan §4.1, C-06b): the
// old value slides 8 px out and fades while the new one slides in from the other side, up for
// a rise and down for a fall. Opacity and translate only, on the native driver.
// - `roll`: animate this change (the caller passes the beat that changed it). Without it the
//   new value is shown at once (a sync pull, the choreography flag off).
// - `duration`: the roll's length (default duration.state). Reduced motion: a 150 ms
//   cross-fade in place (§4.3 "count in place").
// - `Component` (default Text) and the rest of the props render each copy.
import React, { useLayoutEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { duration as durations, easing, timing } from '../../theme/motion';
import { useReducedMotion } from '../../utils/a11y';

export const ROLL_PX = 8;

const lead = (v) => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};

export default function RollingNumber({ value, roll = false, duration = durations.state, Component = Text, style, containerStyle, ...textProps }) {
  const reduced = useReducedMotion();
  const [prev, setPrev] = useState(null); // { value, dir } while a roll runs
  const shown = useRef(value);
  const t = useRef(new Animated.Value(1)).current;
  const anim = useRef(null);

  useLayoutEffect(() => {
    if (Object.is(shown.current, value)) return;
    const old = shown.current;
    shown.current = value;
    anim.current?.stop();
    if (!roll) { t.setValue(1); setPrev(null); return; }
    setPrev({ value: old, dir: lead(value) >= lead(old) ? 1 : -1 });
    t.setValue(0);
    const a = timing(t, { toValue: 1, duration, easing: easing.standard }, reduced);
    anim.current = a;
    a.start(({ finished }) => { if (finished && anim.current === a) { anim.current = null; setPrev(null); } });
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
    opacity: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -px] }) }],
  };
  return (
    <View style={containerStyle}>
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
});
