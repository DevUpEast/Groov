import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';
import { useMotion, celebration } from '../theme/motion';
import { celebrationArt } from '../theme/tokens';

const { width, height } = Dimensions.get('window');
const COLORS = celebrationArt.confettiPerfectDay;
const PARTICLE_COUNT = 30;

function Particle({ delay, color }) {
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

export default function CelebrationOverlay({ visible, onDone }) {
  const { reduced: reducedMotion } = useMotion();
  useEffect(() => {
    if (visible) {
      const t = setTimeout(onDone, reducedMotion ? celebration.overlayDoneReduced : celebration.overlayDone);
      return () => clearTimeout(t);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reduce motion: no particles at all; the haptic/sound already marks the moment.
  if (!visible || reducedMotion) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
        <Particle
          key={i}
          delay={Math.random() * celebration.confettiSpread}
          color={COLORS[i % COLORS.length]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  particle: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 2,
    top: 0,
    left: 0,
  },
});
