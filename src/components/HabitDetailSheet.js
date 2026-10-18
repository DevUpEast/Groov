import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Dimensions, Image, Alert, PanResponder,
} from 'react-native';
import BottomSheet from './BottomSheet';
import { SheetDragHandle } from './SheetHeader';
import { useApp } from '../context/AppContext';
import { addDays, parseDateKey } from '../utils/dates';
import {
  dayStatus, gridDayStatus, bestHabitStreak, describeSchedule, weekStart, weekdayLabels,
} from '../utils/schedule';
import feedback, { EVENTS } from '../services/feedback';
import HabitIcon from './HabitIcon';
import { describeGoal } from '../utils/habits';
import { isHabitDoneOnDay } from '../utils/dayStatus';
import { t, getLocale, useLocale } from '../i18n';
import { data } from '../theme/tokens';
import { numeric } from '../theme/typography';
import { SHEET_OFFSCREEN, sheetIn, sheetOut, sheetSettle } from '../theme/motion';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const WEEKS = 15;                       // ~3.5 months of history in the grid
const GRID_GAP = 3;
const DAY_LABEL_W = 22;
// The pre-§2.4 grid colours (same in both themes); V-02 moves the grid onto the data ramp.
const { heatPartial: PARTIAL_COLOR, heatFrozen: FROZEN_COLOR, heatMissed: MISSED_COLOR } = data.light;
// Today, not yet done: outlined neutral, never red (STA-4). A >= 3:1 neutral (3.47:1 on
// white); F-01 replaces the literal with the `controlBorder` token.
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first

function pct(n, d) {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

// Per-habit insight sheet: contribution grid (tap a past day to toggle it),
// completion rate, current/best streak and a weekday breakdown.
export default function HabitDetailSheet({ habit, onClose, onEdit }) {
  const {
    theme, todayStr, completions, isHabitDoneOn, getStreakForHabit,
    isExcused, toggleHabitDoneOn, setHabitCountOn, accountCreatedAt, isHabitSkippedOn,
  } = useApp();
  useLocale();

  const translateY = useRef(new Animated.Value(SHEET_OFFSCREEN)).current;
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (habit) {
      setVisible(true);
      translateY.setValue(SHEET_OFFSCREEN);
      sheetIn(translateY).start();
    }
  }, [habit]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = useCallback(() => {
    sheetOut(translateY).start(() => {
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
      else sheetSettle(translateY).start();
    },
  })).current;

  const today = todayStr();
  const WEEKDAY_LABELS = weekdayLabels();
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
        const before = isHabitDoneOnDay(habit, key, completions) === 'before' || !!(accountCreatedAt && key < accountCreatedAt);
        const status = future || before ? 'none' : gridDayStatus(habit.schedule, key, today, isDone, excused);
        days.push({ key, future, before, status, count: (completions[key] || {})[habit.id] || 0 });
      }
      const m = parseDateKey(start).getMonth();
      monthLabels.push(m !== lastMonth ? parseDateKey(start).toLocaleDateString(getLocale(), { month: 'short' }) : '');
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
    if (d.status === 'done') return theme.meter;
    if (d.count > 0) return PARTIAL_COLOR;
    if (d.status === 'pending') return 'transparent';
    if (d.status === 'rest') return isHabitSkippedOn(habit.id, d.key) || excused(d.key) ? FROZEN_COLOR : theme.track;
    return MISSED_COLOR;
  };

  const onCellPress = (d) => {
    if (d.future || d.before) return;
    if ((habit.type === 'volume' || habit.type === 'timed' || habit.type === 'atMost') && habit.volumeGoal >= 1) {
      // Counter habits: offer the meaningful values rather than a blind toggle.
      const isLimit = habit.type === 'atMost';
      Alert.alert(
        parseDateKey(d.key).toLocaleDateString(getLocale(), { weekday: 'short', month: 'short', day: 'numeric' }),
        isLimit
          ? t('habitDetail.fix.bodyMax', { name: habit.name, count: d.count, goal: habit.volumeGoal })
          : t('habitDetail.fix.body', { name: habit.name, count: d.count, goal: habit.volumeGoal }),
        [
          { text: t('habitDetail.fix.clear'), onPress: () => setHabitCountOn(habit.id, d.key, 0) },
          isLimit
            ? { text: t('habitDetail.fix.setOver', { value: habit.volumeGoal + 1 }), onPress: () => setHabitCountOn(habit.id, d.key, habit.volumeGoal + 1) }
            : { text: t('habitDetail.fix.setDone', { value: habit.volumeGoal }), onPress: () => setHabitCountOn(habit.id, d.key, habit.volumeGoal) },
          { text: t('common.cancel'), style: 'cancel' },
        ],
      );
      return;
    }
    // History editing is not the check-off moment: haptic only, no chime.
    feedback.play(isHabitDoneOn(habit, d.key) ? EVENTS.habitUndone : EVENTS.habitDone, { sound: false });
    toggleHabitDoneOn(habit.id, d.key);
  };

  const maxWeekdayRate = Math.max(1, ...stats.byWeekday.map(w => pct(w.done, w.expected)));

  return (
    <BottomSheet visible={visible} onClose={close} translateY={translateY} maxHeight="92%">
      <SheetDragHandle panHandlers={pan.panHandlers} theme={theme} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={styles.titleRow}>
          <HabitIcon habit={habit} size={34} imageStyle={styles.iconImage} textStyle={styles.icon} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: theme.text }]} numberOfLines={2}>{habit.name}</Text>
            <Text style={[styles.meta, { color: theme.textSecondary }]}>
              {t('habitDetail.meta', { schedule: describeSchedule(habit.schedule), goal: describeGoal(habit) })}
            </Text>
            {!!habit.intention && (
              <Text style={[styles.meta, { color: theme.link }]} numberOfLines={2}>{t('habitDetail.afterI', { intention: habit.intention })}</Text>
            )}
          </View>
          {onEdit && (
            <TouchableOpacity onPress={() => { close(); setTimeout(() => onEdit(habit), 250); }} style={[styles.editBtn, { borderColor: theme.border }]} accessibilityRole="button" accessibilityLabel={t('habitDetail.editA11y')}>
              <Text style={[styles.editBtnText, { color: theme.link }]}>{t('common.edit')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={close} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <Text style={[styles.closeTxt, { color: theme.textSecondary }]}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          {[
            { label: t('habitDetail.stats.current'), value: t('common.shortDays', { count: stats.current }), emoji: '🔥' },
            { label: t('habitDetail.stats.best'), value: t('common.shortDays', { count: stats.best }), emoji: '🏅' },
            { label: t('habitDetail.stats.done'), value: `${stats.rate}%`, emoji: '✅' },
            { label: t('habitDetail.stats.total'), value: String(stats.done), emoji: '📈' },
          ].map(s => (
            <View key={s.label} style={[styles.stat, { backgroundColor: theme.well, borderColor: theme.border }]} accessible accessibilityLabel={t('habitDetail.stats.a11y', { label: s.label, value: s.value })}>
              <Text style={styles.statEmoji}>{s.emoji}</Text>
              <Text style={[styles.statValue, { color: theme.link }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('habitDetail.history')}</Text>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>{t('habitDetail.hint')}</Text>

        {/* Month labels */}
        <View style={{ flexDirection: 'row', marginLeft: DAY_LABEL_W, marginBottom: 2 }}>
          {/* A month name at 12 pt is wider than one week column. It starts at its first
              week's column and runs into the empty columns after it (months are >= 4 columns
              apart); in the last column it runs into the sheet's side padding. */}
          {grid.monthLabels.map((m, i) => (
            <View key={i} style={{ width: cell + GRID_GAP, overflow: 'visible' }}>
              {!!m && (
                <Text
                  style={{ width: (cell + GRID_GAP) * 3, fontSize: 12, lineHeight: 16, color: theme.textSecondary }}
                  numberOfLines={1}
                >{m}</Text>
              )}
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ width: DAY_LABEL_W }}>
            {WEEKDAY_ORDER.map(d => (
              <Text key={d} style={{ height: cell + GRID_GAP, fontSize: 12, color: theme.textSecondary, lineHeight: cell + GRID_GAP }}>
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
                  accessibilityLabel={t('habitDetail.cellA11y', { date: d.key, status: t(`habitDetail.status.${d.future ? 'future' : d.status}`) })}
                  style={{
                    width: cell, height: cell, marginBottom: GRID_GAP, borderRadius: 3,
                    backgroundColor: colorFor(d),
                    borderWidth: d.key === today ? 1.5 : 0, borderColor: d.status === 'pending' ? theme.controlBorder : theme.text,
                  }}
                />
              ))}
            </View>
          ))}
        </View>
        <View style={styles.legend}>
          {[
            { c: theme.meter, l: t('habitDetail.legend.done') }, { c: PARTIAL_COLOR, l: t('habitDetail.legend.partial') },
            { c: MISSED_COLOR, l: t('habitDetail.legend.missed') }, { c: 'transparent', o: theme.controlBorder, l: t('habitDetail.legend.pending') },
            { c: FROZEN_COLOR, l: t('habitDetail.legend.skippedFrozen') }, { c: theme.track, l: t('habitDetail.legend.rest') },
          ].map(x => (
            <View key={x.l} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: x.c }, x.o && { borderWidth: 1.5, borderColor: x.o }]} />
              <Text style={[styles.legendText, { color: theme.textSecondary }]}>{x.l}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 20 }]}>{t('habitDetail.byWeekday')}</Text>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>{t('habitDetail.since', { date: stats.since })}</Text>
        <View style={styles.weekdayRow}>
          {WEEKDAY_ORDER.map(d => {
            const w = stats.byWeekday[d];
            const r = pct(w.done, w.expected);
            return (
              <View key={d} style={styles.weekdayCol} accessible accessibilityLabel={t('habitDetail.weekdayA11y', { day: WEEKDAY_LABELS[d], percent: r })}>
                <Text style={[styles.weekdayPct, { color: theme.textSecondary }]}>{w.expected > 0 ? `${r}%` : '–'}</Text>
                <View style={[styles.weekdayTrack, { backgroundColor: theme.track }]}>
                  <View style={[styles.weekdayFill, { height: `${Math.max(4, (r / maxWeekdayRate) * 100)}%`, backgroundColor: w.expected > 0 ? theme.meter : theme.border }]} />
                </View>
                <Text style={[styles.weekdayLabel, { color: theme.textSecondary }]}>{WEEKDAY_LABELS[d]}</Text>
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
  statValue: { fontSize: 17, fontWeight: 'bold', ...numeric },
  statLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 12, marginTop: 2, marginBottom: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontSize: 12 },
  weekdayRow: { flexDirection: 'row', gap: 6, height: 120, alignItems: 'flex-end' },
  weekdayCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  weekdayPct: { fontSize: 12, marginBottom: 4, ...numeric },
  weekdayTrack: { flex: 1, width: '70%', borderRadius: 4, overflow: 'hidden', justifyContent: 'flex-end' },
  weekdayFill: { width: '100%', borderRadius: 4 },
  weekdayLabel: { fontSize: 12, marginTop: 4, fontWeight: '600' },
});
