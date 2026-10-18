import React from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import feedback, { EVENTS } from '../../services/feedback';
import { radius, space } from '../../theme/tokens';
import AppText from './AppText';
import PressableScale, { touchMinimum, hitSlopFor, useUiTheme } from './PressableScale';

const HEIGHT = { md: 48, sm: 40 };

// Fill, border and label colours per variant (plan §3, §2.2). `filled` destructive is the
// confirm button inside a destructive Dialog; the plain destructive variant is text only.
function colorsFor(theme, variant, filled, disabled) {
  if (disabled) {
    const container = variant === 'tertiary' || (variant === 'destructive' && !filled) ? 'transparent' : theme.disabledContainer;
    return { bg: container, pressedBg: container, border: null, label: theme.onDisabled };
  }
  switch (variant) {
    case 'secondary':
      return { bg: 'transparent', pressedBg: 'transparent', border: theme.controlBorder, label: theme.link };
    case 'tertiary':
      return { bg: 'transparent', pressedBg: 'transparent', border: null, label: theme.link };
    case 'destructive':
      return filled
        ? { bg: theme.dangerFill, pressedBg: theme.dangerFill, border: null, label: theme.onDanger }
        : { bg: 'transparent', pressedBg: 'transparent', border: null, label: theme.dangerText };
    case 'primary':
    default:
      return { bg: theme.action, pressedBg: theme.actionPressed, border: null, label: theme.onAction };
  }
}

/**
 * The shared button (plan §3, BTN-1).
 * - `variant`: `primary` (action fill, onAction label; actionPressed while held), `secondary`
 *   (1.5 px controlBorder outline, link label), `tertiary` (link text), `destructive`
 *   (dangerText text; `filled` for the dangerFill confirm in a destructive Dialog).
 * - `size`: `md` (min height 48) or `sm` (min height 40, hitSlop up to the touch minimum).
 * - `block`: stretches to the container with the 16 px card radius; otherwise a pill.
 * - `label` (sentence case, `callout`), optional `icon` (Ionicons name). An icon-only button
 *   must pass `accessibilityLabel`.
 * - `loading`: a spinner over the hidden label (width preserved); presses are ignored.
 * - `disabled`: disabledContainer / onDisabled, still focusable. A tap calls `onDisabledPress`,
 *   or by default plays the `refused` feedback (§2.10 "tap on a disabled control").
 * Plain buttons are otherwise silent (§2.10: `press` has no haptic; Android shows the ripple).
 */
export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  filled = false,
  block = false,
  icon,
  loading = false,
  disabled = false,
  onDisabledPress,
  accessibilityLabel,
  accessibilityHint,
  style,
  labelStyle,
  theme: themeProp,
  testID,
}) {
  const theme = useUiTheme(themeProp);
  if (__DEV__ && !label && !accessibilityLabel) console.warn('[Button] an icon-only Button needs an accessibilityLabel');
  const c = colorsFor(theme, variant, filled, disabled);
  const minHeight = HEIGHT[size] || HEIGHT.md;
  const slop = minHeight < touchMinimum() ? hitSlopFor(0, minHeight) : undefined;
  const handleDisabled = () => {
    if (onDisabledPress) onDisabledPress();
    else feedback.play(EVENTS.refused);
  };

  return (
    <PressableScale
      theme={theme}
      testID={testID}
      onPress={loading ? undefined : onPress}
      disabled={disabled}
      onDisabledPress={handleDisabled}
      hitSlop={slop ? { top: slop.top, bottom: slop.bottom } : undefined}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityHint={accessibilityHint}
      accessibilityState={loading ? { busy: true } : undefined}
      style={[
        styles.base,
        {
          minHeight,
          paddingHorizontal: size === 'sm' ? space.sm : space.md,
          borderRadius: block ? radius.card : radius.pill,
          backgroundColor: c.bg,
        },
        c.border && { borderWidth: 1.5, borderColor: c.border },
        block ? styles.block : styles.inline,
        style,
      ]}
      pressedStyle={c.pressedBg !== c.bg ? { backgroundColor: c.pressedBg } : undefined}
    >
      <View style={[styles.content, loading && styles.hidden]}>
        {icon ? <Ionicons name={icon} size={label ? 20 : 28} color={c.label} /> : null}
        {label ? (
          <AppText variant="callout" numberOfLines={1} style={[styles.label, { color: c.label }, labelStyle]}>{label}</AppText>
        ) : null}
      </View>
      {loading ? <ActivityIndicator style={StyleSheet.absoluteFill} size="small" color={c.label} /> : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    // Android clips the foreground ripple to the radius; iOS keeps overflow visible so a
    // caller's shadow still shows (the press overlay copies the radius instead).
    overflow: Platform.OS === 'android' ? 'hidden' : 'visible',
  },
  block: { alignSelf: 'stretch' },
  inline: { alignSelf: 'center' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  hidden: { opacity: 0 },
  label: { textAlign: 'center' },
});
