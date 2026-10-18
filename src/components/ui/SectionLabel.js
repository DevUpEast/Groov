import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from './AppText';
import { space } from '../../theme/tokens';
import { useUiTheme } from './PressableScale';

/**
 * A list section header (plan §3): an optional Ionicons glyph and a footnote-strong label in
 * textSecondary, sentence case (no emoji, no all-caps, in any locale; VIS-5, TYP-4). Created
 * by C-04 for the Today time-of-day groups; F-07 adopted it on every screen (Settings
 * sections, Past challenges, Archived, the form group labels, the AI coach card).
 * - `first` drops the top margin (a label right under a header that already spaces itself).
 * - `color` overrides textSecondary (the AI coach card's `link` label).
 * - `action`: an element at the trailing end (a small link or button); it is not part of the
 *   header's accessible name.
 * - `header={false}` for a label that names a control group in a form rather than a section.
 */
export default function SectionLabel({ icon, label, theme: themeProp, first = false, color, action, header = true, style }) {
  const theme = useUiTheme(themeProp);
  const tone = color || theme.textSecondary;
  const text = (
    <View style={styles.label} accessibilityRole={header ? 'header' : 'text'} accessible accessibilityLabel={label}>
      {icon ? <Ionicons name={icon} size={15} color={tone} /> : null}
      <AppText variant="footnoteStrong" style={[styles.text, { color: tone }]} numberOfLines={1}>{label}</AppText>
    </View>
  );
  return (
    <View style={[styles.row, first && styles.first, style]}>
      {text}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginTop: space.lg, marginBottom: space.xs },
  label: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, flexShrink: 1 },
  first: { marginTop: 0 },
  text: { flexShrink: 1 },
  action: { marginLeft: 'auto', paddingLeft: space.xs },
});
