import React, { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Sheet from './ui/Sheet';
import Button from './ui/Button';
import IconButton from './ui/IconButton';
import AppText from './ui/AppText';
import SectionLabel from './ui/SectionLabel';
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
import { space, radius } from '../theme/tokens';
import { numeric } from '../theme/typography';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const WEEKS = 15;                       // ~3.5 months of history in the grid (H-01 sizes it)
const GRID_GAP = 3;
const DAY_LABEL_W = 22;
const OUTLINE = 1.5;                    // §2.4 cell outline
const TODAY_RING = 2;                   // §2.4 today marker
const LEGEND_CELL = 14;                 // the smallest cell that still draws the ❄
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first
// cellState -> habitDetail.status.* (the spoken word for each drawn state).
const SPOKEN = { done: 'done', partial: 'partial', missed: 'missed', pending: 'pending', rest: 'rest', frozen: 'skipped' };

function pct(n, d) {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

/**
 * The grid cell's state in the Today vocabulary (§2.4, pulled forward from V-02 by the M2 gate):
 * done = the `success` green of the Today ring and beats; partial = a green outline half
 * filled; missed = an empty `controlBorder` outline (never pink); rest = a dashed outline with
 * the half-rest bar (the Today rest beat); skipped / frozen = a solid outline with ❄; today
 * not yet done = an outline. Days before the habit or in the future are not drawn.
 */
export function cellState(d, frozen) {
  if (d.future || d.before) return 'none';
  if (d.status === 'done') return 'done';
  if (d.count > 0) return 'partial';
  if (d.status === 'pending') return 'pending';
  if (d.status === 'rest') return frozen ? 'frozen' : 'rest';
  return 'missed';
}

function GridCell({ state, size, today = false, theme }) {
  if (state === 'none') return <View style={{ width: size, height: size }} />;
  const ink = state === 'done' || state === 'partial' ? theme.success : theme.controlBorder;
  const box = {
    width: size, height: size, borderRadius: radius.cell,
    backgroundColor: state === 'done' ? theme.success : 'transparent',
    borderWidth: state === 'done' ? 0 : OUTLINE, borderColor: ink,
    borderStyle: state === 'rest' ? 'dashed' : 'solid',
  };
  if (today) Object.assign(box, { borderWidth: TODAY_RING, borderColor: theme.text, borderStyle: 'solid' });
  return (
    <View style={[styles.cell, box]}>
      {state === 'partial' && <View style={[styles.partialFill, { backgroundColor: theme.success }]} />}
      {state === 'rest' && <View style={[styles.restBar, { backgroundColor: theme.controlBorder }]} />}
      {state === 'frozen' && (size >= LEGEND_CELL
        ? <Ionicons name="snow" size={size - space.xs} color={theme.textSecondary} />
        : <View style={styles.dots}>{[0, 1, 2, 3].map(i => <View key={i} style={[styles.dot, { backgroundColor: theme.textSecondary }]} />)}</View>)}
    </View>
  );
}

// Per-habit insight sheet: contribution grid (tap a day to fix it), completion rate,
// current/best streak and a weekday breakdown, on the shared `ui/Sheet` (F-09a).
// `onSetToday(habit, count)`: the host's check-off pipeline for today's cell (C-02b review
// M1). Today passes its handlers, so a set / clear from here claims and un-claims challenge
// days, cancels queued Mark-the-rest completions, celebrates and plays feedback exactly like
// a card check-off. Without it (the Habits tab) today's cell only says where to log it.
// `onClose` runs once the sheet has gone; `onEdit(habit)` after the sheet has closed.
export default function HabitDetailSheet({ habit, onClose, onEdit, onSetToday, returnFocusRef }) {
  const {
    theme, todayStr, completions, isHabitDoneOn, getStreakForHabit,
    isExcused, toggleHabitDoneOn, setHabitCountOn, accountCreatedAt, isHabitSkippedOn,
  } = useApp();
  useLocale();

  // The sheet keeps drawing the last habit while it slides out (a host may clear `habit` first).
  const lastHabit = useRef(habit);
  if (habit) lastHabit.current = habit;
  const shown = habit || lastHabit.current;
  const habitId = habit ? habit.id : null;
  const [open, setOpen] = useState(!!habit);
  const closingRef = useRef(false);
  useEffect(() => { closingRef.current = !habitId; setOpen(!!habitId); }, [habitId]);
  // `then` runs once the exit has finished and the sheet's Modal is gone, so the next overlay
  // (the Edit form) never opens over this one. Ignores non-function arguments. A second close
  // during the exit (scrim, back) keeps the first one's `then`, so Edit is never dropped.
  const thenRef = useRef(null);
  const close = useCallback((then) => {
    if (closingRef.current) return;
    closingRef.current = true;
    thenRef.current = typeof then === 'function' ? then : null;
    setOpen(false);
  }, []);
  const handleDismiss = useCallback(() => {
    const then = thenRef.current;
    thenRef.current = null;
    onClose();
    if (then) then();
  }, [onClose]);

  const today = todayStr();
  const WEEKDAY_LABELS = weekdayLabels();
  const isDone = useCallback((k) => (shown ? isHabitDoneOn(shown, k) : false), [shown, isHabitDoneOn]);
  const excused = useCallback((k) => (shown ? isExcused(k, shown.id) : false), [shown, isExcused]);

  // Grid: WEEKS columns ending with the current week, rows Monday..Sunday.
  const grid = useMemo(() => {
    if (!shown) return { weeks: [], monthLabels: [] };
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
        const before = isHabitDoneOnDay(shown, key, completions) === 'before' || !!(accountCreatedAt && key < accountCreatedAt);
        const status = future || before ? 'none' : gridDayStatus(shown.schedule, key, today, isDone, excused);
        days.push({ key, future, before, status, count: (completions[key] || {})[shown.id] || 0 });
      }
      const m = parseDateKey(start).getMonth();
      monthLabels.push(m !== lastMonth ? parseDateKey(start).toLocaleDateString(getLocale(), { month: 'short' }) : '');
      lastMonth = m;
      weeks.push({ start, days });
    }
    return { weeks, monthLabels };
  }, [shown, today, completions, accountCreatedAt, isDone, excused]);

  // Stats over the habit's lifetime (capped at the grid window for the weekday chart).
  const stats = useMemo(() => {
    if (!shown) return null;
    const floor = [shown.createdAt, accountCreatedAt].filter(Boolean).sort().pop() || today;
    const from = floor > today ? today : floor;
    let expected = 0, done = 0, total = 0;
    const byWeekday = Array.from({ length: 7 }, () => ({ done: 0, expected: 0 }));
    let key = from;
    let guard = 0;
    while (key <= today && guard++ < 3660) {
      const st = dayStatus(shown.schedule, key, today, isDone, excused);
      const dow = parseDateKey(key).getDay();
      if (st === 'done') { done++; total++; expected++; byWeekday[dow].done++; byWeekday[dow].expected++; }
      else if (st === 'missed' && key !== today) { expected++; byWeekday[dow].expected++; }
      key = addDays(key, 1);
    }
    return {
      done, expected,
      rate: pct(done, expected),
      current: getStreakForHabit(shown.id),
      best: Math.max(bestHabitStreak(shown.schedule, from, today, today, isDone, excused), getStreakForHabit(shown.id)),
      byWeekday,
      since: from,
    };
  }, [shown, today, accountCreatedAt, isDone, excused, getStreakForHabit]);

  if (!shown) return null;

  const cell = Math.floor((SCREEN_WIDTH - space.lg * 2 - DAY_LABEL_W - GRID_GAP * (WEEKS - 1)) / WEEKS);
  const frozenOn = (key) => isHabitSkippedOn(shown.id, key) || excused(key);

  const dateLabel = (key) => parseDateKey(key).toLocaleDateString(getLocale(), { weekday: 'short', month: 'short', day: 'numeric' });
  // "Sep 17" (with the year once it is not this year), in the UI language.
  const sinceLabel = (key) => {
    const d = parseDateKey(key);
    const opts = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== parseDateKey(today).getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString(getLocale(), opts);
  };
  // The spoken state follows the drawn one (review m3): partial and skipped/frozen get their own
  // words, and a counter day says its count ("3 of 8").
  const cellLabel = (d, state) => {
    const status = t(`habitDetail.status.${SPOKEN[state] || d.status}`);
    const date = dateLabel(d.key);
    return isCounter && d.count > 0
      ? t('habitDetail.cellA11yCount', { date, status, count: d.count, goal: shown.volumeGoal })
      : t('habitDetail.cellA11y', { date, status });
  };
  const isCounter = (shown.type === 'volume' || shown.type === 'timed' || shown.type === 'atMost') && shown.volumeGoal >= 1;
  const onCellPress = (d) => {
    if (d.future || d.before) return;
    const isToday = d.key === today;
    if (isToday && !onSetToday) {
      // No check-off pipeline here (Habits tab): today is logged on Today, where the claim,
      // undo and celebration logic lives. A pressable that explains, rather than a silent cell.
      Alert.alert(dateLabel(d.key), t('habitDetail.todayOnToday'), [{ text: t('common.close') }]);
      return;
    }
    // Today goes through the host's handlers; past days are history edits.
    const apply = isToday ? (value) => onSetToday(shown, value) : (value) => setHabitCountOn(shown.id, d.key, value);
    if (isCounter) {
      // Counter habits: offer the meaningful values rather than a blind toggle.
      const isLimit = shown.type === 'atMost';
      Alert.alert(
        dateLabel(d.key),
        isLimit
          ? t('habitDetail.fix.bodyMax', { name: shown.name, count: d.count, goal: shown.volumeGoal })
          : t('habitDetail.fix.body', { name: shown.name, count: d.count, goal: shown.volumeGoal }),
        [
          { text: t('habitDetail.fix.clear'), onPress: () => apply(0) },
          isLimit
            ? { text: t('habitDetail.fix.setOver', { value: shown.volumeGoal + 1 }), onPress: () => apply(shown.volumeGoal + 1) }
            : { text: t('habitDetail.fix.setDone', { value: shown.volumeGoal }), onPress: () => apply(shown.volumeGoal) },
          { text: t('common.cancel'), style: 'cancel' },
        ],
      );
      return;
    }
    if (isToday) {
      // Daily / quit today: the host's toggle plays the check-off feedback itself.
      apply(isHabitDoneOn(shown, d.key) ? 0 : 1);
      return;
    }
    // History editing is not the check-off moment: haptic only, no chime.
    feedback.play(isHabitDoneOn(shown, d.key) ? EVENTS.habitUndone : EVENTS.habitDone, { sound: false });
    toggleHabitDoneOn(shown.id, d.key);
  };

  const maxWeekdayRate = Math.max(1, ...stats.byWeekday.map(w => pct(w.done, w.expected)));
  const tiles = [
    { key: 'current', label: t('habitDetail.stats.current'), value: t('common.shortDays', { count: stats.current }), icon: 'flame', color: theme.signature },
    { key: 'best', label: t('habitDetail.stats.best'), value: t('common.shortDays', { count: stats.best }), icon: 'trophy-outline', color: theme.textSecondary },
    { key: 'done', label: t('habitDetail.stats.done'), value: `${stats.rate}%`, icon: 'checkmark-circle', color: theme.success },
    { key: 'total', label: t('habitDetail.stats.total'), value: String(stats.done), icon: 'stats-chart', color: theme.textSecondary },
  ];
  const legend = [
    { s: 'done', l: t('habitDetail.legend.done') },
    { s: 'partial', l: t('habitDetail.legend.partial') },
    { s: 'missed', l: t('habitDetail.legend.missed') },
    { s: 'pending', l: t('habitDetail.legend.pending'), today: true },
    { s: 'frozen', l: t('habitDetail.legend.skippedFrozen') },
    { s: 'rest', l: t('habitDetail.legend.rest') },
  ];

  const header = ({ titleRef }) => (
    <View style={styles.titleRow}>
      <HabitIcon habit={shown} size={34} imageStyle={styles.iconImage} textStyle={styles.icon} />
      <View style={styles.titleText}>
        <AppText ref={titleRef} variant="headline" style={{ color: theme.text }} numberOfLines={2} accessibilityRole="header">{shown.name}</AppText>
        <AppText variant="footnote" style={{ color: theme.textSecondary }}>
          {t('habitDetail.meta', { schedule: describeSchedule(shown.schedule), goal: describeGoal(shown) })}
        </AppText>
        {!!shown.intention && (
          <AppText variant="footnote" style={{ color: theme.link }} numberOfLines={2}>{t('habitDetail.afterI', { intention: shown.intention })}</AppText>
        )}
      </View>
      {onEdit && (
        <Button
          variant="secondary"
          size="sm"
          label={t('common.edit')}
          accessibilityLabel={t('habitDetail.editA11y')}
          onPress={() => close(() => onEdit(shown))}
          theme={theme}
        />
      )}
      <IconButton icon="close" iconSize={24} theme={theme} onPress={() => close()} accessibilityLabel={t('common.close')} style={styles.closeBtn} />
    </View>
  );

  return (
    <Sheet
      visible={open && !!habit}
      onClose={close}
      onDismiss={handleDismiss}
      header={header}
      accessibilityLabel={shown.name}
      returnFocusRef={returnFocusRef}
      contentContainerStyle={styles.body}
      theme={theme}
      testID="habit-detail-sheet"
    >
      <View style={styles.statsRow}>
        {tiles.map(s => (
          <View key={s.key} style={[styles.stat, { backgroundColor: theme.well }]} accessible accessibilityLabel={t('habitDetail.stats.a11y', { label: s.label, value: s.value })}>
            <Ionicons name={s.icon} size={16} color={s.color} />
            <AppText variant="headline" style={[numeric, { color: theme.text }]} numberOfLines={1}>{s.value}</AppText>
            <AppText variant="caption" style={{ color: theme.textSecondary }} numberOfLines={1}>{s.label}</AppText>
          </View>
        ))}
      </View>

      <SectionLabel icon="calendar-outline" label={t('habitDetail.history')} theme={theme} />
      <AppText variant="footnote" style={[styles.hint, { color: theme.textSecondary }]}>
        {t(onSetToday ? 'habitDetail.hintToday' : 'habitDetail.hintHabits')}
      </AppText>

      {/* Month labels */}
      <View style={[styles.monthRow, { marginLeft: DAY_LABEL_W }]}>
        {/* A month name at 12 pt is wider than one week column. It starts at its first
            week's column and runs into the empty columns after it (months are >= 4 columns
            apart); in the last column it runs into the sheet's side padding. No numberOfLines: on web it
            caps the label at its one-column parent and truncates "Aug" on SE. */}
        {grid.monthLabels.map((m, i) => (
          <View key={i} style={{ width: cell + GRID_GAP, overflow: 'visible' }}>
            {!!m && (
              <Text
                style={{ width: (cell + GRID_GAP) * 4, fontSize: 12, lineHeight: 16, color: theme.textSecondary }}
              >{m}</Text>
            )}
          </View>
        ))}
      </View>
      <View style={styles.gridRow}>
        <View style={{ width: DAY_LABEL_W }}>
          {WEEKDAY_ORDER.map(d => (
            <Text key={d} style={{ height: cell + GRID_GAP, fontSize: 12, color: theme.textSecondary, lineHeight: cell + GRID_GAP }}>
              {d === 1 || d === 3 || d === 5 ? WEEKDAY_LABELS[d] : ''}
            </Text>
          ))}
        </View>
        {grid.weeks.map(w => (
          <View key={w.start} style={{ marginRight: GRID_GAP }}>
            {w.days.map(d => {
              const state = cellState(d, frozenOn(d.key));
              const hidden = state === 'none';
              return (
                <TouchableOpacity
                  key={d.key}
                  testID={`cell-${d.key}`}
                  onPress={() => onCellPress(d)}
                  disabled={hidden}
                  activeOpacity={0.6}
                  accessible={!hidden}
                  accessibilityRole="button"
                  accessibilityLabel={hidden ? undefined : cellLabel(d, state)}
                  style={{ marginBottom: GRID_GAP }}
                >
                  <GridCell state={state} size={cell} today={d.key === today} theme={theme} />
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        {legend.map(x => (
          <View key={x.s} style={styles.legendItem}>
            <GridCell state={x.s} size={LEGEND_CELL} today={x.today} theme={theme} />
            <AppText variant="caption" style={{ color: theme.textSecondary }}>{x.l}</AppText>
          </View>
        ))}
      </View>

      <SectionLabel icon="bar-chart-outline" label={t('habitDetail.byWeekday')} theme={theme} />
      <AppText variant="footnote" style={[styles.hint, { color: theme.textSecondary }]}>{t('habitDetail.since', { date: sinceLabel(stats.since) })}</AppText>
      <View style={styles.weekdayRow}>
        {WEEKDAY_ORDER.map(d => {
          const w = stats.byWeekday[d];
          const r = pct(w.done, w.expected);
          return (
            <View key={d} style={styles.weekdayCol} accessible accessibilityLabel={t('habitDetail.weekdayA11y', { day: WEEKDAY_LABELS[d], percent: r })}>
              <Text style={[styles.weekdayPct, { color: theme.textSecondary }]}>{w.expected > 0 ? `${r}%` : '–'}</Text>
              <View style={[styles.weekdayTrack, { backgroundColor: theme.track }]}>
                <View style={[styles.weekdayFill, { height: `${Math.max(4, (r / maxWeekdayRate) * 100)}%`, backgroundColor: w.expected > 0 ? theme.success : theme.border }]} />
              </View>
              <Text style={[styles.weekdayLabel, { color: theme.textSecondary }]}>{WEEKDAY_LABELS[d]}</Text>
            </View>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  titleText: { flex: 1 },
  icon: { fontSize: 34 },
  iconImage: { width: 40, height: 40, borderRadius: radius.control },
  // The 40 pt button's icon lines up with the sheet's content edge.
  closeBtn: { marginRight: -space.xs },
  body: { paddingTop: space.xs, paddingBottom: space.lg },
  statsRow: { flexDirection: 'row', gap: space.xs },
  stat: { flex: 1, alignItems: 'center', paddingVertical: space.sm, paddingHorizontal: space.xxs, borderRadius: radius.card },
  hint: { marginBottom: space.xs },
  monthRow: { flexDirection: 'row', marginBottom: space.xxs },
  gridRow: { flexDirection: 'row' },
  cell: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  partialFill: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%' },
  restBar: { width: '50%', height: 2, borderRadius: radius.pill },
  dots: { width: 6, height: 6, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignContent: 'space-between' },
  dot: { width: 2, height: 2, borderRadius: radius.pill },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.sm, rowGap: space.xs, marginTop: space.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  weekdayRow: { flexDirection: 'row', gap: space.xs, height: 120, alignItems: 'flex-end' },
  weekdayCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  weekdayPct: { fontSize: 12, marginBottom: space.xxs, ...numeric },
  weekdayTrack: { flex: 1, width: '70%', borderRadius: radius.cell, overflow: 'hidden', justifyContent: 'flex-end' },
  weekdayFill: { width: '100%', borderRadius: radius.cell },
  weekdayLabel: { fontSize: 12, marginTop: space.xxs, fontWeight: '600' },
});
