import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Keyboard,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import SafeAreaView from '../components/SafeAreaView';
import { useApp } from '../context/AppContext';
import { lightImpact, mediumImpact } from '../utils/haptics';
import { t, useLocale } from '../i18n';
import { STARTER_HABITS, getStarterHabits } from '../utils/habits';
import { reminderTimeForTimeOfDay } from '../utils/settings';
import { formatTimeForClock } from '../utils/time';
import { usesDevice24hClock } from '../utils/clock';

// First-run flow: two intro slides, pick starter habits, an implementation intention
// ("after X, I will Y") per habit, then reminders at each habit's time of day.
// Finishing creates the habits and the 3-Day Kickstart challenge.

const INTRO = [
  { emoji: '🌱', key: 'stick' },
  { emoji: '🔥', key: 'streaks' },
];

export { STARTER_HABITS };
const DEFAULT_PICK = ['water', 'move', 'read'];
const MAX_PICK = 5;

const TIME_CHIPS = ['morning', 'afternoon', 'evening', 'anytime'];

// App renders onboarding before its own <StatusBar>, so without this the platform default
// (dark icons on iOS) sits on the indigo background (ONB-9). Dark theme uses ink icons on
// #818CF8, like its onAction text (white there is 2.98:1).
export default function OnboardingScreen() {
  const { themeName } = useApp();
  return (
    <>
      <StatusBar style={themeName === 'dark' ? 'dark' : 'light'} />
      <OnboardingFlow />
    </>
  );
}

function OnboardingFlow() {
  const { completeOnboarding, theme, settings, ensureNotificationPermission } = useApp();
  const { locale } = useLocale();
  const [step, setStep] = useState(0); // 0,1 intro · 2 pick · 3 intentions · 4 reminders
  const [asking, setAsking] = useState(false);
  const [picked, setPicked] = useState(DEFAULT_PICK);
  const [plans, setPlans] = useState({}); // key -> { timeOfDay, intention }

  const haptic = () => { if (settings?.hapticsEnabled !== false) lightImpact(); };

  const togglePick = (key) => {
    haptic();
    setPicked(p => (p.includes(key) ? p.filter(k => k !== key) : p.length >= MAX_PICK ? p : [...p, key]));
  };

  const starters = useMemo(() => getStarterHabits(), [locale]);
  const chosen = useMemo(() => starters.filter(h => picked.includes(h.key)), [picked, starters]);

  // Each chosen habit's reminder time comes from its time of day (WID-6); anytime has none.
  const reminderRows = useMemo(() => chosen.map(h => {
    const tod = (plans[h.key] || {}).timeOfDay ?? h.timeOfDay;
    return { habit: h, time: reminderTimeForTimeOfDay(tod) };
  }), [chosen, plans]);
  // Web has no notification permission to ask for, so the step would only end with
  // reminders silently off; skip it there (the mockup included).
  const hasReminders = Platform.OS !== 'web' && reminderRows.some(r => r.time);
  const uses24h = useMemo(() => usesDevice24hClock(), []);

  // `remindersOn`: the user allowed notifications on the reminders step. Otherwise the
  // times are still saved, switched off, so Settings can turn them on later.
  const finish = (withHabits, remindersOn = false) => {
    if (settings?.hapticsEnabled !== false) mediumImpact();
    const habits = withHabits
      ? chosen.map(h => {
          const plan = plans[h.key] || {};
          const { key, ...rest } = h;
          const timeOfDay = plan.timeOfDay ?? h.timeOfDay;
          const time = reminderTimeForTimeOfDay(timeOfDay);
          return {
            ...rest,
            timeOfDay,
            intention: (plan.intention || '').trim() || null,
            ...(time ? { reminder: { ...time, enabled: remindersOn } } : {}),
          };
        })
      : [];
    completeOnboarding(habits);
  };

  const turnOnReminders = async () => {
    if (asking) return;
    haptic();
    setAsking(true);
    const granted = await ensureNotificationPermission();
    setAsking(false);
    finish(true, granted);
  };

  const totalSteps = hasReminders ? 5 : 4;
  const dots = (
    <View style={styles.dots} accessibilityLabel={t('onboarding.stepA11y', { step: step + 1, total: totalSteps })}>
      {Array.from({ length: totalSteps }).map((_, i) => (
        <View key={i} style={[styles.dot, { backgroundColor: i === step ? theme.onAction : theme.onActionSecondary }, i === step ? styles.dotActive : styles.dotIdle]} />
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
            <Text style={[styles.body, { color: theme.textSecondary }]}>{t(`onboarding.intro.${s.key}.body`)}</Text>
          </View>
          <TouchableOpacity style={styles.btn} onPress={() => { haptic(); setStep(step + 1); }} accessibilityRole="button">
            <Text style={[styles.btnText, { color: theme.primary }]}>{t('common.next')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => finish(false)} style={styles.skipBtn} accessibilityRole="button" accessibilityLabel={t('onboarding.skipA11y')}>
            <Text style={[styles.skipText, { color: theme.onActionSecondary }]}>{t('common.skip')}</Text>
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
            <Text style={[styles.body, { color: theme.textSecondary, marginBottom: 16 }]}>
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
                      <Text style={[styles.pickSub, { color: theme.textSecondary }]}>
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
            <Text style={[styles.counter, { color: theme.textSecondary }]}>{t('onboarding.pick.selected', { count: picked.length, max: MAX_PICK })}</Text>
          </View>
          <TouchableOpacity
            style={[styles.btn, { opacity: picked.length === 0 ? 0.6 : 1 }]}
            onPress={() => { haptic(); picked.length === 0 ? finish(false) : setStep(3); }}
            accessibilityRole="button"
          >
            <Text style={[styles.btnText, { color: theme.primary }]}>{picked.length === 0 ? t('onboarding.pick.startEmpty') : t('common.next')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { haptic(); setStep(1); }} style={styles.skipBtn} accessibilityRole="button">
            <Text style={[styles.skipText, { color: theme.onActionSecondary }]}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Reminders ───────────────────────────────────────────────────────────────
  if (step === 4) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.primary }]}>
        <View style={styles.container}>
          {dots}
          <View style={[styles.card, styles.cardWide, { backgroundColor: theme.surface }]}>
            <Text style={styles.emojiSmall}>🔔</Text>
            <Text style={[styles.title, { color: theme.text }]}>{t('onboarding.reminders.title')}</Text>
            <Text style={[styles.body, { color: theme.textSecondary, marginBottom: 16 }]}>
              {t('onboarding.reminders.body')}
            </Text>
            <ScrollView style={{ alignSelf: 'stretch', maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {reminderRows.map(({ habit, time }) => {
                const label = time ? formatTimeForClock(time, uses24h) : t('onboarding.reminders.none');
                return (
                  <View
                    key={habit.key}
                    style={[styles.reminderRow, { borderColor: theme.border, backgroundColor: theme.bg }]}
                    accessible
                    accessibilityLabel={t('onboarding.reminders.rowA11y', { name: habit.name, time: label })}
                  >
                    <Text style={styles.pickIcon}>{habit.icon}</Text>
                    <Text style={[styles.pickName, { color: theme.text, flex: 1 }]} numberOfLines={2}>{habit.name}</Text>
                    <Text style={[styles.reminderTime, { color: time ? theme.primary : theme.textSecondary }]}>{label}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
          <TouchableOpacity
            style={[styles.btn, { opacity: asking ? 0.6 : 1 }]}
            onPress={turnOnReminders}
            disabled={asking}
            accessibilityRole="button"
            accessibilityState={{ disabled: asking }}
          >
            <Text style={[styles.btnText, { color: theme.primary }]}>{t('onboarding.reminders.turnOn')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => finish(true, false)} disabled={asking} style={styles.skipBtn} accessibilityRole="button" accessibilityLabel={t('onboarding.reminders.notNowA11y')}>
            <Text style={[styles.skipText, { color: theme.onActionSecondary }]}>{t('common.notNow')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { haptic(); setStep(3); }} disabled={asking} style={styles.backBtn} accessibilityRole="button">
            <Text style={[styles.skipText, { color: theme.onActionSecondary }]}>{t('common.back')}</Text>
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
            <Text style={[styles.body, { color: theme.textSecondary, marginBottom: 12 }]}>
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
                            <Text style={[styles.chipText, { color: on ? theme.primary : theme.textSecondary }]}>{t(`timeOfDay.${c}`)}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <TextInput
                      style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
                      placeholder={t('onboarding.plan.placeholder')}
                      placeholderTextColor={theme.textSecondary}
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
          <TouchableOpacity
            style={styles.btn}
            onPress={() => { if (hasReminders) { haptic(); Keyboard.dismiss(); setStep(4); } else finish(true); }}
            accessibilityRole="button"
          >
            <Text style={[styles.btnText, { color: theme.primary }]}>{hasReminders ? t('common.next') : t('onboarding.plan.start')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { haptic(); setStep(2); }} style={styles.skipBtn} accessibilityRole="button">
            <Text style={[styles.skipText, { color: theme.onActionSecondary }]}>{t('common.back')}</Text>
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
  dotIdle: { opacity: 0.4 },
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
  skipText: { fontSize: 15, fontWeight: '600' },
  backBtn: { marginTop: 2, padding: 8 },
  emojiSmall: { fontSize: 40, textAlign: 'center', marginBottom: 8 },
  reminderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  reminderTime: { fontSize: 14, fontWeight: '700' },
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
