import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, Dimensions, TouchableOpacity,
} from 'react-native';
import { useReducedMotion, announce } from '../utils/a11y';
import { t } from '../i18n';

const { width: W, height: H } = Dimensions.get('window');

// Large enough circle to cover every corner from the ring's approximate center
const CIRCLE_D = Math.ceil(Math.sqrt(W * W + H * H) * 2.2);
// Ring sits in the header: ~79px from left, ~190px from top of screen
const RING_CX = 79;
const RING_CY = 190;

const CONFETTI_COLORS = [
  '#818CF8', '#A78BFA', '#C4B5FD', '#E879F9', '#34D399',
  '#FDE68A', '#FB923C', '#F472B6', '#60A5FA', '#FFFFFF',
];
const CONFETTI_COUNT = 60;

function ConfettiPiece({ index, color }) {
  const startX = (Math.random() * W * 1.2) - W * 0.1;
  const x = useRef(new Animated.Value(startX)).current;
  const y = useRef(new Animated.Value(-30)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(Math.random() * 0.7 + 0.5)).current;
  const delay = index * 35 + Math.random() * 200;
  const duration = 2000 + Math.random() * 1500;
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

export default function CompletionCelebration({ visible, onDone, primaryColor, emoji = '🎉', title = t('today.congrats'), subtitle = t('today.allTasks') }) {
  const circleScale = useRef(new Animated.Value(0.06)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textScale = useRef(new Animated.Value(0.8)).current;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!visible) return;
    announce(`${title} ${subtitle}`);
    if (reducedMotion) {
      // Static card instead of the expanding circle and confetti.
      const t = setTimeout(onDone, 2500);
      return () => clearTimeout(t);
    }

    // Expand the circle
    Animated.timing(circleScale, {
      toValue: 1,
      duration: 650,
      useNativeDriver: true,
    }).start();

    // Text springs in after circle covers screen
    setTimeout(() => {
      Animated.parallel([
        Animated.spring(textScale, { toValue: 1, useNativeDriver: true, tension: 60 }),
        Animated.timing(textOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]).start();
    }, 550);

    // Auto-dismiss after 3.8 seconds
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(circleScale, { toValue: 0.06, duration: 500, useNativeDriver: true }),
      ]).start(() => {
        circleScale.setValue(0.06);
        textOpacity.setValue(0);
        textScale.setValue(0.8);
        onDone();
      });
    }, 3800);

    return () => clearTimeout(t);
  }, [visible]);

  if (!visible) return null;

  if (reducedMotion) {
    return (
      <TouchableOpacity style={[StyleSheet.absoluteFill, styles.staticWrap]} onPress={onDone} activeOpacity={1} accessibilityRole="button" accessibilityLabel={t('celebration.a11y', { title, subtitle })}>
        <View style={[styles.staticCard, { backgroundColor: primaryColor }]}>
          <Text style={styles.emoji}>{emoji}</Text>
          <Text style={styles.congrats}>{title}</Text>
          <Text style={styles.subText}>{subtitle}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* Expanding circle */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.expandCircle,
          {
            backgroundColor: primaryColor,
            left: RING_CX - CIRCLE_D / 2,
            top: RING_CY - CIRCLE_D / 2,
            transform: [{ scale: circleScale }],
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
        onPress={() => {
          Animated.parallel([
            Animated.timing(textOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
            Animated.timing(circleScale, { toValue: 0.06, duration: 400, useNativeDriver: true }),
          ]).start(() => {
            circleScale.setValue(0.06);
            textOpacity.setValue(0);
            textScale.setValue(0.8);
            onDone();
          });
        }}
        activeOpacity={1}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  staticWrap: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  staticCard: { borderRadius: 24, paddingVertical: 32, paddingHorizontal: 24, alignItems: 'center', width: '85%' },
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
    borderRadius: 2,
    top: 0,
    left: 0,
  },
  confettiWide: {
    position: 'absolute',
    width: 14,
    height: 6,
    borderRadius: 2,
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
  emoji: { fontSize: 72, marginBottom: 16 },
  congrats: {
    fontSize: 42, fontWeight: 'bold', color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.15)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8,
  },
  subText: {
    fontSize: 18, color: 'rgba(255,255,255,0.9)', marginTop: 12,
    textAlign: 'center', paddingHorizontal: 40, lineHeight: 26,
    fontWeight: '500',
  },
});
