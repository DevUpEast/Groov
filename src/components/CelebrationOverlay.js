import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';
import { useReducedMotion } from '../utils/a11y';

const { width, height } = Dimensions.get('window');
const COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];
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
        Animated.timing(opacity, { toValue: 1, duration: 100, useNativeDriver: true }),
        Animated.timing(y, {
          toValue: height * 0.7,
          duration: 2000 + Math.random() * 1000,
          useNativeDriver: true,
        }),
        Animated.timing(x, {
          toValue: targetX,
          duration: 2000 + Math.random() * 1000,
          useNativeDriver: true,
        }),
        Animated.timing(rotate, {
          toValue: Math.random() * 4 - 2,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(1500),
          Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
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
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (visible) {
      const t = setTimeout(onDone, reducedMotion ? 300 : 3000);
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
          delay={Math.random() * 600}
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
