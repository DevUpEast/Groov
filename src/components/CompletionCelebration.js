import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Animated, Dimensions, TouchableOpacity, BackHandler,
} from 'react-native';
import { measureNode, measureAnchor, relativeTo, centreOf } from '../utils/creditAnchors';
import { announce } from '../utils/a11y';
import { useMotion, celebration, spring } from '../theme/motion';
import { celebrationArt, space, radius } from '../theme/tokens';
import { t } from '../i18n';

const { width: W, height: H } = Dimensions.get('window');

// Large enough circle to cover every corner from the ring's approximate center
const CIRCLE_D = Math.ceil(Math.sqrt(W * W + H * H) * 2.2);
// Where the circle grows from when the ring cannot be measured (C-07: it is measured, from
// `originKey`, the ring that is showing).
const RING_CX = 79;
const RING_CY = 190;

const CONFETTI_COLORS = celebrationArt.confettiMilestone;
const CONFETTI_COUNT = 60;

function ConfettiPiece({ index, color }) {
  const startX = (Math.random() * W * 1.2) - W * 0.1;
  const x = useRef(new Animated.Value(startX)).current;
  const y = useRef(new Animated.Value(-30)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(Math.random() * 0.7 + 0.5)).current;
  const delay = index * 35 + Math.random() * 200;
  const duration = celebration.fullConfettiFall + Math.random() * celebration.fullConfettiFallJitter;
  const isWide = Math.random() > 0.5;

  useEffect(() => {
    const driftX = startX + (Math.random() - 0.5) * 120;
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(y, { toValue: H + 40, duration, useNativeDriver: true }),
        Animated.timing(x, { toValue: driftX, duration, useNativeDriver: true }),
        Animated.timing(rotate, {
          toValue: (Math.random() > 0.5 ? 1 : -1) * (Math.random() * 6 + 3),
          duration,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(duration * 0.7),
          Animated.timing(opacity, { toValue: 0, duration: duration * 0.3, useNativeDriver: true }),
        ]),
      ]),
    ]).start();
  }, []);

  const spin = rotate.interpolate({ inputRange: [-10, 10], outputRange: ['-3600deg', '3600deg'] });

  return (
    <Animated.View
      style={[
        isWide ? styles.confettiWide : styles.confettiSquare,
        { backgroundColor: color, transform: [{ translateX: x }, { translateY: y }, { rotate: spin }, { scale }], opacity },
      ]}
    />
  );
}

/**
 * The streak-milestone screen (§4.1 row 9). It sits inside the Today screen (not a Modal), so
 * it takes the Android back key itself while it is up (S-03 carry): back, like a tap, closes it
 * once it has been up `celebration.milestoneSkipAfter` (1 s) and is swallowed before that. The
 * circle grows from the measured centre of `originKey` (C-07: the strip ring, or the sticky
 * ring when scrolled), not a fixed point.
 */
export default function CompletionCelebration({ visible, onDone, primaryColor, emoji = '🎉', title = t('today.congrats'), subtitle = t('today.allTasks'), originKey = 'ring' }) {
  const circleScale = useRef(new Animated.Value(0.06)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textScale = useRef(new Animated.Value(0.8)).current;
  const originX = useRef(new Animated.Value(RING_CX)).current;
  const originY = useRef(new Animated.Value(RING_CY)).current;
  const rootRef = useRef(null);
  const { reduced: reducedMotion } = useMotion();
  const [canSkip, setCanSkip] = useState(false);
  const canSkipRef = useRef(false);
  canSkipRef.current = canSkip;
  const skipRef = useRef(null);

  useEffect(() => {
    if (!visible) { setCanSkip(false); return undefined; }
    const skipTimer = setTimeout(() => setCanSkip(true), celebration.milestoneSkipAfter);
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canSkipRef.current) skipRef.current?.();
      return true;
    });
    return () => { clearTimeout(skipTimer); sub.remove(); };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    announce(`${title} ${subtitle}`);
    if (reducedMotion) {
      // Static card instead of the expanding circle and confetti.
      const t = setTimeout(onDone, celebration.staticHold);
      return () => clearTimeout(t);
    }

    // Expand the circle from the ring, once it is measured (one frame).
    let live = true;
    Promise.all([measureNode(rootRef.current), measureAnchor(originKey)]).then(([root, ring]) => {
      if (!live) return;
      const c = centreOf(relativeTo(ring, root));
      if (c) { originX.setValue(c.x); originY.setValue(c.y); }
      Animated.timing(circleScale, {
        toValue: 1,
        duration: celebration.circleExpand,
        useNativeDriver: true,
      }).start();
    });

    // Text springs in after circle covers screen
    setTimeout(() => {
      Animated.parallel([
        Animated.spring(textScale, { toValue: 1, useNativeDriver: true, ...spring.celebrate }),
        Animated.timing(textOpacity, { toValue: 1, duration: celebration.textIn, useNativeDriver: true }),
      ]).start();
    }, celebration.textInAt);

    // Auto-dismiss after 3.8 seconds
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 0, duration: celebration.textOut, useNativeDriver: true }),
        Animated.timing(circleScale, { toValue: 0.06, duration: celebration.circleCollapse, useNativeDriver: true }),
      ]).start(() => {
        circleScale.setValue(0.06);
        textOpacity.setValue(0);
        textScale.setValue(0.8);
        onDone();
      });
    }, celebration.autoDismissAt);

    return () => { live = false; clearTimeout(t); };
  }, [visible]);

  if (!visible) return null;

  if (reducedMotion) {
    skipRef.current = onDone;
    return (
      <TouchableOpacity style={[StyleSheet.absoluteFill, styles.staticWrap]} onPress={() => { if (canSkip) onDone(); }} activeOpacity={1} accessibilityRole="button" accessibilityLabel={t('celebration.a11y', { title, subtitle })}>
        <View style={[styles.staticCard, { backgroundColor: primaryColor }]}>
          <Text style={styles.emoji}>{emoji}</Text>
          <Text style={styles.congrats}>{title}</Text>
          <Text style={styles.subText}>{subtitle}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(textOpacity, { toValue: 0, duration: celebration.tapTextOut, useNativeDriver: true }),
      Animated.timing(circleScale, { toValue: 0.06, duration: celebration.tapCircleCollapse, useNativeDriver: true }),
    ]).start(() => {
      circleScale.setValue(0.06);
      textOpacity.setValue(0);
      textScale.setValue(0.8);
      onDone();
    });
  };
  skipRef.current = dismiss;

  return (
    <View ref={rootRef} collapsable={false} style={StyleSheet.absoluteFill} pointerEvents="box-none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* Expanding circle, centred on the measured ring */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.expandCircle,
          {
            backgroundColor: primaryColor,
            left: -CIRCLE_D / 2,
            top: -CIRCLE_D / 2,
            transform: [{ translateX: originX }, { translateY: originY }, { scale: circleScale }],
          },
        ]}
      />

      {/* Confetti rain — starts immediately */}
      {Array.from({ length: CONFETTI_COUNT }).map((_, i) => (
        <ConfettiPiece
          key={i}
          index={i}
          color={CONFETTI_COLORS[i % CONFETTI_COLORS.length]}
        />
      ))}

      {/* Congrats text */}
      <Animated.View
        pointerEvents="none"
        style={[styles.textContainer, { opacity: textOpacity, transform: [{ scale: textScale }] }]}
      >
        <Text style={styles.emoji}>{emoji}</Text>
        <Text style={styles.congrats}>{title}</Text>
        <Text style={styles.subText}>{subtitle}</Text>
      </Animated.View>

      {/* Tap to dismiss */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        onPress={() => { if (canSkip) dismiss(); }}
        activeOpacity={1}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  staticWrap: { alignItems: 'center', justifyContent: 'center', backgroundColor: celebrationArt.staticScrim },
  staticCard: { borderRadius: radius.sheet, paddingVertical: space.xl, paddingHorizontal: space.lg, alignItems: 'center', width: '85%' },
  expandCircle: {
    position: 'absolute',
    width: CIRCLE_D,
    height: CIRCLE_D,
    borderRadius: CIRCLE_D / 2,
  },
  confettiSquare: {
    position: 'absolute',
    width: 9,
    height: 9,
    borderRadius: radius.cell,
    top: 0,
    left: 0,
  },
  confettiWide: {
    position: 'absolute',
    width: 14,
    height: 6,
    borderRadius: radius.cell,
    top: 0,
    left: 0,
  },
  textContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 72, marginBottom: space.md },
  congrats: {
    fontSize: 42, fontWeight: 'bold', color: celebrationArt.title,
    textShadowColor: celebrationArt.titleShadow, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8,
  },
  subText: {
    fontSize: 18, color: celebrationArt.subtitle, marginTop: space.sm,
    textAlign: 'center', paddingHorizontal: 40, lineHeight: 26,
    fontWeight: '500',
  },
});
