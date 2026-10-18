import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import feedback, { EVENTS } from '../../services/feedback';
import { radius, space } from '../../theme/tokens';
import { type } from '../../theme/typography';
import { useLocale } from '../../i18n';
import PressableScale, { hitSlopFor, touchMinimum, useUiTheme } from './PressableScale';
import { SelectionLayers, useSelectionFill } from './selectionFill';

export const CHIP_HEIGHT = 40;

/**
 * A selectable chip (plan §3, PRS-6): habit type, time of day, schedule, weekdays, ranges.
 * - `label` (sentence case), optional `icon` (Ionicons name) or `emoji` before it.
 * - `selected`: `selection` fill, `onSelection` label, `selectionBorder`; the fill fades in
 *   over duration.selection (150 ms). Unselected: no fill, `controlBorder`, `textSecondary`.
 * - `multi`: one of several that can be on at once; a selected multi chip shows a ✓ and is
 *   announced as a checkbox (`checked`). A single-select chip is a button with `selected`.
 *   `showCheck={false}` drops the ✓ where the chip is too small for it (weekday initials).
 * - `onPress` plays the `selection` haptic (§2.10) and then calls `onPress`.
 * - `disabled`: `disabledContainer` / `onDisabled`, still focusable; a tap calls
 *   `onDisabledPress` or plays `refused`.
 * - Min height 40 with hitSlop to the platform touch minimum (48 dp Android, 44 pt iOS).
 * - `size="sm"` (32, for dense rows such as weekdays) keeps the same slop rule.
 */
export default function Chip({
  label,
  selected = false,
  multi = false,
  showCheck = multi,
  icon,
  emoji,
  onPress,
  disabled = false,
  onDisabledPress,
  accessibilityLabel,
  accessibilityHint,
  size = 'md',
  style,
  theme: themeProp,
  testID,
}) {
  useLocale();
  const theme = useUiTheme(themeProp);
  const state = useSelectionFill(theme, { selected, disabled });
  const minHeight = size === 'sm' ? 32 : CHIP_HEIGHT;
  const slop = minHeight < touchMinimum() ? hitSlopFor(0, minHeight) : undefined;
  const iconColor = disabled ? theme.onDisabled : selected ? theme.onSelection : theme.textSecondary;

  const handlePress = () => {
    feedback.play(EVENTS.selection);
    onPress?.();
  };
  const handleDisabled = () => {
    if (onDisabledPress) onDisabledPress();
    else feedback.play(EVENTS.refused);
  };

  return (
    <PressableScale
      theme={theme}
      testID={testID}
      onPress={handlePress}
      disabled={disabled}
      onDisabledPress={handleDisabled}
      hitSlop={slop ? { top: slop.top, bottom: slop.bottom } : undefined}
      accessibilityRole={multi ? 'checkbox' : 'button'}
      accessibilityLabel={accessibilityLabel || label}
      accessibilityHint={accessibilityHint}
      accessibilityState={multi ? { checked: selected, selected } : { selected }}
      aria-selected={selected}
      style={[styles.chip, { minHeight, paddingHorizontal: size === 'sm' ? space.xs : space.sm }, style]}
    >
      <SelectionLayers state={state} radius={radius.pill} />
      <View style={styles.content}>
        {showCheck && selected ? <Ionicons name="checkmark" size={16} color={iconColor} testID="chip-check" /> : null}
        {icon ? <Ionicons name={icon} size={16} color={iconColor} /> : null}
        {emoji ? <Animated.Text style={[type.callout, styles.emoji]}>{emoji}</Animated.Text> : null}
        {label != null ? (
          <Animated.Text numberOfLines={1} style={[size === 'sm' ? type.footnoteStrong : type.callout, styles.label, { color: state.label }]}>
            {label}
          </Animated.Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  content: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  emoji: { fontWeight: '400' },
  label: { flexShrink: 1, textAlign: 'center' },
});
