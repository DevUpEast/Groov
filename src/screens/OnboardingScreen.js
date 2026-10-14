import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    emoji: '🌱',
    title: 'Build habits that stick',
    body: 'Track daily habits and volume goals. Every check-in brings you closer to the life you want.',
  },
  {
    emoji: '🔥',
    title: 'Stay on a streak',
    body: 'Complete all your habits each day to build your streak. The longer the streak, the stronger the habit.',
  },
  {
    emoji: '🏆',
    title: 'Your first challenge',
    body: "Complete all habits for 3 days in a row to earn your first badge. Ready to start?",
  },
];

export default function OnboardingScreen() {
  const { completeOnboarding, theme } = useApp();
  const [slide, setSlide] = useState(0);

  const isLast = slide === SLIDES.length - 1;
  const s = SLIDES[slide];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.primary }]}>
      <View style={styles.container}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[
              styles.dot,
              { backgroundColor: i === slide ? '#fff' : 'rgba(255,255,255,0.4)' },
              i === slide && styles.dotActive,
            ]} />
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <Text style={styles.emoji}>{s.emoji}</Text>
          <Text style={[styles.title, { color: theme.text }]}>{s.title}</Text>
          <Text style={[styles.body, { color: theme.textMuted }]}>{s.body}</Text>
        </View>

        <TouchableOpacity
          style={styles.btn}
          onPress={() => isLast ? completeOnboarding() : setSlide(slide + 1)}
        >
          <Text style={[styles.btnText, { color: theme.primary }]}>{isLast ? "Let's go! 🚀" : 'Next'}</Text>
        </TouchableOpacity>

        {!isLast && (
          <TouchableOpacity onPress={completeOnboarding} style={styles.skipBtn}>
            <Text style={[styles.skipText, { color: 'rgba(255,255,255,0.6)' }]}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  dots: { flexDirection: 'row', gap: 8, marginBottom: 48 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { width: 24 },
  card: {
    borderRadius: 24,
    padding: 36,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  emoji: { fontSize: 64, marginBottom: 20 },
  title: { fontSize: 26, fontWeight: 'bold', textAlign: 'center', marginBottom: 12 },
  body: { fontSize: 16, textAlign: 'center', lineHeight: 24 },
  btn: {
    width: '100%',
    maxWidth: 400,
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  btnText: { fontSize: 17, fontWeight: '700', color: '#fff' },
  skipBtn: { marginTop: 16, padding: 8 },
  skipText: { fontSize: 15 },
});
