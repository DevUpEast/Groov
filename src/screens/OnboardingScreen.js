import React, { useState, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Keyboard,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import SafeAreaView from '../components/SafeAreaView';
import { useApp } from '../context/AppContext';
import { palette, space, radius } from '../theme/tokens';
import feedback, { EVENTS } from '../services/feedback';
import { t, useLocale } from '../i18n';
import { STARTER_HABITS } from '../utils/habits';
import { reminderTimeForTimeOfDay } from '../utils/settings';
import { formatTimeForClock } from '../utils/time';
import { usesDevice24hClock } from '../utils/clock';
import { DEFAULT_ACCENT_HEX } from '../theme/accents';

// First-run flow, kept short: a welcome, then the user names their own first habit and
// picks when they do it, then (native, with a time of day) a reminder for it. Finishing
// creates only that habit; nothing is pre-filled and no challenge is started for them.

// Kept for the web mockup's demo seed, which still imports it from here.
export { STARTER_HABITS };

const TIME_CHIPS = ['morning', 'afternoon', 'evening', 'anytime'];
const NAME_MAX = 60;

// App renders onboarding before its own <StatusBar>, so without this the platform default
// (dark icons on iOS) sits on the brand ground (ONB-9). Both grounds are dark enough for light
// icons: indigo #4F46E5 in light, the deep brand surface #1E1B4B in dark (F-02).
export default function OnboardingScreen() {
  return (
    <>
      <StatusBar style="light" />
      <OnboardingFlow />
    </>
  );
}

function OnboardingFlow() {
  const { completeOnboarding, theme, ensureNotificationPermission } = useApp();
  useLocale();
  const [step, setStep] = useState(0); // 0 welcome · 1 first habit · 2 reminder
  const [asking, setAsking] = useState(false);
  const [name, setName] = useState('');
  const [timeOfDay, setTimeOfDay] = useState('anytime');
  const nameRef = useRef(null);

  const trimmed = name.trim();
  const time = reminderTimeForTimeOfDay(timeOfDay);
  // Web has no notification permission to ask for, so the step would only end with the
  // reminder silently off; skip it there (the mockup included), and for "anytime".
  const hasReminder = Platform.OS !== 'web' && !!time;
  const uses24h = useMemo(() => usesDevice24hClock(), []);

  // `remindersOn`: the user allowed notifications on the reminder step. Otherwise the time
  // is still saved, switched off, so Settings can turn it on later.
  const finish = (withHabit, remindersOn = false) => {
    const habits = withHabit && trimmed
      ? [{
          name: trimmed,
          icon: '⭐',
          type: 'daily',
          volumeGoal: 1,
          color: DEFAULT_ACCENT_HEX,
          timeOfDay,
          ...(time ? { reminder: { ...time, enabled: remindersOn } } : {}),
        }]
      : [];
    completeOnboarding(habits);
  };

  const turnOnReminders = async () => {
    if (asking) return;
    setAsking(true);
    const granted = await ensureNotificationPermission();
    setAsking(false);
    finish(true, granted);
  };

  const createHabit = () => {
    if (!trimmed) { feedback.play(EVENTS.refused); nameRef.current?.focus(); return; }
    Keyboard.dismiss();
    if (hasReminder) setStep(2);
    else finish(true);
  };

  const totalSteps = hasReminder ? 3 : 2;
  const dots = (
    <View style={styles.dots} accessibilityLabel={t('onboarding.stepA11y', { step: step + 1, total: totalSteps })}>
      {Array.from({ length: totalSteps }).map((_, i) => (
        <View key={i} style={[styles.dot, { backgroundColor: i === step ? theme.onBrandGround : theme.onBrandGroundSecondary }, i === step ? styles.dotActive : styles.dotIdle]} />
      ))}
    </View>
  );

  // ── Welcome ─────────────────────────────────────────────────────────────────
  if (step === 0) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.brandGround }]}>
        <View style={styles.container}>
          {dots}
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <Text style={styles.emoji}>🌱</Text>
            <Text style={[styles.title, { color: theme.text }]}>{t('onboarding.intro.stick.title')}</Text>
            <Text style={[styles.body, { color: theme.textSecondary }]}>{t('onboarding.first.welcomeBody')}</Text>
          </View>
          <TouchableOpacity style={[styles.btn, { backgroundColor: theme.brandGroundCta }]} onPress={() => { setStep(1); }} accessibilityRole="button">
            <Text style={[styles.btnText, { color: theme.onBrandGroundCta }]}>{t('onboarding.first.getStarted')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Reminder ────────────────────────────────────────────────────────────────
  if (step === 2) {
    const label = formatTimeForClock(time, uses24h);
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.brandGround }]}>
        <View style={styles.container}>
          {dots}
          <View style={[styles.card, styles.cardWide, { backgroundColor: theme.surface }]}>
            <Text style={styles.emojiSmall}>🔔</Text>
            <Text style={[styles.title, { color: theme.text }]}>{t('onboarding.reminders.title')}</Text>
            <Text style={[styles.body, { color: theme.textSecondary, marginBottom: space.md }]}>
              {t('onboarding.first.reminderBody')}
            </Text>
            <View
              style={[styles.reminderRow, { borderColor: theme.border, backgroundColor: theme.bg }]}
              accessible
              accessibilityLabel={t('onboarding.reminders.rowA11y', { name: trimmed, time: label })}
            >
              <Text style={styles.pickIcon}>⭐</Text>
              <Text style={[styles.pickName, { color: theme.text, flex: 1 }]} numberOfLines={2}>{trimmed}</Text>
              <Text style={[styles.reminderTime, { color: theme.link }]}>{label}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: theme.brandGroundCta, opacity: asking ? 0.6 : 1 }]}
            onPress={turnOnReminders}
            disabled={asking}
            accessibilityRole="button"
            accessibilityState={{ disabled: asking }}
          >
            <Text style={[styles.btnText, { color: theme.onBrandGroundCta }]}>{t('onboarding.reminders.turnOn')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => finish(true, false)} disabled={asking} style={styles.skipBtn} accessibilityRole="button" accessibilityLabel={t('onboarding.reminders.notNowA11y')}>
            <Text style={[styles.skipText, { color: theme.onBrandGroundSecondary }]}>{t('common.notNow')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setStep(1); }} disabled={asking} style={styles.backBtn} accessibilityRole="button">
            <Text style={[styles.skipText, { color: theme.onBrandGroundSecondary }]}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── First habit ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.brandGround }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {dots}
          <View style={[styles.card, styles.cardWide, { backgroundColor: theme.surface }]}>
            <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">{t('onboarding.first.title')}</Text>
            <Text style={[styles.body, { color: theme.textSecondary, marginBottom: space.md }]}>
              {t('onboarding.first.body')}
            </Text>
            <Text style={[styles.fieldLabel, { color: theme.text }]} importantForAccessibility="no" accessibilityElementsHidden>
              {t('onboarding.first.nameLabel')}
            </Text>
            <TextInput
              ref={nameRef}
              testID="onboarding-habit-name"
              style={[styles.input, { borderColor: theme.controlBorder, color: theme.text, backgroundColor: theme.bg }]}
              placeholder={t('onboarding.first.placeholder')}
              placeholderTextColor={theme.textSecondary}
              value={name}
              onChangeText={setName}
              maxLength={NAME_MAX}
              autoCapitalize="sentences"
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
              accessibilityLabel={t('onboarding.first.nameLabel')}
            />
            <Text style={[styles.fieldLabel, { color: theme.text, marginTop: space.md }]}>{t('onboarding.first.whenLabel')}</Text>
            <View style={styles.chipRow} accessibilityRole="radiogroup">
              {TIME_CHIPS.map(c => {
                const on = timeOfDay === c;
                return (
                  <TouchableOpacity
                    key={c}
                    style={[styles.chip, { borderColor: on ? theme.selectionBorder : theme.controlBorder, backgroundColor: on ? theme.selection : 'transparent' }]}
                    onPress={() => { feedback.play(EVENTS.selection); setTimeOfDay(c); }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                  >
                    <Text style={[styles.chipText, { color: on ? theme.onSelection : theme.textSecondary }]}>{t(`timeOfDay.${c}`)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <TouchableOpacity
            testID="onboarding-create"
            style={[styles.btn, { backgroundColor: theme.brandGroundCta, opacity: trimmed ? 1 : 0.6 }]}
            onPress={createHabit}
            accessibilityRole="button"
            accessibilityState={{ disabled: !trimmed }}
          >
            <Text style={[styles.btnText, { color: theme.onBrandGroundCta }]}>{hasReminder ? t('common.next') : t('onboarding.first.create')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => finish(false)} style={styles.skipBtn} accessibilityRole="button" accessibilityLabel={t('onboarding.first.skipA11y')}>
            <Text style={[styles.skipText, { color: theme.onBrandGroundSecondary }]}>{t('onboarding.first.skip')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  dots: { flexDirection: 'row', gap: space.xs, marginBottom: space.lg },
  dot: { width: 8, height: 8, borderRadius: radius.cell },
  dotActive: { width: 24 },
  dotIdle: { opacity: 0.4 },
  card: {
    borderRadius: radius.sheet, padding: 28, alignItems: 'center', width: '100%', maxWidth: 420, marginBottom: 20,
    shadowColor: palette.light.shadow, shadowOpacity: 0.15, shadowRadius: 20, elevation: 8,
  },
  cardWide: { padding: 20, alignItems: 'stretch' },
  emoji: { fontSize: 64, marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: space.xs },
  body: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  btn: { width: '100%', maxWidth: 420, padding: space.md, borderRadius: radius.card, alignItems: 'center' },
  btnText: { fontSize: 17, fontWeight: '700' },
  skipBtn: { marginTop: space.sm, padding: space.xs },
  skipText: { fontSize: 15, fontWeight: '600' },
  backBtn: { marginTop: 2, padding: space.xs },
  emojiSmall: { fontSize: 40, textAlign: 'center', marginBottom: space.xs },
  reminderRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderRadius: radius.card, padding: space.sm, marginBottom: space.xs },
  reminderTime: { fontSize: 14, fontWeight: '700' },
  pickIcon: { fontSize: 24 },
  pickName: { fontSize: 15, fontWeight: '600' },
  fieldLabel: { fontSize: 14, fontWeight: '600', marginBottom: space.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: { paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.pill, borderWidth: 1.5 },
  chipText: { fontSize: 14, fontWeight: '600' },
  input: { borderWidth: 2, borderRadius: radius.control, paddingHorizontal: space.sm, paddingVertical: space.sm, fontSize: 16 },
});
