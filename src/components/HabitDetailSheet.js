import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Dimensions, Image, Alert, PanResponder,
} from 'react-native';
import BottomSheet from './BottomSheet';
import { SheetDragHandle } from './SheetHeader';
import { useApp } from '../context/AppContext';
import { addDays, parseDateKey } from '../utils/dates';
import {
  dayStatus, bestHabitStreak, describeSchedule, weekStart, WEEKDAY_LABELS,
} from '../utils/schedule';
import { lightImpact } from '../utils/haptics';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const WEEKS = 15;                       // ~3.5 months of history in the grid
const GRID_GAP = 3;
const DAY_LABEL_W = 22;
const PARTIAL_COLOR = '#FDE68A';
const FROZEN_COLOR = '#7DD3FC';
const MISSED_COLOR = '#FCA5A5';
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first

function pct(n, d) {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

// Per-habit insight sheet: contribution grid (tap a past day to toggle it),
// completion rate, current/best streak and a weekday breakdown.
export default function HabitDetailSheet({ habit, onClose, onEdit }) {
  const {
    theme, settings, todayStr, completions, isHabitDoneOn, getStreakForHabit,
    isExcused, toggleHabitDoneOn, setHabitCountOn, accountCreatedAt, isHabitSkippedOn,
  } = useApp();

  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (habit) {
      setVisible(true);
      translateY.setValue(SCREEN_HEIGHT);
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    }
  }, [habit]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = useCallback(() => {
    Animated.timing(translateY, { toValue: SCREEN_HEIGHT, duration: 220, useNativeDriver: true }).start(() => {
      setVisible(false);
      onClose();
    });
  }, [translateY, onClose]);
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; }, [close]);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5,
    onPanResponderMove: (_, gs) => { if (gs.dy > 0) translateY.setValue(gs.dy); },
    onPanResponderRelease: (_, gs) => {
      if (gs.dy > 80) closeRef.current();
      else Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80 }).start();
    },
  })).current;

  const today = todayStr();
  const isDone = useCallback((k) => (habit ? isHabitDoneOn(habit, k) : false), [habit, isHabitDoneOn]);
  const excused = useCallback((k) => (habit ? isExcused(k, habit.id) : false), [habit, isExcused]);

  // Grid: WEEKS columns ending with the current week, rows Monday..Sunday.
  const grid = useMemo(() => {
    if (!habit) return { weeks: [], monthLabels: [] };
    const thisWeek = weekStart(today);
    const weeks = [];
    const monthLabels = [];
    let lastMonth = null;
    for (let w = WEEKS - 1; w >= 0; w--) {
      const start = addDays(thisWeek, -7 * w);
      const days = [];
      for (let i = 0; i < 7; i++) {
        const key = addDays(start, i);
        const future = key > today;
        const before = (habit.createdAt && key < habit.createdAt) || (accountCreatedAt && key < accountCreatedAt);
        const status = future || before ? 'none' : dayStatus(habit.schedule, key, today, isDone, excused);
        days.push({ key, future, before, status, count: (completions[key] || {})[habit.id] || 0 });
      }
      const m = parseDateKey(start).getMonth();
      monthLabels.push(m !== lastMonth ? parseDateKey(start).toLocaleDateString('en-US', { month: 'short' }) : '');
      lastMonth = m;
      weeks.push({ start, days });
    }
    return { weeks, monthLabels };
  }, [habit, today, completions, accountCreatedAt, isDone, excused]);

  // Stats over the habit's lifetime (capped at the grid window for the weekday chart).
  const stats = useMemo(() => {
    if (!habit) return null;
    const floor = [habit.createdAt, accountCreatedAt].filter(Boolean).sort().pop() || today;
    const from = floor > today ? today : floor;
    let expected = 0, done = 0, total = 0;
    const byWeekday = Array.from({ length: 7 }, () => ({ done: 0, expected: 0 }));
    let key = from;
    let guard = 0;
    while (key <= today && guard++ < 3660) {
      const st = dayStatus(habit.schedule, key, today, isDone, excused);
      const dow = parseDateKey(key).getDay();
      if (st === 'done') { done++; total++; expected++; byWeekday[dow].done++; byWeekday[dow].expected++; }
      else if (st === 'missed' && key !== today) { expected++; byWeekday[dow].expected++; }
      key = addDays(key, 1);
    }
    return {
      done, expected,
      rate: pct(done, expected),
      current: getStreakForHabit(habit.id),
      best: Math.max(bestHabitStreak(habit.schedule, from, today, today, isDone, excused), getStreakForHabit(habit.id)),
      byWeekday,
      since: from,
    };
  }, [habit, today, accountCreatedAt, isDone, excused, getStreakForHabit]);

  if (!habit) return null;

  const cell = Math.floor((SCREEN_WIDTH - 48 - DAY_LABEL_W - GRID_GAP * (WEEKS - 1)) / WEEKS);

  const colorFor = (d) => {
    if (d.future || d.before) return 'transparent';
    if (d.status === 'done') return theme.primary;
    if (d.count > 0) return PARTIAL_COLOR;
    if (d.status === 'rest') return isHabitSkippedOn(habit.id, d.key) || excused(d.key) ? FROZEN_COLOR : theme.progressBarBg;
    return MISSED_COLOR;
  };

  const onCellPress = (d) => {
    if (d.future || d.before) return;
    if (settings.hapticsEnabled) lightImpact();
    if (habit.type === 'volume' && habit.volumeGoal > 1) {
      // Volume habits: offer the full range rather than a blind toggle.
      Alert.alert(
        parseDateKey(d.key).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        `${habit.name}: ${d.count}/${habit.volumeGoal}`,
        [
          { text: 'Clear', onPress: () => setHabitCountOn(habit.id, d.key, 0) },
          { text: `Set ${habit.volumeGoal} (done)`, onPress: () => setHabitCountOn(habit.id, d.key, habit.volumeGoal) },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }
    toggleHabitDoneOn(habit.id, d.key);
  };

  const maxWeekdayRate = Math.max(1, ...stats.byWeekday.map(w => pct(w.done, w.expected)));

  return (
    <BottomSheet visible={visible} onClose={close} translateY={translateY} backgroundColor={theme.surface} maxHeight="92%">
      <SheetDragHandle panHandlers={pan.panHandlers} theme={theme} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={styles.titleRow}>
          {habit.customIconUri
            ? <Image source={{ uri: habit.customIconUri }} style={styles.iconImage} />
            : <Text style={styles.icon}>{habit.icon}</Text>}
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={2}>{habit.name}</Text>
            <Text style={[styles.meta, { color: theme.textMuted }]}>
              {describeSchedule(habit.schedule)}{habit.type === 'volume' ? ` · ${habit.volumeGoal}× a day` : ''}
            </Text>
          </View>
          {onEdit && (
            <TouchableOpacity onPress={() => { close(); setTimeout(() => onEdit(habit), 250); }} style={[styles.editBtn, { borderColor: theme.border }]} accessibilityRole="button" accessibilityLabel="Edit habit">
              <Text style={[styles.editBtnText, { color: theme.primary }]}>Edit</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={close} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={[styles.closeTxt, { color: theme.textMuted }]}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          {[
            { label: 'Current', value: `${stats.current}d`, emoji: '🔥' },
            { label: 'Best', value: `${stats.best}d`, emoji: '🏅' },
            { label: 'Done', value: `${stats.rate}%`, emoji: '✅' },
            { label: 'Total', value: String(stats.done), emoji: '📈' },
          ].map(s => (
            <View key={s.label} style={[styles.stat, { backgroundColor: theme.bg, borderColor: theme.border }]} accessible accessibilityLabel={`${s.label}: ${s.value}`}>
              <Text style={styles.statEmoji}>{s.emoji}</Text>
              <Text style={[styles.statValue, { color: theme.primary }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: theme.textMuted }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: theme.text }]}>History</Text>
        <Text style={[styles.hint, { color: theme.textMuted }]}>Tap any past day to fix it</Text>

        {/* Month labels */}
        <View style={{ flexDirection: 'row', marginLeft: DAY_LABEL_W, marginBottom: 2 }}>
          {grid.monthLabels.map((m, i) => (
            <Text key={i} style={{ width: cell + GRID_GAP, fontSize: 9, color: theme.textMuted }} numberOfLines={1}>{m}</Text>
          ))}
        </View>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ width: DAY_LABEL_W }}>
            {WEEKDAY_ORDER.map(d => (
              <Text key={d} style={{ height: cell + GRID_GAP, fontSize: 9, color: theme.textMuted, lineHeight: cell + GRID_GAP }}>
                {d === 1 || d === 3 || d === 5 ? WEEKDAY_LABELS[d] : ''}
              </Text>
            ))}
          </View>
          {grid.weeks.map(w => (
            <View key={w.start} style={{ marginRight: GRID_GAP }}>
              {w.days.map(d => (
                <TouchableOpacity
                  key={d.key}
                  onPress={() => onCellPress(d)}
                  activeOpacity={d.future || d.before ? 1 : 0.6}
                  accessibilityRole="button"
                  accessibilityLabel={`${d.key}: ${d.future ? 'future' : d.status}`}
                  style={{
                    width: cell, height: cell, marginBottom: GRID_GAP, borderRadius: 3,
                    backgroundColor: colorFor(d),
                    borderWidth: d.key === today ? 1.5 : 0, borderColor: theme.text,
                  }}
                />
              ))}
            </View>
          ))}
        </View>
        <View style={styles.legend}>
          {[
            { c: theme.primary, l: 'Done' }, { c: PARTIAL_COLOR, l: 'Partial' },
            { c: MISSED_COLOR, l: 'Missed' }, { c: FROZEN_COLOR, l: 'Skipped / frozen' }, { c: theme.progressBarBg, l: 'Rest' },
          ].map(x => (
            <View key={x.l} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: x.c }]} />
              <Text style={[styles.legendText, { color: theme.textMuted }]}>{x.l}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 20 }]}>By weekday</Text>
        <Text style={[styles.hint, { color: theme.textMuted }]}>Completion rate since {stats.since}</Text>
        <View style={styles.weekdayRow}>
          {WEEKDAY_ORDER.map(d => {
            const w = stats.byWeekday[d];
            const r = pct(w.done, w.expected);
            return (
              <View key={d} style={styles.weekdayCol} accessible accessibilityLabel={`${WEEKDAY_LABELS[d]}: ${r} percent`}>
                <Text style={[styles.weekdayPct, { color: theme.textMuted }]}>{w.expected > 0 ? `${r}%` : '–'}</Text>
                <View style={[styles.weekdayTrack, { backgroundColor: theme.progressBarBg }]}>
                  <View style={[styles.weekdayFill, { height: `${Math.max(4, (r / maxWeekdayRate) * 100)}%`, backgroundColor: w.expected > 0 ? theme.primary : theme.border }]} />
                </View>
                <Text style={[styles.weekdayLabel, { color: theme.textMuted }]}>{WEEKDAY_LABELS[d]}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  icon: { fontSize: 34 },
  iconImage: { width: 40, height: 40, borderRadius: 8 },
  name: { fontSize: 20, fontWeight: 'bold' },
  meta: { fontSize: 13, marginTop: 2 },
  editBtn: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  editBtnText: { fontSize: 13, fontWeight: '700' },
  closeBtn: { padding: 4 },
  closeTxt: { fontSize: 20, fontWeight: 'bold' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1, gap: 2 },
  statEmoji: { fontSize: 16 },
  statValue: { fontSize: 17, fontWeight: 'bold' },
  statLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 11, marginTop: 2, marginBottom: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontSize: 11 },
  weekdayRow: { flexDirection: 'row', gap: 6, height: 120, alignItems: 'flex-end' },
  weekdayCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  weekdayPct: { fontSize: 10, marginBottom: 4 },
  weekdayTrack: { flex: 1, width: '70%', borderRadius: 4, overflow: 'hidden', justifyContent: 'flex-end' },
  weekdayFill: { width: '100%', borderRadius: 4 },
  weekdayLabel: { fontSize: 11, marginTop: 4, fontWeight: '600' },
});
