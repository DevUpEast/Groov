import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Animated, StyleSheet, Text, Modal, Pressable } from 'react-native';
import CelebrationOverlay from './CelebrationOverlay';
import { heavyImpact, mediumImpact } from '../utils/haptics';
import { useReducedMotion, announce } from '../utils/a11y';
import { t } from '../i18n';

// A tap (or the Android back key) dismisses the trophy once it has been up this long (CEL-2).
export const TROPHY_SKIP_AFTER_MS = 1000;
// Spring + orbit (600 + 1400 ms) + confetti hold (3500 ms), plus a margin.
export const TROPHY_FALLBACK_MS = 600 + 1400 + 3500 + 500;

// The trophy is a root Modal, so its scrim covers the tab bar and the back key reaches it
// (it used to be an absolute overlay inside the Today pager slot).
export default function TrophyCelebration({ visible, onDone, theme }) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const orbitAnim = useRef(new Animated.Value(0)).current;
  const [showConfetti, setShowConfetti] = useState(false);
  const [canSkip, setCanSkip] = useState(false);
  const reducedMotion = useReducedMotion();
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
    later(() => setCanSkip(true), TROPHY_SKIP_AFTER_MS);
    // Fallback: the normal auto-dismiss is scheduled when the orbit animation finishes, so an
    // interrupted animation would leave the trophy up. This closes it a little after that path.
    later(finish, TROPHY_FALLBACK_MS);

    if (reducedMotion) {
      scaleAnim.setValue(1);
      heavyImpact();
      later(finish, 2000);
      return clearTimers;
    }

    Animated.spring(scaleAnim, {
      toValue: 1, useNativeDriver: true, tension: 60, friction: 7,
    }).start();

    later(() => {
      Animated.timing(orbitAnim, {
        toValue: 1, duration: 1400, useNativeDriver: true,
      }).start(({ finished: done }) => {
        if (done && !finished.current) {
          setShowConfetti(true);
          heavyImpact();
          later(() => mediumImpact(), 200);
          later(finish, 3500);
        }
      });
    }, 600);
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
    <Modal
      visible
      transparent
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
              { backgroundColor: theme.primary, transform: [{ translateX: orbitX }, { translateY: orbitY }] },
            ]} />}
            <Animated.Text style={[styles.emoji, { transform: [{ scale: scaleAnim }] }]}>🏆</Animated.Text>
          </View>
          <Text style={[styles.hint, { color: theme.onCelebration }, !canSkip && styles.hintHidden]}>{t('trophy.tapToContinue')}</Text>
        </View>
        {showConfetti && <CelebrationOverlay visible={true} onDone={() => {}} />}
      </Pressable>
    </Modal>
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
});
