import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Keyboard,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { lightImpact, mediumImpact } from '../utils/haptics';
import { t, useLocale } from '../i18n';

// First-run flow: two intro slides, pick starter habits, then an implementation
// intention ("after X, I will Y") per habit. Finishing creates the habits and the
// 3-Day Kickstart challenge the last slide promises.

const INTRO = [
  { emoji: '🌱', key: 'stick' },
  { emoji: '🔥', key: 'streaks' },
];

// Names and units are translated on read (via `getStarterHabits`) so the picker
// follows the active locale; the stored habit keeps the name as created.
const STARTER_HABIT_DEFS = [
  { key: 'water', icon: '💧', type: 'volume', volumeGoal: 8, unitKey: 'unitGlasses', timeOfDay: 'anytime', color: '#3B82F6' },
  { key: 'move', icon: '🏃', type: 'daily', volumeGoal: 1, timeOfDay: 'morning', color: '#F97316' },
  { key: 'read', icon: '📚', type: 'daily', volumeGoal: 1, timeOfDay: 'evening', color: '#A855F7' },
  { key: 'meditate', icon: '🧘', type: 'daily', volumeGoal: 1, timeOfDay: 'morning', color: '#14B8A6' },
  { key: 'walk', icon: '🚶', type: 'daily', volumeGoal: 1, timeOfDay: 'afternoon', color: '#22C55E' },
  { key: 'sleep', icon: '😴', type: 'daily', volumeGoal: 1, timeOfDay: 'evening', color: '#6366F1' },
  { key: 'journal', icon: '✍️', type: 'daily', volumeGoal: 1, timeOfDay: 'evening', color: '#EC4899' },
  { key: 'stretch', icon: '🤸', type: 'daily', volumeGoal: 1, timeOfDay: 'morning', color: '#EAB308' },
];

export function getStarterHabits() {
  return STARTER_HABIT_DEFS.map(({ unitKey, ...d }) => ({
    ...d,
    name: t(`onboarding.starter.${d.key}`),
    ...(unitKey ? { unit: t(`onboarding.starter.${unitKey}`) } : {}),
  }));
}

export const STARTER_HABITS = STARTER_HABIT_DEFS.map(({ unitKey, ...d }) => ({
  ...d,
  get name() { return t(`onboarding.starter.${d.key}`); },
  ...(unitKey ? { get unit() { return t(`onboarding.starter.${unitKey}`); } } : {}),
}));
const DEFAULT_PICK = ['water', 'move', 'read'];
const MAX_PICK = 5;

const TIME_CHIPS = ['morning', 'afternoon', 'evening', 'anytime'];

export default function OnboardingScreen() {
  const { completeOnboarding, theme, settings } = useApp();
  const { locale } = useLocale();
  const [step, setStep] = useState(0); // 0,1 intro · 2 pick · 3 intentions
  const [picked, setPicked] = useState(DEFAULT_PICK);
  const [plans, setPlans] = useState({}); // key -> { timeOfDay, intention }

  const haptic = () => { if (settings?.hapticsEnabled !== false) lightImpact(); };

  const togglePick = (key) => {
    haptic();
    setPicked(p => (p.includes(key) ? p.filter(k => k !== key) : p.length >= MAX_PICK ? p : [...p, key]));
  };

  const starters = useMemo(() => getStarterHabits(), [locale]);
  const chosen = useMemo(() => starters.filter(h => picked.includes(h.key)), [picked, starters]);

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
    <View style={styles.dots} accessibilityLabel={t('onboarding.stepA11y', { step: step + 1, total: totalSteps })}>
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
            <Text style={[styles.title, { color: theme.text }]}>{t(`onboarding.intro.${s.key}.title`)}</Text>
            <Text style={[styles.body, { color: theme.textMuted }]}>{t(`onboarding.intro.${s.key}.body`)}</Text>
          </View>
          <TouchableOpacity style={styles.btn} onPress={() => { haptic(); setStep(step + 1); }} accessibilityRole="button">
            <Text style={[styles.btnText, { color: theme.primary }]}>{t('common.next')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => finish(false)} style={styles.skipBtn} accessibilityRole="button" accessibilityLabel={t('onboarding.skipA11y')}>
            <Text style={styles.skipText}>{t('common.skip')}</Text>
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
            <Text style={[styles.title, { color: theme.text }]}>{t('onboarding.pick.title')}</Text>
            <Text style={[styles.body, { color: theme.textMuted, marginBottom: 16 }]}>
              {t('onboarding.pick.body')}
            </Text>
            <ScrollView style={{ alignSelf: 'stretch', maxHeight: 340 }} showsVerticalScrollIndicator={false}>
              {starters.map(h => {
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
                        {h.type === 'volume' ? t('onboarding.pick.perDay', { goal: h.volumeGoal, unit: h.unit }) : t('onboarding.pick.onceADay')}
                      </Text>
                    </View>
                    <View style={[styles.check, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary : 'transparent' }]}>
                      {on && <Text style={styles.checkMark}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <Text style={[styles.counter, { color: theme.textMuted }]}>{t('onboarding.pick.selected', { count: picked.length, max: MAX_PICK })}</Text>
          </View>
          <TouchableOpacity
            style={[styles.btn, { opacity: picked.length === 0 ? 0.6 : 1 }]}
            onPress={() => { haptic(); picked.length === 0 ? finish(false) : setStep(3); }}
            accessibilityRole="button"
          >
            <Text style={[styles.btnText, { color: theme.primary }]}>{picked.length === 0 ? t('onboarding.pick.startEmpty') : t('common.next')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { haptic(); setStep(1); }} style={styles.skipBtn} accessibilityRole="button">
            <Text style={styles.skipText}>{t('common.back')}</Text>
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
            <Text style={[styles.title, { color: theme.text }]}>{t('onboarding.plan.title')}</Text>
            <Text style={[styles.body, { color: theme.textMuted, marginBottom: 12 }]}>
              {t('onboarding.plan.body')}
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
                        const on = tod === c;
                        return (
                          <TouchableOpacity
                            key={c}
                            style={[styles.chip, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primaryLight : 'transparent' }]}
                            onPress={() => { haptic(); setPlans(p => ({ ...p, [h.key]: { ...p[h.key], timeOfDay: c } })); }}
                            accessibilityRole="button"
                            accessibilityState={{ selected: on }}
                          >
                            <Text style={[styles.chipText, { color: on ? theme.primary : theme.textMuted }]}>{t(`timeOfDay.${c}`)}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <TextInput
                      style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
                      placeholder={t('onboarding.plan.placeholder')}
                      placeholderTextColor={theme.textMuted}
                      value={plan.intention ?? ''}
                      onChangeText={text => setPlans(p => ({ ...p, [h.key]: { ...p[h.key], intention: text } }))}
                      maxLength={80}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                      accessibilityLabel={t('onboarding.plan.a11y', { name: h.name })}
                    />
                  </View>
                );
              })}
            </ScrollView>
          </View>
          <TouchableOpacity style={styles.btn} onPress={() => finish(true)} accessibilityRole="button">
            <Text style={[styles.btnText, { color: theme.primary }]}>{t('onboarding.plan.start')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { haptic(); setStep(2); }} style={styles.skipBtn} accessibilityRole="button">
            <Text style={styles.skipText}>{t('common.back')}</Text>
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
