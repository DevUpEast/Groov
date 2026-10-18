import React from 'react';
import { StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import feedback, { EVENTS } from '../../services/feedback';
import { radius } from '../../theme/tokens';
import PressableScale, { touchMinimum, hitSlopFor, useUiTheme } from './PressableScale';

// Icon colour per tone (§2.2).
function toneColor(theme, tone) {
  switch (tone) {
    case 'primary': return theme.text;
    case 'link': return theme.link;
    case 'danger': return theme.dangerText;
    case 'secondary':
    default: return theme.textSecondary;
  }
}

/**
 * A round icon-only button (plan §3): sheet close, counter ±, the Habits row bell / edit /
 * archive.
 * - `icon`: Ionicons name; `iconSize` (default 22); `color` overrides the `tone` colour
 *   (`secondary` default, `primary`, `link`, `danger`).
 * - `accessibilityLabel` is **required** (a jest source check fails on an `<IconButton`
 *   without one); `accessibilityRole` is `button`.
 * - `size` is the visual diameter (default 40). `hitSlop` grows it to the touch minimum
 *   (48 dp Android, 44 pt iOS): `max(0, (touchMin - size) / 2)` per side.
 * - Android: a borderless ripple the size of the touch target.
 * - `disabled`: it stays focusable, announces disabled, and a tap calls `onDisabledPress` or
 *   plays `refused`. The disabled variant is always the lighter one (C-02a): any fill the caller
 *   set is dropped, an outline turns the quiet `disabledContainer` hairline, and the icon is
 *   `textTertiary` (one tone below the `textSecondary` default; AA on surface and bg, pairs
 *   in tokens.js). With no container, `onDisabled` (the label on `disabledContainer`) is not
 *   the pair; in dark the two are the same colour. A disabled control never looks heavier than
 *   its enabled neighbour (the old filled grey − beside an outlined +).
 * - `onLongPress` / `delayLongPress`; `onDisabledLongPress` runs a long press while disabled.
 * - `children` replaces the icon (e.g. a text glyph).
 * Silent by default (§2.10); callers that change data play their own event.
 */
export default function IconButton({
  icon,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  onPress,
  onLongPress,
  delayLongPress,
  onDisabledLongPress,
  size = 40,
  iconSize = 22,
  tone = 'secondary',
  color,
  disabled = false,
  onDisabledPress,
  style,
  theme: themeProp,
  testID,
  children,
}) {
  const theme = useUiTheme(themeProp);
  if (__DEV__ && !accessibilityLabel) console.warn(`[IconButton] "${icon}" needs an accessibilityLabel`);
  const handleDisabled = () => {
    if (onDisabledPress) onDisabledPress();
    else feedback.play(EVENTS.refused);
  };
  return (
    <PressableScale
      theme={theme}
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      onDisabledLongPress={onDisabledLongPress}
      disabled={disabled}
      onDisabledPress={handleDisabled}
      hitSlop={hitSlopFor(size)}
      ripple="borderless"
      rippleRadius={Math.max(size, touchMinimum()) / 2}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState}
      style={[styles.base, { width: size, height: size, borderRadius: radius.pill }, style, disabled && { backgroundColor: 'transparent', borderColor: theme.disabledContainer }]}
    >
      {children ?? <Ionicons name={icon} size={iconSize} color={disabled ? theme.textTertiary : (color || toneColor(theme, tone))} />}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
