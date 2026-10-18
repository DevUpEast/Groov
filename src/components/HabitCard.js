import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { completionsInWeek } from '../utils/schedule';
import { addDays } from '../utils/dates';
import { lightImpact } from '../utils/haptics';
import { announce } from '../utils/a11y';
import HabitIcon from './HabitIcon';
import ActionSheet from './ui/ActionSheet';
import { usesCounter, countStep, describeProgress, unitLabel } from '../utils/habits';
import { t, useLocale } from '../i18n';
import { mixHex } from '../utils/color';

export default function HabitCard({ habit, onIncrement, onDecrement, onNote, onSkipToggle }) {
  const {
    getHabitCount, isHabitDone, isHabitDoneOn, getStreakForHabit, theme, todayStr,
    isHabitSkippedOn, toggleSkipHabitOn, toggleHabitDoneOn, settings, getNote,
  } = useApp();
  useLocale();
  // Per-habit accent colour falls back to the theme primary.
  // No habit colour: the indigo selection pair (C-01 moves every card onto resolveAccent).
  const accent = habit.color || theme.selectionBorder;
  const count = getHabitCount(habit.id);
  const done = isHabitDone(habit);
  const today = todayStr();
  const skipped = !done && isHabitSkippedOn(habit.id, today);
  const isVolume = usesCounter(habit);
  const isQuit = habit.type === 'quit';
  const isTimed = habit.type === 'timed';
  const isLimit = habit.type === 'atMost';
  const overLimit = isLimit && count > habit.volumeGoal;
  const step = countStep(habit);
  // Consecutive days (ending today) this habit hit its goal; one day is not yet a streak.
  const streak = getStreakForHabit(habit.id);
  const streakLabel = streak >= 2 ? (isQuit ? t('habitCard.streakClean', { count: streak }) : t('habitCard.streak', { count: streak })) : null;

  // Timed habits: a simple start/stop timer that adds whole minutes when stopped.
  const [timerStart, setTimerStart] = useState(null);
  const [, setTick] = useState(0);
  const tickRef = useRef(null);
  useEffect(() => {
    if (!timerStart) { clearInterval(tickRef.current); return undefined; }
    tickRef.current = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(tickRef.current);
  }, [timerStart]);
  const elapsedSec = timerStart ? Math.floor((Date.now() - timerStart) / 1000) : 0;
  const toggleTimer = () => {
    if (settings.hapticsEnabled) lightImpact();
    if (!timerStart) { setTimerStart(Date.now()); return; }
    const mins = Math.round(elapsedSec / 60);
    setTimerStart(null);
    if (mins >= 1) onIncrement(mins);
  };
  // perWeek habits show weekly progress instead of a per-day count.
  const perWeek = habit.schedule?.type === 'perWeek' ? habit.schedule.target : 0;
  const weekDone = perWeek ? completionsInWeek(todayStr(), todayStr(), (k) => isHabitDoneOn(habit, k)) : 0;
  const weekLabel = perWeek ? (weekDone >= perWeek ? t('habitCard.weekDone', { done: weekDone, target: perWeek }) : t('habitCard.week', { done: weekDone, target: perWeek })) : null;
  const note = getNote(habit.id, today);
  const subParts = [
    skipped ? t('habitCard.skippedToday') : null,
    describeProgress(habit, count),
    timerStart ? t('habitCard.timer', { time: `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, '0')}` }) : null,
    weekLabel, streakLabel, note ? '📝' : null,
  ].filter(Boolean);

  // Long-press: forgiveness actions (skip today keeps the streak; fix yesterday).
  const yesterday = addDays(today, -1);
  const yesterdayDone = isHabitDoneOn(habit, yesterday);
  // An ActionSheet, not a system alert: Android alerts show at most 3 buttons (Cancel was dropped)
  // and ignore back. The sheet plays the long-press haptic itself.
  const [menuOpen, setMenuOpen] = useState(false);
  const handleLongPress = () => setMenuOpen(true);
  const menuOptions = [
    { label: skipped ? t('habitCard.longPress.unskip') : t('habitCard.longPress.skip'), onPress: () => { toggleSkipHabitOn(habit.id, today); onSkipToggle?.(habit); } },
    { label: yesterdayDone ? t('habitCard.longPress.undoYesterday') : t('habitCard.longPress.markYesterday'), onPress: () => toggleHabitDoneOn(habit.id, yesterday) },
    ...(onNote ? [{ label: note ? t('habitCard.longPress.editNote') : t('habitCard.longPress.addNote'), onPress: () => onNote(habit, today) }] : []),
  ];

  // Tapping anywhere on the card:
  //   daily  → toggle done/undone
  //   volume → add 1 (ignored when already maxed)
  const handleCardPress = isLimit
    ? () => { onIncrement(step); announce(t('habitCard.announce.countMax', { name: habit.name, count: count + step, goal: habit.volumeGoal })); }
    : isVolume
      ? () => { onIncrement(step); announce(t('habitCard.announce.count', { name: habit.name, count: count + step, goal: habit.volumeGoal })); }
      : () => { if (done) { onDecrement(1); announce(t('habitCard.announce.unchecked', { name: habit.name })); } else { onIncrement(1); announce(isQuit ? t('habitCard.announce.avoided', { name: habit.name }) : t('habitCard.announce.done', { name: habit.name })); } };

  return (
    <>
      <TouchableOpacity
        style={[
          styles.card,
          { backgroundColor: theme.surface, borderColor: done ? accent : theme.border },
          // Opaque, pre-mixed tints with no elevation: Android draws the shadow through a
          // translucent fill, which framed every done card in a dark border (CHK-8). A skipped
          // card is translucent through `opacity`, so it drops elevation for the same reason.
          done && { backgroundColor: habit.color ? mixHex(habit.color, theme.surface, 0x1F / 255) : theme.selection },
          overLimit && { borderColor: theme.dangerText, backgroundColor: theme.dangerTint },
          (done || overLimit || skipped) && styles.flat,
          skipped && { opacity: 0.6, borderStyle: 'dashed' },
        ]}
        onPress={handleCardPress}
        onLongPress={handleLongPress}
        delayLongPress={350}
        activeOpacity={0.7}
        accessibilityRole={isVolume ? 'button' : 'checkbox'}
        accessibilityState={isVolume ? undefined : { checked: done }}
        accessibilityLabel={`${habit.name}${isVolume ? `${unitLabel(habit) ? t('habitCard.a11y.countUnit', { count, goal: habit.volumeGoal, unit: unitLabel(habit) }) : t('habitCard.a11y.count', { count, goal: habit.volumeGoal })}${isLimit ? t('habitCard.a11y.maximum') : ''}` : ''}${overLimit ? t('habitCard.a11y.overLimit') : done ? (isQuit ? t('habitCard.a11y.avoided') : t('habitCard.a11y.done')) : skipped ? t('habitCard.a11y.skipped') : t('habitCard.a11y.notDone')}${streak >= 2 ? t('habitCard.a11y.streak', { count: streak }) : ''}`}
        accessibilityHint={t('habitCard.a11y.hint')}
      >
        {habit.color ? <View style={[styles.stripe, { backgroundColor: habit.color }]} /> : null}
        <HabitIcon habit={habit} size={26} imageStyle={styles.iconImage} textStyle={styles.icon} />

        <View style={styles.info}>
          <Text style={[styles.name, { color: theme.text }, done && { color: theme.textSecondary }]}
            numberOfLines={1}>
            {habit.name}
          </Text>
          {subParts.length > 0 && (
            <Text style={[styles.sub, { color: theme.textSecondary }]}>{subParts.join(' · ')}</Text>
          )}
        </View>

        {isVolume ? (
          <View style={styles.counter}>
            {/* − is the only way to subtract for volume habits */}
            {isTimed && (
              <TouchableOpacity
                style={[styles.counterBtn, { borderColor: timerStart ? theme.dangerFill : accent, backgroundColor: timerStart ? theme.dangerFill : 'transparent' }]}
                onPress={toggleTimer}
                accessibilityRole="button"
                accessibilityLabel={timerStart ? t('habitCard.a11y.stopTimer') : t('habitCard.a11y.startTimer')}
              >
                <Text style={[styles.counterBtnText, { color: timerStart ? theme.onDanger : accent, fontSize: 13 }]}>{timerStart ? '■' : '▶'}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.counterBtn, { borderColor: theme.border }]}
              onPress={() => onDecrement(step)}
              accessibilityRole="button"
              accessibilityLabel={(step > 1 ? t('habitCard.a11y.removeMany', { count: step, unit: unitLabel(habit) }) : t('habitCard.a11y.removeOne', { unit: unitLabel(habit) })).trim()}
              accessibilityState={{ disabled: count <= 0 }}
            >
              <Text style={[styles.counterBtnText, { color: theme.textSecondary }]}>−</Text>
            </TouchableOpacity>

            <Text style={[styles.counterNum, { color: overLimit ? theme.dangerText : done && !isLimit ? accent : theme.text }]}>{count}</Text>

            <TouchableOpacity
              style={[styles.counterBtn, done && !isLimit ? { borderColor: accent, backgroundColor: accent } : { borderColor: theme.border }]}
              onPress={() => onIncrement(step)}
              accessibilityRole="button"
              accessibilityLabel={(step > 1 ? t('habitCard.a11y.addMany', { count: step, unit: unitLabel(habit) }) : t('habitCard.a11y.addOne', { unit: unitLabel(habit) })).trim()}
            >
              <Text style={[styles.counterBtnText, { color: done && !isLimit ? theme.onAccent : theme.textSecondary }]}>+</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Daily habit: visual-only checkbox; the whole card handles the tap */
          <View style={[
            styles.checkbox,
            { borderColor: done ? accent : theme.border },
            done && { backgroundColor: accent },
          ]}>
            {done ? <Text style={[styles.check, { color: theme.onAccent }]}>{isQuit ? '🛡' : '✓'}</Text> : skipped ? <Text style={{ fontSize: 13 }}>💤</Text> : null}
          </View>
        )}
      </TouchableOpacity>
      <ActionSheet
        visible={menuOpen}
        title={habit.name}
        message={t('habitCard.longPress.body')}
        options={menuOptions}
        onCancel={() => setMenuOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    // Cards are border-only in light and tonal in dark (§2.8); no shadow.
    overflow: 'hidden',
  },
  flat: { elevation: 0, shadowOpacity: 0 },
  stripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  icon: { fontSize: 26, marginRight: 12 },
  iconImage: { width: 32, height: 32, borderRadius: 6, marginRight: 12 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600' },
  sub: { fontSize: 12, marginTop: 2 },
  checkbox: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  check: { fontSize: 14, fontWeight: 'bold' },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  counterBtn: {
    width: 30, height: 30, borderRadius: 15, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  counterBtnText: { fontSize: 18, fontWeight: '600', lineHeight: 22 },
  counterNum: { fontSize: 16, fontWeight: 'bold', minWidth: 20, textAlign: 'center' },
});
