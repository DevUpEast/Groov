import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, ScrollView, Pressable, KeyboardAvoidingView, Platform, Animated, PanResponder, StyleSheet,
  AccessibilityInfo, findNodeHandle, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../../i18n';
import { elevation, space, radius } from '../../theme/tokens';
import {
  useMotion, spring, springTo, sheetOut, SHEET_OFFSCREEN, SHEET_FADE_RANGE,
} from '../../theme/motion';
import OverlayModal from './OverlayModal';
import IconButton from './IconButton';
import AppText from './AppText';
import Dialog from './Dialog';
import { useUiTheme } from './PressableScale';

/**
 * The shared bottom sheet (plan §3, F-09a). A transparent `Modal` (status and navigation bar
 * translucent, so the scrim covers the whole window) holding a `raised` surface (level 2, §2.8)
 * that slides up on `spring.gentle` while the scrim fades in step with it (DEP-4).
 *
 * Closing: a scrim tap, a downward drag from the header region (the grabber, the title row and
 * an 8 dp band under it; never the scroll body, so the body scroll stays native), Android back
 * (`onRequestClose`) and the VoiceOver escape gesture all call the same guarded close. While
 * `dirty` is set it first asks "Discard changes?" in a `Dialog`.
 *
 * Controlled: the host owns `visible`. A close request calls `onClose()`; the host sets
 * `visible` to false and the sheet plays its exit (`sheetOut`, from wherever a drag left it).
 * `onDismiss` runs once the exit has finished and the Modal is gone (a frame after the unmount
 * commit): open the next overlay, or navigate, from there, never on a timer.
 *
 * Props:
 * - `visible`, `onClose`, `onDismiss`
 * - `title`: the default header (a headline, announced as a header, plus a close button).
 *   `header` replaces it: a node, or `({ close }) => node` for a header with its own buttons.
 *   Either one is the drag region and gets accessibility focus when the sheet opens.
 * - `detents`: ['large'] (default: the sheet fits its content, up to 92 % of the window) or
 *   ['medium', 'large'] (a fixed 92 % sheet that rests 55 % tall at `medium`; drag up for
 *   `large`, down for `medium`, then closed). `initialDetent` picks the first rest.
 * - `dirty`: guard every dismissal with the discard dialog.
 * - `footer`: pinned under the scroll body (e.g. Save), above the bottom inset.
 * - `scroll` (default true): wrap `children` in a ScrollView (`keyboardShouldPersistTaps`).
 * - `accessibilityLabel`: the sheet's name for screen readers (default: `title`). Focus moves to
 *   the title when the sheet opens (a custom `header` function puts the `titleRef` it gets on
 *   its title text); `returnFocusRef` (optional) gets it back once the sheet has gone.
 *
 * Reduced motion: the sheet does not slide (a medium detent still rests at its height). The same value becomes its opacity, so open, close
 * and a drag are 150 ms fades in place (F-05), and the scrim follows it.
 * Keyboard: a `KeyboardAvoidingView` (padding on iOS, height on Android) lifts the surface; the
 * scrim stays outside it and keeps covering the window.
 */

// Detent heights as fractions of the window.
export const LARGE_FRACTION = 0.92;
export const MEDIUM_FRACTION = 0.55;
// A drag past this many dp below the lowest rest closes the sheet (the pre-F-09a threshold).
export const DISMISS_DISTANCE = 80;
// A downward flick faster than this (dp per ms) closes from the lowest rest.
export const DISMISS_VELOCITY = 1.2;
// How far ahead (ms) a release velocity is projected when picking the nearest detent.
const FLICK_PROJECTION_MS = 120;
// Upward drags past the top rest move at this fraction of the finger (rubber band).
const OVERDRAG = 0.25;
// A move must travel this far, mostly vertically, before the header claims it as a drag.
const DRAG_SLOP = 5;
// Accessibility focus moves to the header once the Modal window has focus (Android needs it to
// exist first; same delay as Dialog's initial focus).
const FOCUS_DELAY_MS = 150;
// The enter starts from the Modal's onShow: started earlier, a slow device plays the whole spring
// before the Modal window exists and the sheet pops in. If onShow never comes, enter anyway.
const ENTER_FALLBACK_MS = 400;

/** The offset (dp below the top rest) of the medium detent for a window height. */
export function mediumOffsetFor(windowHeight) {
  return Math.round(windowHeight * (LARGE_FRACTION - MEDIUM_FRACTION));
}

/** The resting translateY for a detent. */
export function restOffset(detent, detents, mediumOffset) {
  return detent === 'medium' && detents.includes('medium') ? mediumOffset : 0;
}

/**
 * Where a header drag released at `dy` (dp, + = down) with velocity `vy` (dp/ms) lands:
 * 'close', 'medium' or 'large'. Pure; `Sheet` and the tests share it.
 */
export function sheetDragTarget({ detents = ['large'], detent = 'large', dy = 0, vy = 0, mediumOffset = 0 }) {
  const hasMedium = detents.includes('medium') && mediumOffset > 0;
  const rest = restOffset(detent, detents, mediumOffset);
  const lowest = hasMedium ? mediumOffset : 0;
  const projected = rest + dy + vy * FLICK_PROJECTION_MS;
  if (dy > 0 && rest + dy - lowest > DISMISS_DISTANCE) return 'close';
  if (dy > 0 && vy > DISMISS_VELOCITY && rest === lowest) return 'close';
  if (!hasMedium) return 'large';
  if (projected - lowest > DISMISS_DISTANCE) return 'close';
  return Math.abs(projected - mediumOffset) < Math.abs(projected) ? 'medium' : 'large';
}

/**
 * The sheet's outer frame: Modal, scrim, keyboard avoidance and the raised surface, driven by
 * an external Animated value (0 = open; SHEET_OFFSCREEN closed in full motion, SHEET_FADE_RANGE
 * under reduced motion). `Sheet` uses it, and so does the legacy `BottomSheet` wrapper the
 * habit and challenge forms still drive themselves until F-09b.
 */
export function SheetFrame({
  visible, value, onRequestClose, onScrimPress, onShow, rest = 0, height, maxHeight = `${LARGE_FRACTION * 100}%`,
  backgroundColor, statusBarTranslucent = true, paddingBottom, accessibilityLabel, onAccessibilityEscape, children, theme: themeProp,
  testID,
}) {
  const theme = useUiTheme(themeProp);
  const motion = useMotion();
  const insets = useSafeAreaInsets();
  const r = motion.reduced;
  const scrimOpacity = useMemo(() => value.interpolate(r
    ? { inputRange: [0, SHEET_FADE_RANGE], outputRange: [1, 0], extrapolate: 'clamp' }
    : { inputRange: [rest, Math.max(rest + 1, SHEET_OFFSCREEN)], outputRange: [1, 0], extrapolate: 'clamp' }), [value, r, rest]);
  const motionStyle = r
    ? { opacity: scrimOpacity, transform: [{ translateY: rest }] }
    : { transform: [{ translateY: value }] };
  const bottom = paddingBottom ?? Math.max(space.lg, insets.bottom + space.xs);
  return (
    <OverlayModal
      visible={visible}
      animationType="none"
      transparent
      statusBarTranslucent={statusBarTranslucent}
      navigationBarTranslucent={statusBarTranslucent}
      onRequestClose={onRequestClose}
      onShow={onShow}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim, opacity: scrimOpacity }]} pointerEvents="box-none">
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onScrimPress}
          testID="sheet-scrim"
          accessible={false}
          importantForAccessibility="no"
        />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay} pointerEvents="box-none">
        <Animated.View
          testID={testID}
          accessibilityViewIsModal
          accessibilityLabel={accessibilityLabel}
          onAccessibilityEscape={onAccessibilityEscape}
          style={[
            styles.surface, elevation.sheet,
            { shadowColor: theme.shadow, backgroundColor: backgroundColor ?? theme.raised, paddingBottom: bottom },
            height != null ? { height } : { maxHeight },
            motionStyle,
          ]}
        >
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </OverlayModal>
  );
}

/** The grabber: a decorative pill (the close button, back and escape are the accessible ways out). */
export function SheetGrabber({ theme: themeProp }) {
  const theme = useUiTheme(themeProp);
  return (
    <View style={styles.grabberArea} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={[styles.grabber, { backgroundColor: theme.controlBorder }]} />
    </View>
  );
}

export default function Sheet({
  visible, onClose, onDismiss, title, header, detents = ['large'], initialDetent, dirty = false, footer, children,
  scroll = true, contentContainerStyle, accessibilityLabel, returnFocusRef, theme: themeProp, testID,
}) {
  const theme = useUiTheme(themeProp);
  const motion = useMotion();
  const r = motion.reduced;
  const { height: windowHeight } = useWindowDimensions();
  const twoDetents = detents.includes('medium') && detents.includes('large');
  const mediumOffset = twoDetents ? mediumOffsetFor(windowHeight) : 0;
  const firstDetent = initialDetent && detents.includes(initialDetent) ? initialDetent : detents[0];

  const closed = r ? SHEET_FADE_RANGE : SHEET_OFFSCREEN;
  const value = useRef(new Animated.Value(closed)).current;
  const [mounted, setMounted] = useState(!!visible);
  const [detent, setDetent] = useState(firstDetent);
  const [confirming, setConfirming] = useState(false);

  // Latest values for the PanResponder (created once) and the async callbacks.
  const live = useRef({});
  live.current = { r, detent, detents, mediumOffset, dirty, onClose, onDismiss, visible: !!visible, returnFocusRef };
  const mountedRef = useRef(mounted);
  mountedRef.current = mounted;

  const anim = useRef(null);
  const run = useCallback((a, done) => {
    if (anim.current) anim.current.stop();
    anim.current = a;
    a.start(({ finished }) => {
      if (anim.current === a) anim.current = null;
      if (finished && done) done();
    });
  }, []);
  const restFor = (d) => (live.current.r ? 0 : restOffset(d, live.current.detents, live.current.mediumOffset));
  const settle = (d, velocity) => run(springTo(value, spring.gentle, { toValue: restFor(d), velocity }, live.current.r));

  const entered = useRef(true);
  const enterTimer = useRef(null);
  const enter = () => {
    clearTimeout(enterTimer.current);
    if (entered.current) return;
    entered.current = true;
    settle(live.current.detent);
  };
  useEffect(() => () => clearTimeout(enterTimer.current), []);

  // The exit. While it runs (`closing`) the header claims no touch, so nothing can stop it and
  // leave a sheet open over a host whose `visible` is already false (F-09a review B1).
  const closing = useRef(false);
  const exit = () => {
    closing.current = true;
    clearTimeout(enterTimer.current);
    entered.current = true;
    run(sheetOut(value, SHEET_OFFSCREEN, live.current.r), () => { closing.current = false; setMounted(false); });
  };

  // Open and close follow `visible`. A re-open during the exit springs back from where it is.
  useEffect(() => {
    if (visible) {
      closing.current = false;
      if (!mountedRef.current) value.setValue(r ? SHEET_FADE_RANGE : SHEET_OFFSCREEN);
      setMounted(true);
      setDetent(firstDetent);
      // Re-open mid-exit: spring back at once (the window is already up).
      if (mountedRef.current) settle(firstDetent);
      else {
        entered.current = false;
        clearTimeout(enterTimer.current);
        enterTimer.current = setTimeout(enter, ENTER_FALLBACK_MS);
      }
    } else if (mountedRef.current) {
      setConfirming(false);
      exit();
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // onDismiss: once the Modal has unmounted (a frame after the commit that removed it).
  const wasMounted = useRef(mounted);
  useEffect(() => {
    let raf;
    if (wasMounted.current && !mounted) {
      raf = requestAnimationFrame(() => {
        // Give focus back to what opened the sheet (when the host passes it), then hand off.
        try {
          const node = live.current.returnFocusRef?.current && findNodeHandle(live.current.returnFocusRef.current);
          if (node) AccessibilityInfo.setAccessibilityFocus(node);
        } catch (_) { /* web: no native focus API */ }
        live.current.onDismiss?.();
      });
    }
    wasMounted.current = mounted;
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [mounted]);

  // Every dismissal (scrim, drag, back, escape, close button) goes through here.
  // - Already closed by the host (`visible` false): (re)run the exit, so a stopped exit can
  //   never leave the Modal up.
  // - Dirty: settle back and ask first.
  // - Otherwise ask the host. A drag release settles first (closeFromDrag): if the host closes,
  //   the `visible` effect replaces the settle with the exit; if it refuses, the sheet is back at
  //   its detent instead of stuck where the finger left it (m4).
  const requestClose = useCallback(() => {
    if (!live.current.visible) {
      if (mountedRef.current && !closing.current) exit();
      return;
    }
    if (live.current.dirty) {
      settle(live.current.detent);
      setConfirming(true);
      return;
    }
    live.current.onClose?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const closeFromDrag = () => {
    settle(live.current.detent);
    requestClose();
  };

  const dragging = useRef(false);
  const interrupted = useRef(false);
  const pan = useRef(PanResponder.create({
    // Claim a touch that starts on the header itself (buttons inside it are deeper and claim
    // their own taps first); a move that starts on a button is taken over once it drags.
    // Never during the exit (B1).
    onStartShouldSetPanResponder: () => !closing.current,
    onMoveShouldSetPanResponderCapture: (_, g) => !closing.current && Math.abs(g.dy) > DRAG_SLOP && Math.abs(g.dy) > Math.abs(g.dx),
    onMoveShouldSetPanResponder: (_, g) => !closing.current && Math.abs(g.dy) > DRAG_SLOP && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      dragging.current = !closing.current;
      interrupted.current = false;
      // Catch a settling or entering sheet under the finger; a running exit is never stopped.
      if (dragging.current && anim.current) { anim.current.stop(); anim.current = null; interrupted.current = true; }
    },
    onPanResponderMove: (_, g) => {
      if (!dragging.current || closing.current) return;
      const L = live.current;
      if (L.r) { value.setValue(Math.max(0, g.dy)); return; }
      const top = 0;
      const y = restOffset(L.detent, L.detents, L.mediumOffset) + g.dy;
      value.setValue(y < top ? top + (y - top) * OVERDRAG : y);
    },
    onPanResponderRelease: (_, g) => {
      const wasDragging = dragging.current;
      dragging.current = false;
      if (!wasDragging || closing.current) return;
      // A plain tap on the header (no movement) leaves the sheet alone (n3).
      if (g.dx === 0 && g.dy === 0) { if (interrupted.current) settle(live.current.detent); return; }
      const L = live.current;
      const target = sheetDragTarget({ detents: L.detents, detent: L.detent, dy: g.dy, vy: g.vy, mediumOffset: L.mediumOffset });
      if (target === 'close') { closeFromDrag(); return; }
      setDetent(target);
      live.current.detent = target;
      settle(target, g.vy);
    },
    onPanResponderTerminate: () => {
      const wasDragging = dragging.current;
      dragging.current = false;
      if (wasDragging && !closing.current) settle(live.current.detent);
    },
  })).current;

  // Screen readers: move focus to the title (the accessible header text) once the window is up.
  // A custom `header` function gets `titleRef` to put on its title.
  const headerRef = useRef(null);
  const focusTimer = useRef(null);
  const handleShow = () => {
    enter();
    clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => {
      try {
        const node = headerRef.current && findNodeHandle(headerRef.current);
        if (node) AccessibilityInfo.setAccessibilityFocus(node);
      } catch (_) { /* web: no native focus API */ }
    }, FOCUS_DELAY_MS);
  };
  useEffect(() => () => clearTimeout(focusTimer.current), []);

  const discardThen = useRef(false);
  const headerNode = typeof header === 'function' ? header({ close: requestClose, titleRef: headerRef }) : header;
  const fixedHeight = twoDetents ? Math.round(windowHeight * LARGE_FRACTION) : undefined;

  return (
    <SheetFrame
      visible={mounted}
      value={value}
      rest={restOffset(detent, detents, mediumOffset)}
      height={fixedHeight}
      onRequestClose={requestClose}
      onScrimPress={requestClose}
      onAccessibilityEscape={requestClose}
      onShow={handleShow}
      accessibilityLabel={accessibilityLabel ?? title}
      theme={theme}
      testID={testID}
    >
      <View {...pan.panHandlers} style={styles.dragZone} testID="sheet-drag-zone">
        <SheetGrabber theme={theme} />
        <View>
          {headerNode ?? (title ? (
            <View style={styles.titleRow}>
              <AppText ref={headerRef} variant="headline" style={[styles.title, { color: theme.text }]} accessibilityRole="header" numberOfLines={2}>{title}</AppText>
              <IconButton icon="close" iconSize={24} theme={theme} onPress={requestClose} accessibilityLabel={t('common.close')} style={styles.closeBtn} />
            </View>
          ) : null)}
        </View>
      </View>
      {scroll ? (
        <ScrollView
          style={fixedHeight ? styles.bodyFill : styles.bodyFit}
          contentContainerStyle={contentContainerStyle}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={fixedHeight ? styles.bodyFill : styles.bodyFit}>{children}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
      <Dialog
        visible={confirming}
        onClose={() => setConfirming(false)}
        onDismiss={() => { if (discardThen.current) { discardThen.current = false; live.current.onClose?.(); } }}
        title={t('common.discardChanges.title')}
        body={t('common.discardChanges.body')}
        actions={[
          { label: t('common.discardChanges.keep'), onPress: () => setConfirming(false) },
          { label: t('common.discardChanges.discard'), variant: 'destructive', onPress: () => { discardThen.current = true; setConfirming(false); } },
        ]}
      />
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  surface: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.lg,
  },
  // Grabber + header + an 8 dp band: the only place a drag moves the sheet.
  dragZone: { paddingBottom: space.xs },
  grabberArea: { alignItems: 'center', paddingVertical: space.sm },
  grabber: { width: 36, height: 5, borderRadius: radius.pill },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  title: { flexShrink: 1 },
  // The 40 pt button's icon lines up with the sheet's content edge.
  closeBtn: { marginRight: -space.xs },
  bodyFit: { flexGrow: 0, flexShrink: 1 },
  bodyFill: { flex: 1 },
  footer: { paddingTop: space.sm },
});
