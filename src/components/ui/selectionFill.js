import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { duration, easing, useMotion } from '../../theme/motion';

/**
 * The selected / unselected colours of a Chip or a segment (plan §3, §2.2): `selection` fill,
 * `onSelection` label and `selectionBorder` when selected; `restBg` (none by default),
 * `textSecondary` and `controlBorder` otherwise. Disabled wins over both: `disabledContainer`
 * with `onDisabled` (the pair Button uses, 6.15:1 light / 5.59:1 dark) and no visible border.
 */
export function selectionColors(theme, { selected, disabled }) {
  if (disabled) return { fill: theme.disabledContainer, border: theme.disabledContainer, label: theme.onDisabled };
  return selected
    ? { fill: theme.selection, border: theme.selectionBorder, label: theme.onSelection }
    : { fill: null, border: theme.controlBorder, label: theme.textSecondary };
}

/**
 * Animates a control between its rest and selected look over duration.selection (150 ms,
 * PRS-6). Two values: the fill is an opacity on its own layer (native driver), the border and
 * label colours are JS-driven interpolations (colours cannot run natively). Disabled snaps.
 * Returns { fillOpacity, border, label, colors }.
 */
export function useSelectionFill(theme, { selected, disabled = false }) {
  const motion = useMotion();
  const fill = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const tint = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const first = useRef(true);

  useEffect(() => {
    const to = selected ? 1 : 0;
    if (first.current) { first.current = false; fill.setValue(to); tint.setValue(to); return undefined; }
    const ms = motion.duration.selection ?? duration.selection;
    const a = motion.timing(fill, { toValue: to, duration: ms, easing: easing.standard });
    const b = motion.timing(tint, { toValue: to, duration: ms, easing: easing.standard, useNativeDriver: false });
    a.start();
    b.start();
    return () => { a.stop?.(); b.stop?.(); };
  }, [selected, fill, tint, motion]);

  if (disabled) {
    const c = selectionColors(theme, { disabled: true });
    return { fillOpacity: 1, fillColor: c.fill, border: c.border, label: c.label };
  }
  const off = selectionColors(theme, { selected: false });
  const on = selectionColors(theme, { selected: true });
  return {
    fillOpacity: fill,
    fillColor: on.fill,
    border: tint.interpolate({ inputRange: [0, 1], outputRange: [off.border, on.border] }),
    label: tint.interpolate({ inputRange: [0, 1], outputRange: [off.label, on.label] }),
  };
}

/**
 * The two layers behind a Chip or segment's content: the fill (fades in) and the border
 * (cross-fades its colour). Both copy the control's radius and ignore touches.
 */
export function SelectionLayers({ state, radius: r, borderWidth = 1.5 }) {
  return (
    <>
      <Animated.View
        pointerEvents="none"
        testID="selection-fill"
        style={[StyleSheet.absoluteFill, { borderRadius: r, backgroundColor: state.fillColor, opacity: state.fillOpacity }]}
      />
      <Animated.View
        pointerEvents="none"
        testID="selection-border"
        style={[StyleSheet.absoluteFill, { borderRadius: r, borderWidth, borderColor: state.border }]}
      />
    </>
  );
}
