import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import AppText from './ui/AppText';
import { palette } from '../theme/tokens';
import { type } from '../theme/typography';

const DEFAULTS = palette.light;

export default function ProgressRing({ progress, size = 120, strokeWidth = 10, color = DEFAULTS.action, bg = DEFAULTS.track, label, sublabel, sublabelColor }) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(Math.max(progress, 0), 1));

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={bg} strokeWidth={strokeWidth} fill="none"
        />
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.labelContainer}>
        {/* The count is a display numeral (Space Grotesk, tabular, §2.7 displayRing). */}
        {label && <AppText variant="displayRing" style={{ color }}>{label}</AppText>}
        {sublabel && <Text style={[styles.sublabel, sublabelColor && { color: sublabelColor }]}>{sublabel}</Text>}
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
    marginTop: 2,
  },
});
