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
 * - `completeColor` + `completeProgress` (0..1, a number or a JS-driven Animated value): a
 *   second arc in that colour that sweeps clockwise from 12 o'clock over the first (its own
 *   strokeDashoffset), so every pixel flips from green to gold at the sweep edge. Never a
 *   colour tween or an opacity cross-fade: both composite to olive between green and gold
 *   (Critic B fix 5, C-06b round 1 M1). The first arc is hidden once the sweep is complete.
 */
export default function ProgressRing({
  progress, size = 120, strokeWidth = 10, color = DEFAULTS.action, bg = DEFAULTS.track,
  label, labelColor, sublabel, sublabelColor, trackDashed = false, center = null, renderLabel,
  tween = null, completeColor = null, completeProgress = 0,
}) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.min(Math.max(progress || 0, 0), 1);
  const shown = useTween(clamped, tween || { onlyOnBeat: true });
  const gold = completeColor ? completeProgress : 0;
  // The two arcs never overlap (round 2 sampling: an arc drawn over the other blends their
  // antialiased edges into an olive fringe along the whole stroke). The gold arc runs
  // clockwise from 12 o'clock to its sweep edge. While it sweeps, the green that is left is
  // drawn counter-clockwise from 12 o'clock (a mirrored layer) for `shown - gold`, which is
  // exactly the part the sweep has not reached (the day is complete, so `shown` is 1); the
  // plain clockwise green arc only shows while there is no gold. Animated SVG transforms do
  // not update on react-native-svg, so the mirror is a static View flip.
  const arc = useMemo(() => {
    const len = (v) => ({
      offset: v.interpolate({ inputRange: [0, 1], outputRange: [circ, 0], extrapolate: 'clamp' }),
      // A round-capped arc of length 0 is a dot: hidden at 0.
      opacity: v.interpolate({ inputRange: [0, 0.001], outputRange: [0, 1], extrapolate: 'clamp' }),
    });
    const g = typeof gold === 'number' ? new Animated.Value(Math.min(Math.max(gold, 0), 1)) : gold;
    const goldOn = g.interpolate({ inputRange: [0, 0.001], outputRange: [0, 1], extrapolate: 'clamp' });
    const plain = len(shown);
    const left = Animated.subtract(shown, g);
    const rest = len(left);
    // The green that is left goes as soon as it is no longer than the stroke is wide: its round
    // caps would otherwise sit as a green dot at 12 o'clock for the sweep's slow tail (design
    // r2 N1). A cut, not a fade, so it never blends.
    const capFrac = strokeWidth / circ;
    rest.opacity = left.interpolate({ inputRange: [capFrac, capFrac + 0.0001], outputRange: [0, 1], extrapolate: 'clamp' });
    return {
      green: { offset: plain.offset, opacity: Animated.multiply(plain.opacity, Animated.subtract(1, goldOn)) },
      rest: { offset: rest.offset, opacity: Animated.multiply(rest.opacity, goldOn) },
      gold: len(g),
    };
  }, [shown, gold, circ, strokeWidth]);
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
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={size} height={size}>
          <AnimatedCircle {...arcProps} stroke={color} strokeDashoffset={arc.green.offset} strokeOpacity={arc.green.opacity} />
          {completeColor ? (
            <AnimatedCircle {...arcProps} stroke={completeColor} strokeDashoffset={arc.gold.offset} strokeOpacity={arc.gold.opacity} />
          ) : null}
        </Svg>
      </View>
      {completeColor ? (
        <View style={[StyleSheet.absoluteFill, styles.mirror]} pointerEvents="none">
          <Svg width={size} height={size}>
            <AnimatedCircle {...arcProps} stroke={color} strokeDashoffset={arc.rest.offset} strokeOpacity={arc.rest.opacity} />
          </Svg>
        </View>
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
  mirror: { transform: [{ scaleX: -1 }] },
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
