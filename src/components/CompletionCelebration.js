import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, StyleSheet, Animated, Dimensions, Pressable, AccessibilityInfo, findNodeHandle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import OverlayModal from './ui/OverlayModal';
import PressableScale, { useUiTheme } from './ui/PressableScale';
import AppText from './ui/AppText';
import { measureNode, measureAnchor, relativeTo, centreOf } from '../utils/creditAnchors';
import { announce } from '../utils/a11y';
import { useMotion, celebration, spring } from '../theme/motion';
import { space, radius } from '../theme/tokens';
import { t, useLocale } from '../i18n';

const { width: W, height: H } = Dimensions.get('window');

// Large enough to cover every corner from wherever the ring sits.
const CIRCLE_D = Math.ceil(Math.sqrt(W * W + H * H) * 2.2);
// Where the ground grows from when the ring cannot be measured.
const RING_CX = 79;
const RING_CY = 190;
const CONFETTI_COUNT = 40;
const DISC = 72;
const HERO = { fontSize: 88, lineHeight: 96 };

function ConfettiPiece({ index, color }) {
  const startX = (Math.random() * W * 1.2) - W * 0.1;
  const x = useRef(new Animated.Value(startX)).current;
  const y = useRef(new Animated.Value(-30)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(Math.random() * 0.7 + 0.5)).current;
  const delay = celebration.textInAt + index * 30 + Math.random() * 200;
  const duration = celebration.fullConfettiFall + Math.random() * celebration.fullConfettiFallJitter;
  const isWide = Math.random() > 0.5;

  useEffect(() => {
    const driftX = startX + (Math.random() - 0.5) * 120;
    const run = Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(y, { toValue: H + 40, duration, useNativeDriver: true }),
        Animated.timing(x, { toValue: driftX, duration, useNativeDriver: true }),
        Animated.timing(rotate, { toValue: (Math.random() > 0.5 ? 1 : -1) * (Math.random() * 6 + 3), duration, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(duration * 0.7),
          Animated.timing(opacity, { toValue: 0, duration: duration * 0.3, useNativeDriver: true }),
        ]),
      ]),
    ]);
    run.start();
    return () => run.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const spin = rotate.interpolate({ inputRange: [-10, 10], outputRange: ['-3600deg', '3600deg'] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        isWide ? styles.confettiWide : styles.confettiSquare,
        { backgroundColor: color, transform: [{ translateX: x }, { translateY: y }, { rotate: spin }, { scale }], opacity },
      ]}
    />
  );
}

/**
 * The streak-milestone screen (§4.1 row 9; C-08 restyle). A root `OverlayModal`, so it covers
 * the tab bar and takes the Android back key (S-03 carry: celebrations are Modals now). The
 * brand ground (`brandGround`, onboarding's) grows from the measured centre of `originKey` (the
 * strip ring, or the sticky one when scrolled); the Ionicons mark sits on a `brandGroundCta`
 * disc, the streak is a Space Grotesk `display` numeral, and the copy follows the glossary (no
 * exclamation mark). Share (CEL-7) closes the screen and then calls `onShare`.
 *
 * Dismiss: a tap anywhere, "Tap to continue" or back, once the screen has been up
 * `celebration.milestoneSkipAfter` (1 s); before that they are swallowed. It closes itself after
 * `celebration.autoDismissAt` unless a screen reader is on (then it waits for the user) or
 * `hold` is set (mockup stills). Reduced motion: no growing circle and no confetti; the ground
 * and its content fade in and out over `duration.reduced` (150 ms).
 *
 * `onDone()` runs once the exit has finished; `onShare()` runs instead of it after Share.
 */
export default function CompletionCelebration({ visible, milestone, onDone, onShare, originKey = 'ring', hold = false }) {
  useLocale();
  const theme = useUiTheme();
  const m = useMotion();
  const reduced = m.reduced;
  const circleScale = useRef(new Animated.Value(0.06)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentScale = useRef(new Animated.Value(0.9)).current;
  const originX = useRef(new Animated.Value(RING_CX)).current;
  const originY = useRef(new Animated.Value(RING_CY)).current;
  const rootRef = useRef(null);
  const focusRef = useRef(null);
  const [canSkip, setCanSkip] = useState(false);
  const closing = useRef(false);
  const timers = useRef([]);
  const live = useRef({ onDone, onShare });
  live.current = { onDone, onShare };
  // The last milestone stays drawn while the exit plays (the host may clear it).
  const shown = useRef(milestone);
  if (milestone) shown.current = milestone;
  const ms = shown.current;

  const later = (fn, at) => { timers.current.push(setTimeout(fn, at)); };
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  const reset = () => {
    circleScale.setValue(0.06);
    fade.setValue(0);
    contentOpacity.setValue(0);
    contentScale.setValue(0.9);
  };

  // Close (once): play the exit, then hand off to onDone or onShare.
  const close = useCallback((then = 'done') => {
    if (closing.current) return;
    closing.current = true;
    clearTimers();
    const finish = () => {
      reset();
      if (then === 'share' && live.current.onShare) live.current.onShare();
      else live.current.onDone?.();
    };
    if (reduced) {
      m.timing(fade, { toValue: 0, duration: m.duration.reduced }).start(finish);
      return;
    }
    Animated.parallel([
      Animated.timing(contentOpacity, { toValue: 0, duration: celebration.tapTextOut, useNativeDriver: true }),
      Animated.timing(circleScale, { toValue: 0.06, duration: celebration.tapCircleCollapse, useNativeDriver: true }),
    ]).start(finish);
  }, [reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  const skip = useCallback(() => { if (canSkip) close(); }, [canSkip, close]);

  useEffect(() => {
    if (!visible) { clearTimers(); setCanSkip(false); return undefined; }
    closing.current = false;
    setCanSkip(false);
    reset();
    later(() => setCanSkip(true), celebration.milestoneSkipAfter);
    if (ms) announce(`${t('today.milestone.streak', { count: ms.days })}. ${t('today.milestone.subtitle', { label: ms.label })}`);
    // A screen-reader user needs the time to reach Share: no auto-dismiss for them.
    if (!hold) {
      AccessibilityInfo.isScreenReaderEnabled().catch(() => false).then((sr) => {
        if (!sr && !closing.current) later(() => close(), celebration.autoDismissAt);
      });
    }

    if (reduced) {
      fade.setValue(0);
      contentOpacity.setValue(1);
      contentScale.setValue(1);
      m.timing(fade, { toValue: 1, duration: m.duration.reduced }).start();
      return clearTimers;
    }

    fade.setValue(1);
    let on = true;
    // Grow the ground from the ring, once both are measured (one frame).
    Promise.all([measureNode(rootRef.current), measureAnchor(originKey)]).then(([root, ring]) => {
      if (!on) return;
      const c = centreOf(relativeTo(ring, root));
      if (c) { originX.setValue(c.x); originY.setValue(c.y); }
      Animated.timing(circleScale, { toValue: 1, duration: celebration.circleExpand, useNativeDriver: true }).start();
    });
    later(() => {
      Animated.parallel([
        Animated.spring(contentScale, { toValue: 1, useNativeDriver: true, ...spring.celebrate }),
        Animated.timing(contentOpacity, { toValue: 1, duration: celebration.textIn, useNativeDriver: true }),
      ]).start();
    }, celebration.textInAt);
    return () => { on = false; clearTimers(); };
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearTimers(), []);

  // Accessibility focus on the headline once the content is up (autoFocus does not fire in an
  // Android Modal).
  const onShow = useCallback(() => {
    later(() => {
      try {
        const node = focusRef.current && findNodeHandle(focusRef.current);
        if (node) AccessibilityInfo.setAccessibilityFocus(node);
      } catch (_) { /* web */ }
    }, reduced ? m.duration.reduced : celebration.textInAt);
  }, [reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible || !ms) return null;

  const streakLabel = t('today.milestone.streak', { count: ms.days });
  const subtitle = t('today.milestone.subtitle', { label: ms.label });
  const confetti = theme.celebration || [];

  return (
    <OverlayModal
      visible
      transparent
      heavyScrim
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={skip}
      onShow={onShow}
    >
      <Animated.View
        ref={rootRef}
        collapsable={false}
        style={[StyleSheet.absoluteFill, { opacity: fade }, reduced && { backgroundColor: theme.brandGround }]}
        accessibilityViewIsModal
        onAccessibilityEscape={skip}
      >
        {!reduced && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.circle,
              {
                backgroundColor: theme.brandGround,
                left: -CIRCLE_D / 2,
                top: -CIRCLE_D / 2,
                transform: [{ translateX: originX }, { translateY: originY }, { scale: circleScale }],
              },
            ]}
          />
        )}
        {!reduced && confetti.length > 0 && Array.from({ length: CONFETTI_COUNT }).map((_, i) => (
          <ConfettiPiece key={i} index={i} color={confetti[i % confetti.length]} />
        ))}

        {/* A tap anywhere closes it (after 1 s); hidden from screen readers, which get the
            "Tap to continue" button and the escape gesture instead. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={skip}
          importantForAccessibility="no"
          accessibilityElementsHidden
          testID="milestone-backdrop"
        />

        <Animated.View
          pointerEvents="box-none"
          style={[styles.content, { opacity: contentOpacity, transform: [{ scale: contentScale }] }]}
        >
          <View style={[styles.disc, { backgroundColor: theme.brandGroundCta }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Ionicons name={ms.icon || 'flame'} size={36} color={theme.onBrandGroundCta} />
          </View>
          <View ref={focusRef} accessible accessibilityRole="header" accessibilityLabel={`${streakLabel}. ${subtitle}`} style={styles.textBlock}>
            <AppText variant="display" style={[HERO, styles.center, { color: theme.onBrandGround }]}>{ms.days}</AppText>
            <AppText variant="headline" style={[styles.center, { color: theme.onBrandGround }]}>{t('today.milestone.unit', { count: ms.days })}</AppText>
            <AppText variant="body" style={[styles.center, styles.subtitle, { color: theme.onBrandGroundSecondary }]}>{subtitle}</AppText>
          </View>
          {onShare ? (
            <PressableScale
              onPress={() => close('share')}
              style={[styles.share, { backgroundColor: theme.brandGroundCta }]}
              accessibilityLabel={t('today.milestone.share')}
              testID="milestone-share"
            >
              <Ionicons name="share-outline" size={20} color={theme.onBrandGroundCta} />
              <AppText variant="bodyStrong" style={{ color: theme.onBrandGroundCta }}>{t('today.milestone.share')}</AppText>
            </PressableScale>
          ) : null}
          <Pressable
            onPress={skip}
            accessibilityRole="button"
            accessibilityLabel={t('today.milestone.continue')}
            accessibilityState={{ disabled: !canSkip }}
            hitSlop={space.sm}
            style={styles.continue}
          >
            <AppText variant="footnote" style={[{ color: theme.onBrandGroundSecondary }, !canSkip && styles.hidden]}>
              {t('today.milestone.continue')}
            </AppText>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </OverlayModal>
  );
}

const styles = StyleSheet.create({
  circle: { position: 'absolute', width: CIRCLE_D, height: CIRCLE_D, borderRadius: CIRCLE_D / 2 },
  confettiSquare: { position: 'absolute', width: 9, height: 9, borderRadius: radius.cell, top: 0, left: 0 },
  confettiWide: { position: 'absolute', width: 14, height: 6, borderRadius: radius.cell, top: 0, left: 0 },
  content: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  disc: { width: DISC, height: DISC, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginBottom: space.md },
  textBlock: { alignItems: 'center' },
  center: { textAlign: 'center' },
  subtitle: { marginTop: space.sm, maxWidth: 320 },
  share: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs,
    minHeight: 48, borderRadius: radius.pill, paddingHorizontal: space.lg, marginTop: space.xl,
  },
  continue: { marginTop: space.lg, paddingVertical: space.xs, paddingHorizontal: space.md },
  hidden: { opacity: 0 },
});
