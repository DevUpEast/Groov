import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import AppText from './ui/AppText';
import { palette } from '../theme/tokens';
import { type } from '../theme/typography';

const DEFAULTS = palette.light;

/**
 * A progress ring with a count in the middle.
 * - `trackDashed`: draw the track as a thin dashed line (the empty and rest-day states on the
 *   Today strip, C-04) instead of a full-width solid track.
 * - `labelColor`: the count's colour (defaults to the arc colour).
 * - `center`: a node drawn in place of the count (a check, a moon); the sublabel still shows.
 */
export default function ProgressRing({
  progress, size = 120, strokeWidth = 10, color = DEFAULTS.action, bg = DEFAULTS.track,
  label, labelColor, sublabel, sublabelColor, trackDashed = false, center = null,
}) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.min(Math.max(progress || 0, 0), 1);
  const offset = circ * (1 - clamped);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={bg} strokeWidth={trackDashed ? 2 : strokeWidth} fill="none"
          strokeDasharray={trackDashed ? '5 5' : undefined}
        />
        {clamped > 0 && (
          <Circle
            cx={size / 2} cy={size / 2} r={r}
            stroke={color} strokeWidth={strokeWidth} fill="none"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            rotation="-90"
            origin={`${size / 2}, ${size / 2}`}
          />
        )}
      </Svg>
      <View style={styles.labelContainer}>
        {center}
        {/* The count is a display numeral (Space Grotesk, tabular, §2.7 displayRing). One line,
            never wider than the ring's inside: the font scale is capped at 1.2 and a long
            count ("12/15" at large text) shrinks to fit (native; on web the count is 1.0x and
            fits). */}
        {!center && label != null && (
          <AppText
            variant="displayRing"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            maxFontSizeMultiplier={1.2}
            style={{ color: labelColor || color, maxWidth: size - strokeWidth * 2 - 8, textAlign: 'center' }}
          >{label}</AppText>
        )}
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
