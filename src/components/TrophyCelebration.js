import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Animated, StyleSheet, Text, Pressable, Dimensions } from 'react-native';
import feedback, { EVENTS } from '../services/feedback';
import { announce } from '../utils/a11y';
import { useMotion, celebration, spring } from '../theme/motion';
import { t } from '../i18n';
import OverlayModal from './ui/OverlayModal';
import { celebrationArt } from '../theme/tokens';

// The trophy's confetti (moved here from CelebrationOverlay in C-07, when the perfect-day
// confetti gave way to the credit flight and RingBurst). Full motion only: the trophy shows
// it after the orbit, which reduced motion skips.
const { width, height } = Dimensions.get('window');
const CONFETTI_COLORS = celebrationArt.confettiPerfectDay;
const CONFETTI_COUNT = 30;

function ConfettiPiece({ delay, color }) {
  const x = useRef(new Animated.Value(Math.random() * width)).current;
  const y = useRef(new Animated.Value(-20)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(Math.random() * 0.6 + 0.4)).current;

  useEffect(() => {
    const targetX = (Math.random() - 0.5) * 300 + parseFloat(JSON.stringify(x));
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: celebration.confettiFadeIn, useNativeDriver: true }),
        Animated.timing(y, {
          toValue: height * 0.7,
          duration: celebration.confettiFall + Math.random() * celebration.confettiFallJitter,
          useNativeDriver: true,
        }),
        Animated.timing(x, {
          toValue: targetX,
          duration: celebration.confettiFall + Math.random() * celebration.confettiFallJitter,
          useNativeDriver: true,
        }),
        Animated.timing(rotate, {
          toValue: Math.random() * 4 - 2,
          duration: celebration.confettiFall,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(celebration.confettiFadeOutAt),
          Animated.timing(opacity, { toValue: 0, duration: celebration.confettiFadeOut, useNativeDriver: true }),
        ]),
      ]),
    ]).start();
  }, []);

  const spin = rotate.interpolate({ inputRange: [-2, 2], outputRange: ['-360deg', '360deg'] });

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          backgroundColor: color,
          transform: [{ translateX: x }, { translateY: y }, { rotate: spin }, { scale }],
          opacity,
        },
      ]}
    />
  );
}

function TrophyConfetti() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: CONFETTI_COUNT }).map((_, i) => (
        <ConfettiPiece key={i} delay={Math.random() * celebration.confettiSpread} color={CONFETTI_COLORS[i % CONFETTI_COLORS.length]} />
      ))}
    </View>
  );
}


// A tap (or the Android back key) dismisses the trophy once it has been up this long (CEL-2).
export const TROPHY_SKIP_AFTER_MS = 1000;
// Spring + orbit (600 + 1400 ms) + confetti hold (3500 ms), plus a margin.
export const TROPHY_FALLBACK_MS = celebration.trophyOrbitAt + celebration.trophyOrbit + celebration.trophyHoldAfterOrbit + 500;

// The trophy is a root Modal, so its scrim covers the tab bar and the back key reaches it
// (it used to be an absolute overlay inside the Today pager slot).
export default function TrophyCelebration({ visible, onDone, theme }) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const orbitAnim = useRef(new Animated.Value(0)).current;
  const [showConfetti, setShowConfetti] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const { reduced: reducedMotion } = useMotion();
  const timers = useRef([]);
  const finished = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)); };
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  // Runs at most once per showing, whether the 3.5 s timer or a tap gets there first.
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    clearTimers();
    orbitAnim.stopAnimation();
    scaleAnim.stopAnimation();
    onDoneRef.current?.();
  }, [orbitAnim, scaleAnim]);

  useEffect(() => {
    if (!visible) {
      clearTimers();
      scaleAnim.setValue(0);
      orbitAnim.setValue(0);
      setShowConfetti(false);
      setCanSkip(false);
      return undefined;
    }
    finished.current = false;
    announce(t('trophy.announce'));
    // The trophy beat (haptic + fanfare) lands as the screen starts, in both motion modes.
    feedback.play(EVENTS.trophy);
    later(() => setCanSkip(true), TROPHY_SKIP_AFTER_MS);
    // Fallback: the normal auto-dismiss is scheduled when the orbit animation finishes, so an
    // interrupted animation would leave the trophy up. This closes it a little after that path.
    later(finish, TROPHY_FALLBACK_MS);

    if (reducedMotion) {
      scaleAnim.setValue(1);
      later(finish, celebration.trophyStaticHold);
      return clearTimers;
    }

    Animated.spring(scaleAnim, {
      toValue: 1, useNativeDriver: true, ...spring.celebrate,
    }).start();

    later(() => {
      Animated.timing(orbitAnim, {
        toValue: 1, duration: celebration.trophyOrbit, useNativeDriver: true,
      }).start(({ finished: done }) => {
        if (done && !finished.current) {
          setShowConfetti(true);
          later(finish, celebration.trophyHoldAfterOrbit);
        }
      });
    }, celebration.trophyOrbitAt);
    return clearTimers;
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const skip = () => { if (canSkip) finish(); };

  if (!visible) return null;

  const orbitX = orbitAnim.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, 70, 0, -70, 0],
  });
  const orbitY = orbitAnim.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [-70, 0, 70, 0, -70],
  });

  return (
    <OverlayModal
      visible
      transparent
      heavyScrim
      animationType={reducedMotion ? 'none' : 'fade'}
      statusBarTranslucent
      onRequestClose={skip}
    >
      <Pressable
        style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: theme.celebrationScrim }]}
        onPress={skip}
        accessibilityRole="button"
        accessibilityLabel={t('trophy.a11y')}
        accessibilityHint={canSkip ? t('trophy.tapToContinue') : undefined}
      >
        {/* The hint sits in the same column as the trophy, directly under it, so it stays in
            the middle of the screen and clear of the Undo toast at the bottom. */}
        <View style={styles.column}>
          <View style={styles.center}>
            {!reducedMotion && <Animated.View style={[
              styles.orbitDot,
              { backgroundColor: theme.meter, transform: [{ translateX: orbitX }, { translateY: orbitY }] },
            ]} />}
            <Animated.Text style={[styles.emoji, { transform: [{ scale: scaleAnim }] }]}>🏆</Animated.Text>
          </View>
          <Text style={[styles.hint, { color: theme.onCelebration }, !canSkip && styles.hintHidden]}>{t('trophy.tapToContinue')}</Text>
        </View>
        {showConfetti && <TrophyConfetti />}
      </Pressable>
    </OverlayModal>
  );
}

const styles = StyleSheet.create({
  overlay: { alignItems: 'center', justifyContent: 'center' },
  column: { alignItems: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', width: 160, height: 160 },
  emoji: { fontSize: 80 },
  orbitDot: { position: 'absolute', width: 14, height: 14, borderRadius: 7 },
  hint: { marginTop: 24, fontSize: 15, fontWeight: '600', opacity: 0.85 },
  hintHidden: { opacity: 0 },
  particle: { position: 'absolute', width: 10, height: 10, borderRadius: 2, top: 0, left: 0 },
});
