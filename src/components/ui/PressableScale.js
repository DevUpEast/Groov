import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet } from 'react-native';
import { useThemeContext } from '../../theme/ThemeContext';
import { themes } from '../../theme/colors';
import { size } from '../../theme/tokens';
import { duration, easing, spring, useMotion } from '../../theme/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// The minimum touch target for this platform (§2.6): 48 dp on Android, 44 pt on iOS and web
// (the web build is the iOS mockup).
export function touchMinimum() {
  return Platform.OS === 'android' ? size.touchMin.android : size.touchMin.ios;
}

/**
 * hitSlop that grows a `width` x `height` visual to the platform touch minimum (F-06):
 * `max(0, (touchMin - visual) / 2)` per axis. `height` defaults to `width` (a square control).
 */
export function hitSlopFor(width, height = width, touchMin = touchMinimum()) {
  const x = Math.max(0, Math.ceil((touchMin - width) / 2));
  const y = Math.max(0, Math.ceil((touchMin - height) / 2));
  return { top: y, bottom: y, left: x, right: x };
}

// The theme for a ui primitive: an explicit prop, else the provider's (the small memoized
// ThemeContext, never the whole AppContext), else light (outside the provider, e.g. the crash
// screen or a component test).
export function useUiTheme(themeProp) {
  const ctx = useThemeContext();
  return themeProp || ctx?.theme || themes.light;
}

export const PRESS_SCALE = 0.97;

/**
 * The press model for every pressable (plan §3, PRS-1). A `Pressable` that:
 * - press-in: scales to 0.97 over duration.press (easing.standard) and, on iOS and web, lays a
 *   `pressedOverlay` over the content at once (visible the next frame);
 * - release: springs back on spring.snappy and fades the overlay out over duration.press;
 * - Android: `android_ripple` with `theme.ripple` and `foreground: true`, so the ripple stays
 *   above tinted fills (`ripple="borderless"` for icon buttons, `ripple={false}` for none);
 * - reduced motion: no scale; the overlay (plus the ripple on Android) is the whole feedback;
 * - `disabled`: no press visuals and `onPress`/`onLongPress` never run, but it stays focusable
 *   and announces `accessibilityState.disabled`; a tap calls `onDisabledPress` (Button turns
 *   that into the `refused` feedback). `onDisabledLongPress` lets a disabled control inside a
 *   larger surface still open that surface's options (HabitCard's − at 0).
 * - `pressedStyle` is merged into `style` while the finger is down (e.g. Button's
 *   `actionPressed` fill).
 *
 * It plays no haptic itself: `press` is silent in the §2.10 map (ripple only on Android).
 */
export default function PressableScale({
  onPress,
  onLongPress,
  delayLongPress,
  onPressIn,
  onPressOut,
  hitSlop,
  style,
  pressedStyle,
  disabled = false,
  onDisabledPress,
  onDisabledLongPress,
  ripple = 'bounded',
  rippleRadius,
  scaleTo = PRESS_SCALE,
  theme: themeProp,
  accessibilityRole = 'button',
  accessibilityState,
  children,
  ...rest
}) {
  const theme = useUiTheme(themeProp);
  const motion = useMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const overlay = useRef(new Animated.Value(0)).current;
  const [pressed, setPressed] = useState(false);

  // Android shows the ripple; the overlay covers iOS, web, and reduced motion everywhere (and
  // an Android control that opts out of the ripple).
  const showRipple = Platform.OS === 'android' && ripple !== false && !disabled;
  const showOverlay = !disabled && (Platform.OS !== 'android' || motion.reduced || ripple === false);

  useEffect(() => () => { scale.stopAnimation(); overlay.stopAnimation(); }, [scale, overlay]);

  const handlePressIn = useCallback((e) => {
    if (!disabled) {
      if (pressedStyle) setPressed(true);
      overlay.stopAnimation();
      overlay.setValue(1);
      if (!motion.reduced) {
        scale.stopAnimation();
        motion.timing(scale, { toValue: scaleTo, duration: duration.press, easing: easing.standard }).start();
      }
    }
    onPressIn?.(e);
  }, [disabled, motion, overlay, scale, scaleTo, onPressIn, pressedStyle]);

  const handlePressOut = useCallback((e) => {
    if (pressedStyle) setPressed(false);
    motion.timing(overlay, { toValue: 0, duration: duration.press, easing: easing.standard }).start();
    if (!motion.reduced) motion.springTo(scale, spring.snappy, { toValue: 1 }).start();
    else scale.setValue(1);
    onPressOut?.(e);
  }, [motion, overlay, scale, onPressOut, pressedStyle]);

  const handlePress = useCallback((e) => {
    if (disabled) { onDisabledPress?.(e); return; }
    onPress?.(e);
  }, [disabled, onDisabledPress, onPress]);

  const flat = StyleSheet.flatten(style) || {};
  const radiusStyle = {
    borderRadius: flat.borderRadius,
    borderTopLeftRadius: flat.borderTopLeftRadius,
    borderTopRightRadius: flat.borderTopRightRadius,
    borderBottomLeftRadius: flat.borderBottomLeftRadius,
    borderBottomRightRadius: flat.borderBottomRightRadius,
  };

  const hasRadius = Object.values(radiusStyle).some(v => v > 0);
  const clipRipple = showRipple && ripple !== 'borderless' && hasRadius && flat.overflow === undefined;

  const androidRipple = showRipple
    ? {
        color: theme.ripple,
        // A borderless ripple is drawn by the parent; foreground only applies to a bounded one.
        borderless: ripple === 'borderless',
        foreground: ripple !== 'borderless',
        ...(rippleRadius ? { radius: rippleRadius } : null),
      }
    : undefined;

  return (
    <AnimatedPressable
      {...rest}
      onPress={handlePress}
      onLongPress={disabled ? onDisabledLongPress : onLongPress}
      delayLongPress={delayLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      hitSlop={hitSlop}
      android_ripple={androidRipple}
      accessibilityRole={accessibilityRole}
      accessibilityState={disabled ? { ...accessibilityState, disabled: true } : accessibilityState}
      style={[
        style,
        // A bounded ripple is clipped to the view's outline only when it clips its children.
        clipRipple && styles.clip,
        pressed && pressedStyle,
        motion.reduced ? null : { transform: [{ scale }] },
      ]}
    >
      {children}
      {showOverlay && (
        <Animated.View
          pointerEvents="none"
          testID="press-overlay"
          style={[StyleSheet.absoluteFill, radiusStyle, { backgroundColor: theme.pressedOverlay, opacity: overlay }]}
        />
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({ clip: { overflow: 'hidden' } });
