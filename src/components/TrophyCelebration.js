import React, { useState, useRef, useEffect } from 'react';
import { View, Animated, StyleSheet, Text } from 'react-native';
import CelebrationOverlay from './CelebrationOverlay';
import { heavyImpact, mediumImpact } from '../utils/haptics';
import { useReducedMotion, announce } from '../utils/a11y';

export default function TrophyCelebration({ visible, onDone, settings, theme }) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const orbitAnim = useRef(new Animated.Value(0)).current;
  const [showConfetti, setShowConfetti] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!visible) {
      scaleAnim.setValue(0);
      orbitAnim.setValue(0);
      setShowConfetti(false);
      return;
    }
    announce('Challenge complete. Trophy earned.');
    if (reducedMotion) {
      scaleAnim.setValue(1);
      if (settings?.hapticsEnabled) heavyImpact();
      const t = setTimeout(onDone, 2000);
      return () => clearTimeout(t);
    }

    Animated.spring(scaleAnim, {
      toValue: 1, useNativeDriver: true, tension: 60, friction: 7,
    }).start();

    setTimeout(() => {
      Animated.timing(orbitAnim, {
        toValue: 1, duration: 1400, useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setShowConfetti(true);
          if (settings?.hapticsEnabled) {
            heavyImpact();
            setTimeout(() => mediumImpact(), 200);
          }
          setTimeout(onDone, 3500);
        }
      });
    }, 600);
  }, [visible]);

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
    <View style={[StyleSheet.absoluteFill, styles.overlay]} accessible accessibilityLabel="Challenge complete, trophy earned">
      <View style={styles.center}>
        {!reducedMotion && <Animated.View style={[
          styles.orbitDot,
          { backgroundColor: theme.primary, transform: [{ translateX: orbitX }, { translateY: orbitY }] },
        ]} />}
        <Animated.Text style={[styles.emoji, { transform: [{ scale: scaleAnim }] }]}>🏆</Animated.Text>
      </View>
      {showConfetti && <CelebrationOverlay visible={true} onDone={() => {}} />}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 999 },
  center: { alignItems: 'center', justifyContent: 'center', width: 160, height: 160 },
  emoji: { fontSize: 80 },
  orbitDot: { position: 'absolute', width: 14, height: 14, borderRadius: 7 },
});
