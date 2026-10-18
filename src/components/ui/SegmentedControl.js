import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import feedback, { EVENTS } from '../../services/feedback';
import { radius, space } from '../../theme/tokens';
import { type } from '../../theme/typography';
import { useLocale } from '../../i18n';
import PressableScale, { hitSlopFor, touchMinimum, useUiTheme } from './PressableScale';
import { SelectionLayers, useSelectionFill } from './selectionFill';

export const SEGMENT_HEIGHT = 40;

function Segment({ option, selected, role, onSelect, onDisabledPress, theme, fill, compact, testID }) {
  const disabled = !!option.disabled;
  const state = useSelectionFill(theme, { selected, disabled });
  const slop = SEGMENT_HEIGHT < touchMinimum() ? hitSlopFor(0, SEGMENT_HEIGHT) : undefined;
  const iconColor = disabled ? theme.onDisabled : selected ? theme.onSelection : theme.textSecondary;
  const a11yState = role === 'tab' ? { selected } : { checked: selected, selected };
  return (
    <PressableScale
      theme={theme}
      testID={testID}
      onPress={() => onSelect(option.value)}
      disabled={disabled}
      onDisabledPress={() => onDisabledPress(option.value)}
      hitSlop={slop ? { top: slop.top, bottom: slop.bottom, left: space.xxs, right: space.xxs } : undefined}
      accessibilityRole={role}
      accessibilityLabel={option.accessibilityLabel || option.label}
      accessibilityHint={option.accessibilityHint}
      accessibilityState={a11yState}
      aria-selected={selected}
      style={[styles.segment, compact && styles.compact, fill && styles.fill]}
    >
      <SelectionLayers state={state} radius={radius.pill} />
      <View style={styles.content}>
        {option.icon ? <Ionicons name={option.icon} size={16} color={iconColor} /> : null}
        {option.label != null ? (
          <Animated.Text numberOfLines={1} style={[type.footnoteStrong, styles.label, { color: state.label }]}>{option.label}</Animated.Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

/**
 * A single choice from 2-4 options (plan §3): the Progress periods, the theme, the share-card
 * kinds.
 * - `options`: [{ value, label, icon?, accessibilityLabel?, accessibilityHint?, disabled? }].
 * - `value`, `onChange(value)`: a tap on another option plays `selection` and calls onChange;
 *   a tap on the current one does nothing.
 * - `role`: `radio` (default; the group is a `radiogroup`, each option `checked`) or `tab`
 *   (a `tablist` of `tab`s with `selected`, for a control that swaps the content below it).
 * - A disabled option (`disabledContainer` / `onDisabled`, never an opacity) stays focusable;
 *   a tap calls `onDisabledPress(value)` or plays `refused`.
 * - Each option is 40 tall with hitSlop to the touch minimum (48 dp Android, 44 pt iOS). The
 *   options wrap to a second row when the labels do not fit (LAY-6). `fill` stretches them to
 *   equal widths across the row. `compact` trims the side padding for tight rows.
 * - The selected fill fades over duration.selection (150 ms, PRS-6).
 */
export default function SegmentedControl({
  options,
  value,
  onChange,
  role = 'radio',
  onDisabledPress,
  accessibilityLabel,
  fill = false,
  compact = false,
  style,
  theme: themeProp,
  testID,
}) {
  useLocale();
  const theme = useUiTheme(themeProp);
  const select = (v) => {
    if (v === value) return;
    feedback.play(EVENTS.selection);
    onChange?.(v);
  };
  const disabledTap = (v) => {
    if (onDisabledPress) onDisabledPress(v);
    else feedback.play(EVENTS.refused);
  };
  return (
    <View
      style={[styles.row, style]}
      accessibilityRole={role === 'tab' ? 'tablist' : 'radiogroup'}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {options.map(o => (
        <Segment
          key={String(o.value)}
          option={o}
          selected={o.value === value}
          role={role}
          onSelect={select}
          onDisabledPress={disabledTap}
          theme={theme}
          fill={fill}
          compact={compact}
          testID={testID ? `${testID}-${o.value}` : undefined}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  segment: {
    minHeight: SEGMENT_HEIGHT,
    minWidth: SEGMENT_HEIGHT,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  compact: { paddingHorizontal: space.xs },
  fill: { flexGrow: 1, flexBasis: 0 },
  content: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  label: { flexShrink: 1, textAlign: 'center' },
});
