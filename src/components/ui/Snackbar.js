import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Platform, StyleSheet, View } from 'react-native';
import { t } from '../../i18n';
import { duration, easing, spring, snackbar as SNACK, useMotion } from '../../theme/motion';
import { themes } from '../../theme/colors';
import { radius, space } from '../../theme/tokens';
import { useThemeContext } from '../../theme/ThemeContext';
import { announce, isScreenReaderOn, subscribeScreenReader } from '../../utils/a11y';
import { useAnyOverlayOpen } from '../../utils/overlayStatus';
import AppText from './AppText';
import PressableScale, { hitSlopFor } from './PressableScale';

// The Snackbar (plan §3, C-10): one short message with an optional action (Undo), shown above
// the tab bar for bulk, skip, archive, "−1", counter-reset and destructive actions only. A
// single check never shows one (§4.1: it is announced, and Undo is a second tap).
//
// - One at a time: a new snackbar replaces the one on screen, which "bumps" (scale 1.03 -> 1);
//   the replaced one's window closes (its onHide runs with 'replaced').
// - It hides itself after `duration` (snackbar.standard, 8 s; snackbar.screenReader, 10 s, with
//   TalkBack / VoiceOver on). The timer pauses while the bar is touched (on the web also while
//   the mouse is over it) and while a sheet or a dialog is open (it sits under them), and
//   resumes with the time that was left.
// - The message is announced. The action is a real button that screen readers reach.
// - `endsOnBackground` items hide when the app goes to the background (Mark the rest: S-02).
// - onAction runs when the action is pressed; onHide(reason) runs when it goes any other way:
//   'timeout', 'replaced', 'dismissed', 'background', 'flush' or 'unmount'. A deferred commit
//   (delete) belongs in onHide; the Undo in onAction. 'unmount' is the provider going away
//   (sign-out has already cleared the session): a deferred delete must do nothing then.
// - flush(): ends what is showing now as 'flush' and resolves with its onHide's result (a
//   delete returns its sync promise). Settings awaits it before signing out or deleting the
//   account, so a pending delete commits while the session is alive.
// - showing(kind): whether the item on screen has that `kind` (Today: a skip inside the
//   Mark-the-rest window announces instead of replacing its Undo).
// - `hold`: no timeout (the web mockup's review stills only).
//
// Layout: Android gets a full-width bar (8 dp margins, text left, action right, M3); iOS and
// the web mockup a floating pill. Screens pad their content by `useSnackbarInset()` while one
// shows, so the list-end buttons are never under it.

const NOOP_API = { show: () => null, dismiss: () => false, flush: () => Promise.resolve(), showing: () => false };
const ApiContext = createContext(NOOP_API);
const StateContext = createContext({ item: null, inset: 0, act: () => {}, hold: () => {}, setHeight: () => {} });

let seq = 0;

// How long `item` stays up.
export function snackbarDuration(item, screenReader) {
  if (item?.duration != null) return screenReader ? Math.max(item.duration, SNACK.screenReader) : item.duration;
  return screenReader ? SNACK.screenReader : SNACK.standard;
}

export function SnackbarProvider({ children }) {
  const [item, setItem] = useState(null);
  const current = useRef(null);
  const [height, setHeight] = useState(0);
  // What holds the timer: { touch, hover } (hover: a mouse over the bar on the web).
  const [holds, setHolds] = useState({});
  const overlayOpen = useAnyOverlayOpen();
  const [reader, setReader] = useState(isScreenReaderOn);
  useEffect(() => subscribeScreenReader(setReader), []);

  const finish = useCallback((cur, reason) => {
    if (current.current !== cur) return;
    current.current = null;
    setItem(null);
    setHolds({});
    if (reason === 'action') return cur.onAction?.();
    return cur.onHide?.(reason);
  }, []);

  const show = useCallback((input) => {
    seq += 1;
    const next = { ...input, id: seq };
    const prev = current.current;
    current.current = next;
    setItem(next);
    if (next.message) announce(next.message);
    if (prev) prev.onHide?.('replaced');
    return next.id;
  }, []);

  // `match`: an id, a predicate, or nothing (whatever is showing).
  const dismiss = useCallback((match, reason = 'dismissed') => {
    const cur = current.current;
    if (!cur) return false;
    const hit = match == null ? true : typeof match === 'function' ? !!match(cur) : cur.id === match;
    if (!hit) return false;
    finish(cur, reason);
    return true;
  }, [finish]);

  const flush = useCallback(() => {
    const cur = current.current;
    if (!cur) return Promise.resolve();
    return Promise.resolve(finish(cur, 'flush')).catch(() => {});
  }, [finish]);

  const showing = useCallback((kind) => current.current?.kind === kind, []);

  const act = useCallback(() => {
    const cur = current.current;
    if (!cur) return;
    finish(cur, 'action');
    announce(t('snackbar.undone'));
  }, [finish]);

  // The timer: a fresh window per item, paused while touched or under an overlay.
  const remaining = useRef(0);
  useEffect(() => { remaining.current = item ? snackbarDuration(item, reader) : 0; }, [item]); // eslint-disable-line react-hooks/exhaustive-deps
  const paused = !!(holds.touch || holds.hover) || overlayOpen;
  useEffect(() => {
    if (!item || paused || item.hold) return undefined;
    const started = Date.now();
    const timer = setTimeout(() => finish(item, 'timeout'), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [item, paused, finish]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') dismiss((it) => it.endsOnBackground, 'background');
    });
    return () => {
      sub.remove();
      const cur = current.current;
      if (cur) { current.current = null; cur.onHide?.('unmount'); }
    };
  }, [dismiss]);

  const api = useMemo(() => ({ show, dismiss, flush, showing }), [show, dismiss, flush, showing]);
  const hold = useCallback((source, on) => setHolds(prev => (!!prev[source] === on ? prev : { ...prev, [source]: on })), []);
  const state = useMemo(() => ({
    item,
    // Kept while the bar animates out (SnackbarView resets the height once the exit ends), so
    // the list does not jump under a leaving bar.
    inset: height > 0 ? height + SNACK.gap : 0,
    act,
    hold,
    setHeight,
  }), [item, height, act, hold]);
  return (
    <ApiContext.Provider value={api}>
      <StateContext.Provider value={state}>{children}</StateContext.Provider>
    </ApiContext.Provider>
  );
}

// { show(item) -> id, dismiss(match?, reason?) -> bool, flush() -> Promise, showing(kind) -> bool }.
// Stable: it never re-renders the caller. item: { message, actionLabel?, onAction?, onHide?(reason), duration?, kind?,
// endsOnBackground? }.
export function useSnackbar() {
  return useContext(ApiContext);
}

// Bottom padding a screen adds to its scroll content while a snackbar shows (0 otherwise).
export function useSnackbarInset() {
  return useContext(StateContext).inset;
}

// The snackbar is a dark surface in both themes, so its action press uses the dark theme's
// pressedOverlay / ripple (a light-theme ripple would not show on it).
const ACTION_PRESS_THEME = themes.dark;
const ACTION_HEIGHT = 36;
const ACTION_SLOP = hitSlopFor(0, ACTION_HEIGHT);
const OFFSET = 80; // starts this far below its resting place
const ANDROID = Platform.OS === 'android';
const WEB = Platform.OS === 'web';

// The bar itself, rendered once by App.js above the tab bar (`bottom` = tab bar height).
// Enters over duration.value (emphasized decel) and leaves in duration.exit(value) (emphasized
// accel); the last snackbar stays rendered until its exit has finished. Under reduced motion
// it fades in and out (150 ms) and never slides or bumps (F-05).
export function SnackbarView({ bottom = 0, theme: themeProp }) {
  const { item, act, hold, setHeight } = useContext(StateContext);
  const themeCtx = useThemeContext();
  const theme = themeProp || themeCtx?.theme || themes.light;
  const motion = useMotion();
  const y = useRef(new Animated.Value(OFFSET)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  // What is on screen: the current item, or the previous one while it animates out.
  const [shown, setShown] = useState(item);
  const visible = useRef(false);
  const exiting = !item && !!shown;

  useEffect(() => {
    if (!item) {
      if (!shown) return undefined;
      visible.current = false;
      const out = duration.exit(duration.value);
      const parts = [motion.timing(opacity, { toValue: 0, duration: out, easing: easing.emphasizedAccel })];
      if (!motion.reduced) parts.push(motion.timing(y, { toValue: OFFSET, duration: out, easing: easing.emphasizedAccel }));
      const anim = Animated.parallel(parts);
      anim.start(({ finished }) => { if (finished) { setShown(null); setHeight(0); } });
      return () => anim.stop();
    }
    const replacing = visible.current;
    visible.current = true;
    setShown(item);
    if (replacing) {
      // A new message over a visible one: a bump in place (no slide).
      y.setValue(0);
      opacity.setValue(1);
      if (!motion.reduced) {
        scale.setValue(SNACK.bumpFrom);
        motion.springTo(scale, spring.snappy, { toValue: 1 }).start();
      }
      return undefined;
    }
    y.stopAnimation();
    opacity.stopAnimation();
    scale.setValue(1);
    if (motion.reduced) {
      y.setValue(0);
      opacity.setValue(0);
      motion.timing(opacity, { toValue: 1, duration: duration.reduced }).start();
    } else {
      opacity.setValue(1);
      y.setValue(OFFSET);
      motion.timing(y, { toValue: 0, duration: duration.value, easing: easing.emphasizedDecel }).start();
    }
    return undefined;
  }, [item]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!shown) return null;
  const hasAction = !!shown.actionLabel;
  return (
    <Animated.View
      style={[styles.wrap, ANDROID ? styles.wrapAndroid : styles.wrapIOS, { bottom: bottom + SNACK.gap, opacity, transform: [{ translateY: y }, { scale }] }]}
      pointerEvents={exiting ? 'none' : 'box-none'}
      accessibilityElementsHidden={exiting}
      importantForAccessibility={exiting ? 'no-hide-descendants' : 'auto'}
      aria-hidden={exiting || undefined}
      testID="snackbar"
    >
      <View
        style={[
          styles.bar,
          ANDROID ? styles.barAndroid : styles.barIOS,
          { backgroundColor: theme.toast, borderColor: theme.toastEdge, shadowColor: theme.shadow },
        ]}
        onLayout={(e) => setHeight(Math.round(e.nativeEvent.layout.height))}
        onTouchStart={() => hold('touch', true)}
        onTouchEnd={() => hold('touch', false)}
        onTouchCancel={() => hold('touch', false)}
        {...(WEB ? { onMouseEnter: () => hold('hover', true), onMouseLeave: () => hold('hover', false) } : null)}
      >
        <AppText variant="callout" style={[styles.msg, { color: theme.onToast }]} numberOfLines={2}>{shown.message}</AppText>
        {hasAction && (
          <PressableScale
            onPress={act}
            theme={ACTION_PRESS_THEME}
            style={styles.action}
            hitSlop={{ top: ACTION_SLOP.top, bottom: ACTION_SLOP.bottom, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel={shown.actionA11y || t('snackbar.actionA11y', { action: shown.actionLabel, message: shown.message })}
          >
            <AppText variant="callout" style={[styles.actionText, { color: theme.toastAction }]}>{shown.actionLabel}</AppText>
          </PressableScale>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute' },
  wrapAndroid: { left: space.xs, right: space.xs }, // 8 dp margins (M3)
  wrapIOS: { left: space.md, right: space.md, alignItems: 'center' },
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    paddingVertical: space.xs, paddingRight: space.xxs, borderWidth: 1,
    shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6,
    minHeight: 48,
  },
  // M3: full width, a small corner, text left and the action right.
  barAndroid: { alignSelf: 'stretch', borderRadius: radius.cell, paddingLeft: space.md },
  // iOS: a floating pill, as wide as its text.
  barIOS: { maxWidth: '100%', borderRadius: radius.pill, paddingLeft: space.lg },
  msg: { flexShrink: 1, flexGrow: ANDROID ? 1 : 0, fontWeight: '600' },
  // 36 tall + hitSlop to the touch minimum; it is wider than 48 with its label.
  action: { minHeight: ACTION_HEIGHT, justifyContent: 'center', paddingHorizontal: space.sm, borderRadius: radius.control, overflow: 'hidden' },
  actionText: { fontWeight: '800', letterSpacing: 0.3 },
});
