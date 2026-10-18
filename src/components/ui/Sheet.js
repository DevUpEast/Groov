import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  View, ScrollView, TextInput, Pressable, Keyboard, KeyboardAvoidingView, Platform, Animated, PanResponder, StyleSheet,
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
 * - `footer`: pinned under the scroll body (e.g. Save), above the bottom inset. With two detents
 *   it stays pinned to the bottom of the window at `medium` too (it moves up with the visible
 *   edge), and the body gets the hidden height as bottom padding, so all of it can still be
 *   scrolled into view at `medium` (F-10).
 * - `closeLabel`: the default header's close button name (default "Close"; the paywall says
 *   "Not now").
 * - `backgroundColor` / `grabberColor`: a tinted sheet (a past challenge's tier colour); the
 *   default is the `raised` surface and the `controlBorder` grabber.
 * - `scroll` (default true): wrap `children` in a ScrollView (`keyboardShouldPersistTaps`).
 * - `accessibilityLabel`: the sheet's name for screen readers (default: `title`). Focus moves to
 *   the title when the sheet opens (a custom `header` function puts the `titleRef` it gets on
 *   its title text); `returnFocusRef` (optional) gets it back once the sheet has gone.
 *
 * Reduced motion: the sheet does not slide (a medium detent still rests at its height). The same value becomes its opacity, so open, close
 * and a drag are 150 ms fades in place (F-05), and the scrim follows it.
 * Keyboard: a `KeyboardAvoidingView` (padding) on iOS, and on Android a bottom padding of the
 * keyboard height (the edge-to-edge Modal window does not resize), lift the surface; the scrim stays outside it and keeps covering the window. While the keyboard is up the surface
 * drops the bottom inset from its padding (the keyboard covers the home indicator / nav bar), so
 * a pinned footer sits just above the keys (F-09b, checked on the Pixel emulator).
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

/**
 * The software keyboard's height while it is up, else 0 (show/hide events: `did*` on Android,
 * `will*` on iOS). Only the hide event resets it: RN's KeyboardAvoidingView on Android also
 * measures the hide event against its own frame, and in an edge-to-edge Modal that left the
 * sheet lifted by about the navigation bar after the keyboard went (F-09b, seen on the emulator).
 */
export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const heightOf = (e) => Math.max(0, e?.endCoordinates?.height ?? 0);
    const subs = [
      Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setHeight(heightOf(e))),
      Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setHeight(0)),
      // A height change while the keyboard stays up (a suggestion strip, the emoji panel). Only
      // while it is up, so a frame change around a hide cannot lift it again. Android (RN 0.81)
      // emits no frame-change event and re-reports a new height only on its next show.
      Keyboard.addListener(ios ? 'keyboardWillChangeFrame' : 'keyboardDidChangeFrame', (e) => {
        const h = heightOf(e);
        setHeight(prev => (prev > 0 && h > 0 ? h : prev));
      }),
    ];
    return () => subs.forEach(sub => sub.remove());
  }, []);
  return height;
}

// From API 30 Android reports the keyboard height without the navigation bar under it (RN
// subtracts the system bar inset), so the caller adds the bottom inset back; the legacy path
// (API 24-29) measures from the visible frame, nav bar already included.
export const keyboardLiftFor = (keyboardHeight, bottomInset, os = Platform.OS, version = Platform.Version) => {
  if (!(keyboardHeight > 0)) return 0;
  return os === 'android' && Number(version) >= 30 ? keyboardHeight + bottomInset : keyboardHeight;
};


/** The surface's bottom padding: the home indicator / nav bar inset, or a small gap above the keys. */
export const surfaceBottomPad = (keyboardHeight, bottomInset) => (
  keyboardHeight > 0 ? space.sm : Math.max(space.lg, bottomInset + space.xs)
);

function KeyboardLift({ style, lift, children }) {
  if (Platform.OS === 'ios') {
    return <KeyboardAvoidingView behavior="padding" style={style} pointerEvents="box-none">{children}</KeyboardAvoidingView>;
  }
  return <View style={[style, { paddingBottom: lift }]} pointerEvents="box-none">{children}</View>;
}

// How far the focused input (plus its field border and a little air) runs past the bottom of
// the sheet body; 0 when it already fits. Pure, for the tests.
export const REVEAL_MARGIN = space.xs;
export function revealOverflow({ bodyY, bodyHeight, inputY, inputHeight }) {
  return Math.max(0, Math.ceil(inputY + inputHeight + REVEAL_MARGIN - (bodyY + bodyHeight)));
}

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
 * under reduced motion). Only `Sheet` uses it; the legacy `BottomSheet` wrapper went in F-09b.
 */
export function SheetFrame({
  visible, value, onRequestClose, onScrimPress, onShow, rest = 0, height, maxHeight = `${LARGE_FRACTION * 100}%`,
  backgroundColor, accessibilityLabel, onAccessibilityEscape, children, theme: themeProp,
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
  const keyboardHeight = useKeyboardHeight();
  const bottom = surfaceBottomPad(keyboardHeight, insets.bottom);
  return (
    <OverlayModal
      visible={visible}
      animationType="none"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
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
      {/* iOS: KeyboardAvoidingView (padding). Android: the edge-to-edge Modal window does not
          resize, so the overlay is padded by the keyboard height itself (see useKeyboardHeight). */}
      <KeyboardLift style={styles.overlay} lift={keyboardLiftFor(keyboardHeight, insets.bottom)}>
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
      </KeyboardLift>
    </OverlayModal>
  );
}

/** The grabber: a decorative pill (the close button, back and escape are the accessible ways out). */
export function SheetGrabber({ theme: themeProp, color }) {
  const theme = useUiTheme(themeProp);
  return (
    <View style={styles.grabberArea} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={[styles.grabber, { backgroundColor: color ?? theme.controlBorder }]} />
    </View>
  );
}

export default function Sheet({
  visible, onClose, onDismiss, title, header, detents = ['large'], initialDetent, dirty = false, footer, children,
  scroll = true, contentContainerStyle, accessibilityLabel, returnFocusRef, theme: themeProp, testID, ref,
  backgroundColor, grabberColor, closeLabel,
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
  // Starts unmounted even when first rendered visible: the visible effect then mounts it through
  // the enter-on-onShow path, so the spring never runs before the Modal window exists (F-10 M2).
  const [mounted, setMounted] = useState(false);
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
  // (The `mountedRef` check reads the committed state: false on a first mount.)
  useEffect(() => {
    if (visible) {
      closing.current = false;
      pendingThen.current = null;
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
        const then = pendingThen.current;
        pendingThen.current = null;
        then?.();
      });
    }
    wasMounted.current = mounted;
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [mounted]);

  // A guarded exit the host starts itself (F-09b review M1): `ref.current.requestClose(then)`
  // asks "Discard changes?" while dirty, like the scrim; `then` runs after `onDismiss` only if
  // the sheet really closes, and is dropped on "Keep editing" or the next request.
  const pendingThen = useRef(null);

  // Every dismissal (scrim, drag, back, escape, close button) goes through here.
  // - Already closed by the host (`visible` false): (re)run the exit, so a stopped exit can
  //   never leave the Modal up.
  // - Dirty: settle back and ask first.
  // - Otherwise ask the host. A drag release settles first (closeFromDrag): if the host closes,
  //   the `visible` effect replaces the settle with the exit; if it refuses, the sheet is back at
  //   its detent instead of stuck where the finger left it (m4).
  const requestClose = useCallback((then) => {
    // Pressables pass their event; only a function is a follow-up.
    pendingThen.current = typeof then === 'function' ? then : null;
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
  useImperativeHandle(ref, () => ({ requestClose }), [requestClose]);

  // Android scrolls only the focused EditText into view when the keyboard shrinks the body, so
  // a TextField's 2 dp border (on its wrapper) was clipped at the edge (F-09b review m6). Once
  // the body has been laid out again with the keyboard up, bring the field and a margin in.
  const keyboardHeight = useKeyboardHeight();
  const scrollRef = useRef(null);
  const scrollY = useRef(0);
  const revealRaf = useRef(null);
  const onBodyScroll = (e) => { scrollY.current = e.nativeEvent.contentOffset.y; };
  const onBodyLayout = () => {
    if (Platform.OS !== 'android' || keyboardHeight <= 0) return;
    cancelAnimationFrame(revealRaf.current);
    revealRaf.current = requestAnimationFrame(() => {
      const input = TextInput.State?.currentlyFocusedInput?.();
      const body = scrollRef.current;
      if (!input?.measureInWindow || !body?.measureInWindow) return;
      body.measureInWindow((bx, by, bw, bh) => input.measureInWindow((ix, iy, iw, ih) => {
        const overflow = revealOverflow({ bodyY: by, bodyHeight: bh, inputY: iy, inputHeight: ih });
        if (overflow > 0) body.scrollTo({ y: scrollY.current + overflow, animated: true });
      }));
    });
  };
  useEffect(() => () => cancelAnimationFrame(revealRaf.current), []);
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
  // At `medium` the bottom `hidden` dp of the fixed-height sheet are below the window: the body
  // gets that much extra bottom padding, and the footer is lifted by however far the sheet is
  // down (clamped to the medium offset), so it stays on screen (F-10).
  const rest = restOffset(detent, detents, mediumOffset);
  const bodyPad = rest > 0 ? { paddingBottom: (StyleSheet.flatten(contentContainerStyle)?.paddingBottom ?? 0) + rest } : null;
  // The lifted footer also covers the strip below it down to the window edge (the surface's
  // bottom padding), or scrolled body rows would show under the button (F-10 M1).
  const insets = useSafeAreaInsets();
  const pad = surfaceBottomPad(keyboardHeight, insets.bottom);
  const footerBacking = twoDetents ? {
    backgroundColor: backgroundColor ?? theme.raised,
    paddingBottom: pad,
    marginBottom: -pad,
    borderTopWidth: rest > 0 ? StyleSheet.hairlineWidth : 0,
    borderTopColor: theme.border,
  } : null;
  const footerLift = !twoDetents ? null : r
    ? { transform: [{ translateY: -rest }] }
    : { transform: [{ translateY: value.interpolate({ inputRange: [0, mediumOffset], outputRange: [0, -mediumOffset], extrapolate: 'clamp' }) }] };

  return (
    <SheetFrame
      visible={mounted}
      value={value}
      rest={rest}
      height={fixedHeight}
      backgroundColor={backgroundColor}
      onRequestClose={requestClose}
      onScrimPress={requestClose}
      onAccessibilityEscape={requestClose}
      onShow={handleShow}
      accessibilityLabel={accessibilityLabel ?? title}
      theme={theme}
      testID={testID}
    >
      <View {...pan.panHandlers} style={styles.dragZone} testID="sheet-drag-zone">
        <SheetGrabber theme={theme} color={grabberColor} />
        <View>
          {headerNode ?? (title ? (
            <View style={styles.titleRow}>
              <AppText ref={headerRef} variant="headline" style={[styles.title, { color: theme.text }]} accessibilityRole="header" numberOfLines={2}>{title}</AppText>
              <IconButton icon="close" iconSize={24} theme={theme} onPress={requestClose} accessibilityLabel={closeLabel ?? t('common.close')} style={styles.closeBtn} />
            </View>
          ) : null)}
        </View>
      </View>
      {scroll ? (
        <ScrollView
          ref={scrollRef}
          onScroll={onBodyScroll}
          scrollEventThrottle={16}
          onLayout={onBodyLayout}
          style={fixedHeight ? styles.bodyFill : styles.bodyFit}
          contentContainerStyle={[contentContainerStyle, bodyPad]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[fixedHeight ? styles.bodyFill : styles.bodyFit, bodyPad]}>{children}</View>
      )}
      {footer ? <Animated.View testID="sheet-footer" style={[styles.footer, footerBacking, footerLift]}>{footer}</Animated.View> : null}
      <Dialog
        visible={confirming}
        onClose={() => { pendingThen.current = null; setConfirming(false); }}
        onDismiss={() => { if (discardThen.current) { discardThen.current = false; live.current.onClose?.(); } }}
        title={t('common.discardChanges.title')}
        body={t('common.discardChanges.body')}
        actions={[
          { label: t('common.discardChanges.keep'), onPress: () => { pendingThen.current = null; setConfirming(false); } },
          { label: t('common.discardChanges.discard'), variant: 'destructive', onPress: () => { discardThen.current = true; setConfirming(false); } },
        ]}
      />
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  // Phones: full width. Tablets and web: a centred column (n2).
  surface: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
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
