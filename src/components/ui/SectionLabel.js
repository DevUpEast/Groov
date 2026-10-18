import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from './AppText';
import { space } from '../../theme/tokens';

/**
 * A list section header: an optional Ionicons glyph and a footnote-strong label in
 * textSecondary, sentence case (no emoji, no all-caps; VIS-5). Created by C-04 for the Today
 * time-of-day groups; F-07 adopts it on the other screens.
 * `first` drops the top margin (a label right under a header that already spaces itself).
 */
export default function SectionLabel({ icon, label, theme, first = false, style }) {
  return (
    <View style={[styles.row, first && styles.first, style]} accessibilityRole="header" accessible accessibilityLabel={label}>
      {icon ? <Ionicons name={icon} size={15} color={theme.textSecondary} /> : null}
      <AppText variant="footnoteStrong" style={[styles.text, { color: theme.textSecondary }]} numberOfLines={1}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, marginTop: space.lg, marginBottom: space.xs },
  first: { marginTop: 0 },
  text: { flexShrink: 1 },
});
