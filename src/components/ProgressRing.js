import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import AppText from './ui/AppText';
import { palette } from '../theme/tokens';
import { type } from '../theme/typography';
import useTween from '../hooks/useTween';

const DEFAULTS = palette.light;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * A progress ring with a count in the middle.
 * - `trackDashed`: draw the track as a thin dashed line (the empty and rest-day states on the
 *   Today strip, C-04) instead of a full-width solid track.
 * - `labelColor`: the count's colour (defaults to the arc colour).
 * - `center`: a node drawn in place of the count (a check, a moon); the sublabel still shows.
 * - `renderLabel(props)`: draws the count instead of the plain text (the Today ring rolls it).
 *
 * C-06b motion (plan §4.1):
 * - `tween`: useTween options for the arc (`{ beat: { beat: 'progress' }, onlyOnBeat: true,
 *   log: 'ring' }` on Today). The arc is an Animated Circle whose strokeDashoffset follows the
 *   tween (JS driver: react-native-svg props cannot use the native one; one element, 300 ms).
 *   Without it the arc is static.
 * - `completeColor` + `completeOpacity` (0..1, a number or an Animated value on the native
 *   driver): a second, full arc in that colour stacked on the first; the two cross-fade by
 *   opacity, never by a colour interpolation, which would pass through olive between green
 *   and gold (Critic B fix 5).
 */
export default function ProgressRing({
  progress, size = 120, strokeWidth = 10, color = DEFAULTS.action, bg = DEFAULTS.track,
  label, labelColor, sublabel, sublabelColor, trackDashed = false, center = null, renderLabel,
  tween = null, completeColor = null, completeOpacity = 0,
}) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.min(Math.max(progress || 0, 0), 1);
  const shown = useTween(clamped, tween || { onlyOnBeat: true });
  const arc = useMemo(() => ({
    offset: shown.interpolate({ inputRange: [0, 1], outputRange: [circ, 0], extrapolate: 'clamp' }),
    // A round-capped arc of length 0 is a dot: hidden at 0.
    opacity: shown.interpolate({ inputRange: [0, 0.001], outputRange: [0, 1], extrapolate: 'clamp' }),
  }), [shown, circ]);
  const gold = completeOpacity;
  const greenLayer = useMemo(() => ({
    opacity: typeof gold === 'number' ? 1 - gold : gold.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
  }), [gold]);
  const arcProps = {
    cx: size / 2, cy: size / 2, r, strokeWidth, fill: 'none', strokeLinecap: 'round',
    rotation: '-90', origin: `${size / 2}, ${size / 2}`, strokeDasharray: circ,
  };

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={bg} strokeWidth={trackDashed ? 2 : strokeWidth} fill="none"
          strokeDasharray={trackDashed ? '5 5' : undefined}
        />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, completeColor ? greenLayer : null]} pointerEvents="none">
        <Svg width={size} height={size}>
          <AnimatedCircle {...arcProps} stroke={color} strokeDashoffset={arc.offset} strokeOpacity={arc.opacity} />
        </Svg>
      </Animated.View>
      {completeColor ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: gold }]} pointerEvents="none">
          <Svg width={size} height={size}>
            <Circle {...arcProps} stroke={completeColor} strokeDashoffset={0} />
          </Svg>
        </Animated.View>
      ) : null}
      <View style={styles.labelContainer}>
        {center}
        {/* The count is a display numeral (Space Grotesk, tabular, §2.7 displayRing). One line,
            never wider than the ring's inside: the font scale is capped at 1.2 and a long
            count ("12/15" at large text) shrinks to fit (native; on web the count is 1.0x and
            fits). */}
        {!center && label != null && (renderLabel ? renderLabel(labelProps(label, labelColor || color, size, strokeWidth)) : (
          <AppText {...labelProps(label, labelColor || color, size, strokeWidth)}>{label}</AppText>
        ))}
        {!!sublabel && (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.2}
            style={[styles.sublabel, sublabelColor && { color: sublabelColor }, { maxWidth: size - strokeWidth * 2 - 4 }]}
          >{sublabel}</Text>
        )}
      </View>
    </View>
  );
}

// The count's text props, shared by the plain label and a caller's renderLabel.
function labelProps(label, color, size, strokeWidth) {
  return {
    variant: 'displayRing',
    numberOfLines: 1,
    adjustsFontSizeToFit: true,
    minimumFontScale: 0.6,
    maxFontSizeMultiplier: 1.2,
    style: { color, maxWidth: size - strokeWidth * 2 - 8, textAlign: 'center' },
  };
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelContainer: {
    position: 'absolute',
    alignItems: 'center',
  },
  sublabel: {
    ...type.caption,
    color: DEFAULTS.textSecondary,
    textAlign: 'center',
  },
});
