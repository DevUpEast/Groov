import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Keyboard,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import SafeAreaView from '../components/SafeAreaView';
import { useApp } from '../context/AppContext';
import { lightImpact, mediumImpact } from '../utils/haptics';
import { STARTER_HABITS } from '../utils/habits';

// First-run flow: two intro slides, pick starter habits, then an implementation
// intention ("after X, I will Y") per habit. Finishing creates the habits and the
// 3-Day Kickstart challenge the last slide promises.

const INTRO = [
  {
    emoji: '🌱',
    title: 'Build habits that stick',
    body: 'Track daily habits and volume goals. Every check-in brings you closer to the life you want.',
  },
  {
    emoji: '🔥',
    title: 'Streaks that forgive',
    body: 'Complete your habits to grow a streak. Rest days, skips and two monthly freezes keep one bad day from wiping it out.',
  },
];

export { STARTER_HABITS };
const DEFAULT_PICK = ['water', 'move', 'read'];
const MAX_PICK = 5;

const TIME_CHIPS = [
  { value: 'morning', label: '🌅 Morning' },
  { value: 'afternoon', label: '☀️ Afternoon' },
  { value: 'evening', label: '🌙 Evening' },
  { value: 'anytime', label: 'Anytime' },
];

export default function OnboardingScreen() {
  const { completeOnboarding, theme, settings } = useApp();
  const [step, setStep] = useState(0); // 0,1 intro · 2 pick · 3 intentions
  const [picked, setPicked] = useState(DEFAULT_PICK);
  const [plans, setPlans] = useState({}); // key -> { timeOfDay, intention }

  const haptic = () => { if (settings?.hapticsEnabled !== false) lightImpact(); };

  const togglePick = (key) => {
    haptic();
    setPicked(p => (p.includes(key) ? p.filter(k => k !== key) : p.length >= MAX_PICK ? p : [...p, key]));
  };

  const chosen = useMemo(() => STARTER_HABITS.filter(h => picked.includes(h.key)), [picked]);

  const finish = (withHabits) => {
    if (settings?.hapticsEnabled !== false) mediumImpact();
    const habits = withHabits
      ? chosen.map(h => {
          const plan = plans[h.key] || {};
          const { key, ...rest } = h;
          return { ...rest, timeOfDay: plan.timeOfDay ?? h.timeOfDay, intention: (plan.intention || '').trim() || null };
        })
      : [];
    completeOnboarding(habits);
  };

  const totalSteps = 4;
  const dots = (
    <View style={styles.dots} accessibilityLabel={`Step ${step + 1} of ${totalSteps}`}>
      {Array.from({ length: totalSteps }).map((_, i) => (
        <View key={i} style={[styles.dot, { backgroundColor: i === step ? '#fff' : 'rgba(255,255,255,0.4)' }, i === step && styles.dotActive]} />
      ))}
    </View>
  );

  // ── Intro slides ────────────────────────────────────────────────────────────
  if (step < 2) {
    const s = INTRO[step];
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.primary }]}>
        <View style={styles.container}>
          {dots}
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <Text style={styles.emoji}>{s.emoji}</Text>
            <Text style={[styles.title, { color: theme.text }]}>{s.title}</Text>
            <Text style={[styles.body, { color: theme.textMuted }]}>{s.body}</Text>
          </View>
          <TouchableOpacity style={styles.btn} onPress={() => { haptic(); setStep(step + 1); }} accessibilityRole="button">
            <Text style={[styles.btnText, { color: theme.primary }]}>Next</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => finish(false)} style={styles.skipBtn} accessibilityRole="button" accessibilityLabel="Skip onboarding">
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Pick starter habits ─────────────────────────────────────────────────────
  if (step === 2) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.primary }]}>
        <View style={styles.container}>
          {dots}
          <View style={[styles.card, styles.cardWide, { backgroundColor: theme.surface }]}>
            <Text style={[styles.title, { color: theme.text }]}>Pick your first habits</Text>
            <Text style={[styles.body, { color: theme.textMuted, marginBottom: 16 }]}>
              Start small. Two or three is plenty, you can add more any time.
            </Text>
            <ScrollView style={{ alignSelf: 'stretch', maxHeight: 340 }} showsVerticalScrollIndicator={false}>
              {STARTER_HABITS.map(h => {
                const on = picked.includes(h.key);
                return (
                  <TouchableOpacity
                    key={h.key}
                    style={[styles.pickRow, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primaryLight : theme.bg }]}
                    onPress={() => togglePick(h.key)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={h.name}
                  >
                    <Text style={styles.pickIcon}>{h.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickName, { color: theme.text }]}>{h.name}</Text>
                      <Text style={[styles.pickSub, { color: theme.textMuted }]}>
                        {h.type === 'volume' ? `${h.volumeGoal} ${h.unit} a day` : 'Once a day'}
                      </Text>
                    </View>
                    <View style={[styles.check, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary : 'transparent' }]}>
                      {on && <Text style={styles.checkMark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <Text style={[styles.counter, { color: theme.textMuted }]}>{picked.length} of {MAX_PICK} selected</Text>
          </View>
          <TouchableOpacity
            style={[styles.btn, { opacity: picked.length === 0 ? 0.6 : 1 }]}
            onPress={() => { haptic(); picked.length === 0 ? finish(false) : setStep(3); }}
            accessibilityRole="button"
          >
            <Text style={[styles.btnText, { color: theme.primary }]}>{picked.length === 0 ? 'Start empty' : 'Next'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { haptic(); setStep(1); }} style={styles.skipBtn} accessibilityRole="button">
            <Text style={styles.skipText}>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Implementation intentions ───────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.primary }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.container}>
          {dots}
          <View style={[styles.card, styles.cardWide, { backgroundColor: theme.surface }]}>
            <Text style={[styles.title, { color: theme.text }]}>When and where?</Text>
            <Text style={[styles.body, { color: theme.textMuted, marginBottom: 12 }]}>
              Habits with a plan are 2-3× more likely to stick. Finish the sentence for each one.
            </Text>
            <ScrollView style={{ alignSelf: 'stretch', maxHeight: 360 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {chosen.map(h => {
                const plan = plans[h.key] || {};
                const tod = plan.timeOfDay ?? h.timeOfDay;
                return (
                  <View key={h.key} style={[styles.planBlock, { borderColor: theme.border, backgroundColor: theme.bg }]}>
                    <Text style={[styles.planName, { color: theme.text }]}>{h.icon} {h.name}</Text>
                    <View style={styles.chipRow}>
                      {TIME_CHIPS.map(c => {
                        const on = tod === c.value;
                        return (
                          <TouchableOpacity
                            key={c.value}
                            style={[styles.chip, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primaryLight : 'transparent' }]}
                            onPress={() => { haptic(); setPlans(p => ({ ...p, [h.key]: { ...p[h.key], timeOfDay: c.value } })); }}
                            accessibilityRole="button"
                            accessibilityState={{ selected: on }}
                          >
                            <Text style={[styles.chipText, { color: on ? theme.primary : theme.textMuted }]}>{c.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <TextInput
                      style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
                      placeholder="After I… (e.g. make coffee, in the kitchen)"
                      placeholderTextColor={theme.textMuted}
                      value={plan.intention ?? ''}
                      onChangeText={t => setPlans(p => ({ ...p, [h.key]: { ...p[h.key], intention: t } }))}
                      maxLength={80}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                      accessibilityLabel={`Plan for ${h.name}`}
                    />
                  </View>
                );
              })}
            </ScrollView>
          </View>
          <TouchableOpacity style={styles.btn} onPress={() => finish(true)} accessibilityRole="button">
            <Text style={[styles.btnText, { color: theme.primary }]}>Start my 3-Day Kickstart 🚀</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { haptic(); setStep(2); }} style={styles.skipBtn} accessibilityRole="button">
            <Text style={styles.skipText}>Back</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dots: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { width: 24 },
  card: {
    borderRadius: 24, padding: 28, alignItems: 'center', width: '100%', maxWidth: 420, marginBottom: 20,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, elevation: 8,
  },
  cardWide: { padding: 20, alignItems: 'stretch' },
  emoji: { fontSize: 64, marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  body: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  btn: { width: '100%', maxWidth: 420, padding: 16, borderRadius: 16, alignItems: 'center', backgroundColor: '#fff' },
  btnText: { fontSize: 17, fontWeight: '700' },
  skipBtn: { marginTop: 12, padding: 8 },
  skipText: { fontSize: 15, color: 'rgba(255,255,255,0.75)' },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 12, padding: 12, marginBottom: 8 },
  pickIcon: { fontSize: 24 },
  pickName: { fontSize: 15, fontWeight: '600' },
  pickSub: { fontSize: 12, marginTop: 1 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  counter: { fontSize: 12, textAlign: 'center', marginTop: 8 },
  planBlock: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  planName: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1.5 },
  chipText: { fontSize: 12, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
});
