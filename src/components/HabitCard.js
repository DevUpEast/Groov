import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useApp } from '../context/AppContext';
import { completionsInWeek } from '../utils/schedule';
import { addDays } from '../utils/dates';
import { lightImpact } from '../utils/haptics';

export default function HabitCard({ habit, onIncrement, onDecrement }) {
  const {
    getHabitCount, isHabitDone, isHabitDoneOn, getStreakForHabit, theme, todayStr,
    isHabitSkippedOn, toggleSkipHabitOn, toggleHabitDoneOn, settings,
  } = useApp();
  const count = getHabitCount(habit.id);
  const done = isHabitDone(habit);
  const today = todayStr();
  const skipped = !done && isHabitSkippedOn(habit.id, today);
  const isVolume = habit.type === 'volume';
  // Consecutive days (ending today) this habit hit its goal; one day is not yet a streak.
  const streak = getStreakForHabit(habit.id);
  const streakLabel = streak >= 2 ? `🔥 ${streak}-day streak` : null;
  // perWeek habits show weekly progress instead of a per-day count.
  const perWeek = habit.schedule?.type === 'perWeek' ? habit.schedule.target : 0;
  const weekDone = perWeek ? completionsInWeek(todayStr(), todayStr(), (k) => isHabitDoneOn(habit, k)) : 0;
  const weekLabel = perWeek ? (weekDone >= perWeek ? `✓ ${weekDone}/${perWeek} this week` : `${weekDone}/${perWeek} this week`) : null;
  const subParts = [skipped ? '💤 Skipped today' : null, isVolume ? `${count}/${habit.volumeGoal} today` : null, weekLabel, streakLabel].filter(Boolean);

  // Long-press: forgiveness actions (skip today keeps the streak; fix yesterday).
  const yesterday = addDays(today, -1);
  const yesterdayDone = isHabitDoneOn(habit, yesterday);
  const handleLongPress = () => {
    if (settings.hapticsEnabled) lightImpact();
    Alert.alert(habit.name, 'Life happens. Pick an option:', [
      { text: skipped ? 'Unskip today' : 'Skip today (keeps streak)', onPress: () => toggleSkipHabitOn(habit.id, today) },
      { text: yesterdayDone ? "Undo yesterday's check" : 'Mark done yesterday', onPress: () => toggleHabitDoneOn(habit.id, yesterday) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // Tapping anywhere on the card:
  //   daily  → toggle done/undone
  //   volume → add 1 (ignored when already maxed)
  const handleCardPress = isVolume
    ? () => { if (!done) onIncrement(); }
    : () => { if (done) onDecrement(); else onIncrement(); };

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: done ? theme.primary : theme.border },
        done && { backgroundColor: theme.primaryLight },
        skipped && { opacity: 0.6, borderStyle: 'dashed' },
      ]}
      onPress={handleCardPress}
      onLongPress={handleLongPress}
      delayLongPress={350}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${habit.name}${isVolume ? `, ${count} of ${habit.volumeGoal}` : ''}${done ? ', done' : skipped ? ', skipped today' : ''}`}
      accessibilityHint="Double tap to log. Long press for skip and yesterday options."
    >
      {habit.customIconUri
        ? <Image source={{ uri: habit.customIconUri }} style={styles.iconImage} />
        : <Text style={styles.icon}>{habit.icon}</Text>
      }

      <View style={styles.info}>
        <Text style={[styles.name, { color: theme.text }, done && { color: theme.textMuted }]}
          numberOfLines={1}>
          {habit.name}
        </Text>
        {subParts.length > 0 && (
          <Text style={[styles.sub, { color: theme.textMuted }]}>{subParts.join(' · ')}</Text>
        )}
      </View>

      {isVolume ? (
        <View style={styles.counter}>
          {/* − is the only way to subtract for volume habits */}
          <TouchableOpacity
            style={[styles.counterBtn, { borderColor: theme.border }]}
            onPress={onDecrement}
          >
            <Text style={[styles.counterBtnText, { color: theme.textMuted }]}>−</Text>
          </TouchableOpacity>

          <Text style={[styles.counterNum, { color: theme.text }]}>{count}</Text>

          {/* When done: visual-only ✓ badge (touching it does nothing extra) */}
          {/* When not done: tappable + button */}
          {done ? (
            <View style={[styles.counterBtn, { borderColor: theme.primary, backgroundColor: theme.primary }]}>
              <Text style={[styles.counterBtnText, { color: '#fff' }]}>✓</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.counterBtn, { borderColor: theme.border }]}
              onPress={onIncrement}
            >
              <Text style={[styles.counterBtnText, { color: theme.textMuted }]}>+</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        /* Daily habit: visual-only checkbox; the whole card handles the tap */
        <View style={[
          styles.checkbox,
          { borderColor: done ? theme.primary : theme.border },
          done && { backgroundColor: theme.primary },
        ]}>
          {done ? <Text style={styles.check}>✓</Text> : skipped ? <Text style={{ fontSize: 13 }}>💤</Text> : null}
        </View>
      )}
    </TouchableOpacity>
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
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  icon: { fontSize: 26, marginRight: 12 },
  iconImage: { width: 32, height: 32, borderRadius: 6, marginRight: 12 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600' },
  sub: { fontSize: 12, marginTop: 2 },
  checkbox: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  check: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  counterBtn: {
    width: 30, height: 30, borderRadius: 15, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  counterBtnText: { fontSize: 18, fontWeight: '600', lineHeight: 22 },
  counterNum: { fontSize: 16, fontWeight: 'bold', minWidth: 20, textAlign: 'center' },
});
