import React, { useMemo, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Dimensions,
  TouchableOpacity, Modal, Animated, PanResponder, ActivityIndicator,
} from 'react-native';
import SafeAreaView from '../components/SafeAreaView';
import { useApp, STREAK_MILESTONES, TIER_STYLES } from '../context/AppContext';
import { lightImpact, mediumImpact } from '../utils/haptics';
import { fetchReflection } from '../services/aiCoaching';
import { localDateKey, addDays } from '../utils/dates';
import { moodSummary, habitMoodCorrelations, describeCorrelation, moodEmoji, MIN_SAMPLES } from '../utils/mood';
import { overallDayStatus } from '../utils/streaks';
import ShareCards from '../components/ShareCards';
import Dialog from '../components/ui/Dialog';
import { Ionicons } from '@expo/vector-icons';
import { weekdayLabels } from '../utils/schedule';
import { t, getLocale, useLocale } from '../i18n';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CHART_H = 150;
const PARTIAL_COLOR = '#FDE68A';
const FROZEN_COLOR = '#7DD3FC';

// Card inner width: screen − 48 (scroll padding) − 40 (card padding=20×2) − 2 (border)
const HEAT_INNER = SCREEN_WIDTH - 90;

const PERIOD_CONFIG = [
  { key: 'd7',  days: 7,   cellsPerRow: 7,  gap: 4 },
  { key: 'd30', days: 30,  cellsPerRow: 10, gap: 4 },
  { key: 'd90', days: 90,  cellsPerRow: 10, gap: 3 },
];

function cellSize(cfg) {
  return Math.floor((HEAT_INNER - (cfg.cellsPerRow - 1) * cfg.gap) / cfg.cellsPerRow);
}

// ─── Bar chart (always 7 days) ────────────────────────────────────────────────

function BarChart({ data, labels, theme, onBarPress, futureFlags, a11yLabels }) {
  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: 'row', height: CHART_H }}>
        {/* Y-axis */}
        <View style={{ width: 32, height: CHART_H }}>
          {[100, 75, 50, 25, 0].map(y => (
            <Text
              key={y}
              style={{
                position: 'absolute',
                right: 4,
                top: ((100 - y) / 100) * (CHART_H - 14),
                fontSize: 9,
                color: theme.textMuted,
                textAlign: 'right',
                width: 28,
              }}
            >
              {y}%
            </Text>
          ))}
        </View>
        {/* Bars */}
        <View style={{ flex: 1, height: CHART_H, flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
          {data.map((val, i) => {
            const isFuture = futureFlags?.[i];
            const barH = Math.max((val / 100) * CHART_H, 3);
            return (
              <TouchableOpacity
                key={i}
                style={{ flex: 1, height: CHART_H, justifyContent: 'flex-end', alignItems: 'center' }}
                onPress={() => !isFuture && onBarPress?.(i, val)}
                activeOpacity={isFuture ? 1 : 0.7}
                accessibilityRole="button"
                accessibilityLabel={a11yLabels?.[i] ?? (isFuture ? t('progress.bar.noData', { label: labels[i] }) : t('progress.bar.percent', { label: labels[i], value: val }))}
                accessibilityState={{ disabled: !!isFuture }}
              >
                {!isFuture && (
                  <View style={{ width: '70%', height: barH, backgroundColor: theme.primary, borderRadius: 4 }} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      {/* X-axis */}
      <View style={{ flexDirection: 'row', marginLeft: 32, marginTop: 4 }}>
        {labels.map((l, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, color: theme.textMuted }}>{l}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Heatmap cell ─────────────────────────────────────────────────────────────

function HeatmapCell({ day, size, gap, theme, onPress }) {
  const { completed, total, future, frozen } = day;
  // Before any habit existed: not drawn and not focusable (plan §2.4), never a miss.
  if (day.before) {
    return <View style={{ width: size, height: size, marginRight: gap, marginBottom: gap }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
  }
  let bg = theme.progressBarBg;
  if (!future && total > 0 && completed >= total) bg = theme.primary;
  else if (!future && frozen) bg = FROZEN_COLOR;
  else if (!future && total > 0 && completed > 0) bg = PARTIAL_COLOR;

  const dateLabel = new Date(day.date + 'T00:00:00').toLocaleDateString(getLocale(), { weekday: 'short', month: 'short', day: 'numeric' });
  const a11yLabel = future
    ? t('progress.heat.future', { date: dateLabel })
    : total === 0
      ? t('progress.heat.rest', { date: dateLabel })
      : t(frozen ? 'progress.heat.countFrozen' : 'progress.heat.count', { date: dateLabel, completed, total });
  const interactive = !future && total > 0;

  return (
    <TouchableOpacity
      onPress={() => interactive && onPress?.(day)}
      activeOpacity={interactive ? 0.7 : 1}
      style={{ marginRight: gap, marginBottom: gap }}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityState={{ disabled: !interactive }}
    >
      <View style={{ width: size, height: size, borderRadius: Math.max(3, size * 0.18), backgroundColor: bg, opacity: future ? 0.3 : 1 }} />
    </TouchableOpacity>
  );
}

// ─── Day detail sheet ─────────────────────────────────────────────────────────

function DayDetailModal({ visible, day, onClose, theme }) {
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const [internalVisible, setInternalVisible] = useState(false);

  React.useEffect(() => {
    if (visible && day) {
      setInternalVisible(true);
      translateY.setValue(SCREEN_HEIGHT);
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    }
  }, [visible, day]);

  const doClose = useCallback(() => {
    Animated.timing(translateY, { toValue: SCREEN_HEIGHT, duration: 220, useNativeDriver: true }).start(() => {
      setInternalVisible(false);
      onClose();
    });
  }, [translateY, onClose]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 5,
      onPanResponderMove: (_, gs) => { if (gs.dy > 0) translateY.setValue(gs.dy); },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80) doClose();
        else Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80 }).start();
      },
    })
  ).current;

  if (!day) return null;

  const date = new Date(day.date + 'T00:00:00');
  const dateLabel = date.toLocaleDateString(getLocale(), { weekday: 'long', month: 'long', day: 'numeric' });
  const dayHabits = day.habits || [];
  const dayCompletions = day.rawCompletions || {};

  return (
    <Modal visible={internalVisible} animationType="none" transparent onRequestClose={doClose}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.sheet, { backgroundColor: theme.surface, transform: [{ translateY }] }]}>
          <View {...panResponder.panHandlers} style={styles.dragHandleArea}>
            <View style={[styles.handleBar, { backgroundColor: theme.border }]} />
          </View>
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetTitle, { color: theme.text }]}>{dateLabel}</Text>
              <Text style={[styles.sheetSub, { color: theme.textMuted }]}>
                {t('progress.day.habitsCompleted', { completed: day.completed, total: day.total })}
              </Text>
            </View>
            <TouchableOpacity onPress={doClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Text style={[styles.closeBtnTxt, { color: theme.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>
          {day.frozen && (
            <Text style={[styles.sheetSub, { color: '#0369A1', marginBottom: 8 }]}>{t('progress.day.frozen')}</Text>
          )}

          <View style={[styles.ratioBarBg, { backgroundColor: theme.progressBarBg }]}>
            <View style={[styles.ratioBarFill, {
              width: day.total > 0 ? `${(day.completed / day.total) * 100}%` : '0%',
              backgroundColor: theme.primary,
            }]} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 16 }}>
            {dayHabits.length === 0 ? (
              <Text style={[styles.noData, { color: theme.textMuted }]}>{t('progress.day.noData')}</Text>
            ) : (
              dayHabits.map(h => {
                const count = dayCompletions[h.id] || 0;
                const done = h.status === 'done'; // shared rule (utils/dayStatus.js summarizeDay)
                const rest = !done && h.status === 'rest';
                return (
                  <View key={h.id} style={[styles.habitRow, { borderBottomColor: theme.border, opacity: rest ? 0.55 : 1 }]}>
                    <Text style={styles.habitIcon}>{h.icon || '📋'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.habitName, { color: theme.text }]}>{h.name}</Text>
                      {rest ? (
                        <Text style={[styles.habitSub, { color: theme.textMuted }]}>{h.skipped ? t('progress.day.skipped') : day.frozen ? t('progress.day.frozenLabel') : t('progress.day.notScheduled')}</Text>
                      ) : h.volumeGoal > 1 ? (
                        <Text style={[styles.habitSub, { color: theme.textMuted }]}>{count}/{h.volumeGoal}</Text>
                      ) : null}
                    </View>
                    <Text style={{ fontSize: 18 }}>{done ? '✅' : rest ? '💤' : '⬜'}</Text>
                  </View>
                );
              })
            )}
            <View style={{ height: 32 }} />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Bar tooltip ──────────────────────────────────────────────────────────────

function BarTooltip({ label, value, onClose, theme }) {
  return (
    <TouchableOpacity
      style={styles.tooltipOverlay}
      onPress={onClose}
      activeOpacity={1}
      accessibilityRole="button"
      accessibilityLabel={t('progress.tooltip.a11y', { label, value })}
    >
      <View style={[styles.tooltip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.tooltipLabel, { color: theme.textMuted }]}>{label}</Text>
        <Text style={[styles.tooltipValue, { color: theme.primary }]}>{value}%</Text>
        <Text style={[styles.tooltipHint, { color: theme.textMuted }]}>{t('progress.tooltip.completed')}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ProgressScreen() {
  const { getLastNDays, getOverallStreak, getBestStreak, freezesLeft, habits, theme, completions, accountCreatedAt, displayName, todayStr, devMode, settings, effectivePastChallenges, moods, habitsOnDay, isSnapshotHabitDone, isHabitDoneOn, isExcused, isPro, openPaywall } = useApp();
  const { locale } = useLocale();
  const dayLabels = weekdayLabels();

  // Mood insights: averages on perfect vs other days and per-habit deltas.
  const moodInsights = useMemo(() => {
    const today = todayStr();
    const isPerfect = (k) => overallDayStatus(k, today, habitsOnDay, isSnapshotHabitDone, isExcused) === 'done';
    const summary = moodSummary(moods, isPerfect);
    const correlations = habitMoodCorrelations(moods, habits, (h, k) => isHabitDoneOn(h, k));
    const last7 = Array.from({ length: 7 }, (_, i) => { const k = addDays(today, -(6 - i)); return { key: k, mood: moods[k] ?? null }; });
    return { summary, correlations, last7, headline: describeCorrelation(correlations[0]) };
  }, [moods, habits, habitsOnDay, isSnapshotHabitDone, todayStr, isHabitDoneOn, isExcused, locale]); // eslint-disable-line react-hooks/exhaustive-deps
  const earned = useMemo(() => new Map((settings.milestones || []).map(m => [m.id, m])), [settings.milestones]);
  const trophies = useMemo(() => effectivePastChallenges.filter(c => c.tier && c.tier !== 'none'), [effectivePastChallenges]);
  const [heatPeriodIdx, setHeatPeriodIdx] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [streakRuleOpen, setStreakRuleOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [tooltipInfo, setTooltipInfo] = useState(null);

  const [reflectionPeriod, setReflectionPeriod] = useState('weekly');
  const [reflectionMessage, setReflectionMessage] = useState(null);
  const [reflectionLoading, setReflectionLoading] = useState(false);
  const [reflectionError, setReflectionError] = useState(false);
  const [reflectionErrorMsg, setReflectionErrorMsg] = useState('');
  const [reflectionGeneratedAt, setReflectionGeneratedAt] = useState(null);

  // Days since account creation (0 = creation day).
  // Uses todayStr() so dev date offsets are reflected in the thresholds.
  const accountAgeDays = useMemo(() => {
    if (!accountCreatedAt) return 999;
    return Math.round((Date.parse(todayStr()) - Date.parse(accountCreatedAt)) / 86400000);
  }, [accountCreatedAt, todayStr]);

  // Use only complete prior days (exclude today) for AI coaching thresholds.
  // accountAgeDays = 0 on creation day, 1 on the next day, etc.
  const canGenerateWeekly  = accountAgeDays >= 7;
  const canGenerateMonthly = accountAgeDays >= 30;
  const daysUntilWeekly    = Math.max(0, 7  - accountAgeDays);
  const daysUntilMonthly   = Math.max(0, 30 - accountAgeDays);

  const reflectionLocked = reflectionPeriod === 'weekly' ? !canGenerateWeekly : !canGenerateMonthly;

  // In dev mode the reflection window follows the simulated date offset; otherwise it
  // always uses the real local date.
  const coachToday = devMode ? todayStr() : localDateKey();

  const handleGenerateReflection = useCallback(async () => {
    if (habits.length === 0) return;
    if (reflectionPeriod === 'weekly'  && !canGenerateWeekly)  return;
    if (reflectionPeriod === 'monthly' && !canGenerateMonthly) return;
    setReflectionLoading(true);
    setReflectionMessage(null);
    setReflectionError(false);
    lightImpact();
    try {
      const data = await fetchReflection(reflectionPeriod, accountCreatedAt, displayName, coachToday);
      if (data?.message) {
        setReflectionMessage(data.message);
        setReflectionGeneratedAt(data.generatedAt ?? new Date().toISOString());
      }
    } catch (e) {
      setReflectionError(true);
      setReflectionErrorMsg(e?.message || '');
    } finally {
      setReflectionLoading(false);
    }
  }, [habits.length, reflectionPeriod, canGenerateWeekly, canGenerateMonthly, accountCreatedAt, displayName, coachToday]);

  const heatCfg = PERIOD_CONFIG[heatPeriodIdx];

  // Always use 7 days for the bar chart
  const last7 = useMemo(() => getLastNDays(7), [getLastNDays]);
  // Use the selected period for the heatmap
  const heatDays = useMemo(() => getLastNDays(heatCfg.days), [getLastNDays, heatCfg.days]);

  const streak = getOverallStreak();
  const bestStreak = getBestStreak();
  const allDays30 = useMemo(() => getLastNDays(30), [getLastNDays]);
  const totalCompleted = allDays30.reduce((a, d) => a + (d.completed === d.total && d.total > 0 ? 1 : 0), 0);

  const chartLabels = useMemo(() =>
    last7.map(d => {
      const date = new Date(d.date + 'T00:00:00');
      return dayLabels[date.getDay()];
    }),
    [last7, locale] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const chartData = useMemo(() =>
    last7.map(d => d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0),
    [last7]
  );

  const futureFlagsBar = useMemo(() => last7.map(d => !!(d.future || d.before)), [last7]);

  const chartA11yLabels = useMemo(() =>
    last7.map((d, i) => {
      const date = new Date(d.date + 'T00:00:00');
      const label = date.toLocaleDateString(getLocale(), { weekday: 'short', month: 'short', day: 'numeric' });
      return d.future || d.before ? t('progress.bar.noData', { label }) : t('progress.bar.percent', { label, value: chartData[i] });
    }),
    [last7, chartData, locale] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleBarPress = (i, val) => {
    const d = last7[i];
    if (d.future || d.before) return;
    lightImpact();
    const date = new Date(d.date + 'T00:00:00');
    const label = date.toLocaleDateString(getLocale(), { weekday: 'short', month: 'short', day: 'numeric' });
    setTooltipInfo({ label, value: val });
  };

  const handleDayPress = (day) => {
    lightImpact();
    const raw = completions[day.date] || {};
    setSelectedDay({ ...day, rawCompletions: raw });
  };

  const cs = cellSize(heatCfg);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headingRow}>
          <Text style={[styles.heading, { color: theme.text }]}>{t('progress.title')}</Text>
          <TouchableOpacity
            style={[styles.shareChip, { borderColor: theme.border, backgroundColor: theme.surface }]}
            onPress={() => { lightImpact(); setShareOpen(true); }}
            accessibilityRole="button"
            accessibilityLabel={t('progress.shareA11y')}
          >
            <Ionicons name="share-social-outline" size={18} color={theme.primary} />
            <Text style={[styles.shareChipText, { color: theme.primary }]}>{t('progress.share')}</Text>
          </TouchableOpacity>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          {[
            { label: t('progress.stats.streak'), value: streak, emoji: '🔥', info: true },
            { label: t('progress.stats.best'), value: bestStreak, emoji: '🏅' },
            { label: t('progress.stats.perfect'), value: totalCompleted, emoji: '⭐' },
          ].map(stat => (
            <View key={stat.label} style={styles.statSlot}>
              <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]} accessible accessibilityLabel={t('progress.stats.a11y', { label: stat.label, value: stat.value })}>
                <Text style={styles.statEmoji}>{stat.emoji}</Text>
                <Text style={[styles.statValue, { color: theme.primary }]}>{stat.value}</Text>
                <Text style={[styles.statLabel, { color: theme.textMuted }]}>{stat.label}</Text>
              </View>
              {stat.info && (
                // A sibling of the card, not a child: the card is one accessible element.
                <TouchableOpacity
                  style={styles.statInfo}
                  onPress={() => { lightImpact(); setStreakRuleOpen(true); }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('progress.streakRule.a11y')}
                >
                  <Ionicons name="information-circle-outline" size={18} color={theme.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
        <Text style={[styles.freezeLine, { color: theme.textMuted }]}>
          {t('progress.freezes', { count: freezesLeft })}
        </Text>

        {/* Weekly bar chart — always 7 days */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{t('progress.weekly.title')}</Text>
          <Text style={[styles.cardHint, { color: theme.textMuted }]}>{t('progress.weekly.hint')}</Text>
          <BarChart data={chartData} labels={chartLabels} theme={theme} onBarPress={handleBarPress} futureFlags={futureFlagsBar} a11yLabels={chartA11yLabels} />
        </View>

        {/* Heatmap with period toggle */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{t('progress.history')}</Text>
            <View style={styles.periodToggle}>
              {PERIOD_CONFIG.map((cfg, i) => (
                <TouchableOpacity
                  key={cfg.key}
                  style={[
                    styles.periodBtn,
                    { borderColor: theme.border },
                    heatPeriodIdx === i && { backgroundColor: theme.primary, borderColor: theme.primary },
                  ]}
                  onPress={() => { lightImpact(); setHeatPeriodIdx(i); }}
                  accessibilityRole="button"
                  accessibilityLabel={t('progress.lastDaysA11y', { count: cfg.days })}
                  accessibilityState={{ selected: heatPeriodIdx === i }}
                >
                  <Text style={[styles.periodBtnText, { color: heatPeriodIdx === i ? '#fff' : theme.textMuted }]}>
                    {t(`progress.period.${cfg.key}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Legend */}
          <View style={styles.heatLegend}>
            {[
              { color: theme.progressBarBg, label: t('progress.legend.none') },
              { color: PARTIAL_COLOR, label: t('progress.legend.partial') },
              { color: FROZEN_COLOR, label: t('progress.legend.frozen') },
              { color: theme.primary, label: t('progress.legend.perfect') },
            ].map(l => (
              <View key={l.label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: l.color }]} />
                <Text style={[styles.legendLabel, { color: theme.textMuted }]}>{l.label}</Text>
              </View>
            ))}
          </View>

          <Text style={[styles.cardHint, { color: theme.textMuted }]}>{t('progress.heatHint')}</Text>

          {/* Grid: fixed-size cells for all periods, left-aligned so count grows from 1→N */}
          <View style={[styles.heatGrid, { marginRight: -heatCfg.gap }]}>
            {heatDays.map(d => (
              <HeatmapCell
                key={d.date}
                day={d}
                size={cs}
                gap={heatCfg.gap}
                theme={theme}
                onPress={handleDayPress}
              />
            ))}
          </View>
        </View>
        {/* Mood insights */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{t('progress.mood.title')}</Text>
          <Text style={[styles.cardHint, { color: theme.textMuted }]}>{t('progress.mood.hint')}</Text>
          <View style={styles.moodStrip} accessible accessibilityLabel={t('progress.mood.last7A11y', { list: moodInsights.last7.map(d => d.mood ?? t('progress.mood.none')).join(', ') })}>
            {moodInsights.last7.map(d => (
              <View key={d.key} style={styles.moodDay}>
                <Text style={[styles.moodDayEmoji, !d.mood && { opacity: 0.25 }]}>{d.mood ? moodEmoji(d.mood) : '·'}</Text>
                <Text style={[styles.moodDayLabel, { color: theme.textMuted }]}>{dayLabels[new Date(d.key + 'T00:00:00').getDay()]}</Text>
              </View>
            ))}
          </View>
          {moodInsights.summary.count < MIN_SAMPLES ? (
            <Text style={[styles.cardHint, { color: theme.textMuted, marginTop: 8 }]}>
              {t('progress.mood.rateMore', { count: moodInsights.summary.count, min: MIN_SAMPLES })}
            </Text>
          ) : (
            <>
              <View style={styles.moodStats}>
                <View style={[styles.moodStat, { backgroundColor: theme.bg, borderColor: theme.border }]} accessible accessibilityLabel={t('progress.mood.avgA11y', { value: moodInsights.summary.average })}>
                  <Text style={[styles.moodStatValue, { color: theme.primary }]}>{moodInsights.summary.average}</Text>
                  <Text style={[styles.moodStatLabel, { color: theme.textMuted }]}>{t('progress.mood.avg')}</Text>
                </View>
                <View style={[styles.moodStat, { backgroundColor: theme.bg, borderColor: theme.border }]} accessible accessibilityLabel={t('progress.mood.perfectA11y', { value: moodInsights.summary.perfectAvg ?? t('progress.mood.noData') })}>
                  <Text style={[styles.moodStatValue, { color: theme.primary }]}>{moodInsights.summary.perfectAvg ?? '–'}</Text>
                  <Text style={[styles.moodStatLabel, { color: theme.textMuted }]}>{t('progress.mood.perfectDays')}</Text>
                </View>
                <View style={[styles.moodStat, { backgroundColor: theme.bg, borderColor: theme.border }]} accessible accessibilityLabel={t('progress.mood.otherA11y', { value: moodInsights.summary.otherAvg ?? t('progress.mood.noData') })}>
                  <Text style={[styles.moodStatValue, { color: theme.primary }]}>{moodInsights.summary.otherAvg ?? '–'}</Text>
                  <Text style={[styles.moodStatLabel, { color: theme.textMuted }]}>{t('progress.mood.otherDays')}</Text>
                </View>
              </View>
              {moodInsights.headline ? (
                <Text style={[styles.moodHeadline, { color: theme.text }]}>{moodInsights.headline}</Text>
              ) : (
                <Text style={[styles.cardHint, { color: theme.textMuted, marginTop: 8 }]}>{t('progress.mood.noLink')}</Text>
              )}
              {moodInsights.correlations.slice(0, 3).map(c => (
                <View key={c.habitId} style={styles.corrRow}>
                  <Text style={styles.corrIcon}>{c.icon || '⭐'}</Text>
                  <Text style={[styles.corrName, { color: theme.text }]} numberOfLines={1}>{c.name}</Text>
                  <Text style={[styles.corrDelta, { color: c.delta >= 0 ? theme.success : theme.danger }]}>{c.delta >= 0 ? '+' : ''}{c.delta}</Text>
                </View>
              ))}
            </>
          )}
        </View>

        {/* Trophy case: streak milestones + challenge medals */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{t('progress.trophy.title')}</Text>
          <Text style={[styles.cardHint, { color: theme.textMuted }]}>{t('progress.trophy.hint')}</Text>
          <View style={styles.trophyRow}>
            {STREAK_MILESTONES.map(m => {
              const got = earned.get(`streak-${m.days}`);
              return (
                <View key={m.days} style={[styles.trophyTile, { backgroundColor: got ? theme.primaryLight : theme.bg, borderColor: got ? theme.primary : theme.border, opacity: got ? 1 : 0.55 }]} accessible accessibilityLabel={got ? t('progress.trophy.earnedA11y', { label: m.label, date: got.date }) : t('progress.trophy.lockedA11y', { label: m.label })}>
                  <Text style={styles.trophyEmoji}>{got ? m.emoji : '🔒'}</Text>
                  <Text style={[styles.trophyDays, { color: got ? theme.primary : theme.textMuted }]}>{t('common.shortDays', { count: m.days })}</Text>
                  <Text style={[styles.trophyLabel, { color: theme.textMuted }]} numberOfLines={1}>{got ? got.date.slice(5) : m.label}</Text>
                </View>
              );
            })}
          </View>
          {trophies.length > 0 ? (
            <View style={styles.medalRow}>
              {trophies.map(c => (
                <View key={c.id} style={[styles.medal, { backgroundColor: TIER_STYLES[c.tier].bg, borderColor: TIER_STYLES[c.tier].border }]} accessible accessibilityLabel={t('progress.trophy.medalA11y', { name: c.name, tier: t(`tier.${c.tier}`) })}>
                  <Text style={styles.medalEmoji}>{TIER_STYLES[c.tier].badge}</Text>
                  <Text style={[styles.medalName, { color: TIER_STYLES[c.tier].text }]} numberOfLines={1}>{c.name}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.cardHint, { color: theme.textMuted, marginTop: 8 }]}>{t('progress.trophy.firstMedal')}</Text>
          )}
        </View>

        {/* AI Reflection */}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{t('progress.reflection.title')}</Text>
            <View style={styles.periodToggle}>
              {[{ label: '7d', value: 'weekly' }, { label: '30d', value: 'monthly' }].map(({ label, value }) => {
                const locked = value === 'weekly' ? !canGenerateWeekly : !canGenerateMonthly;
                const active = reflectionPeriod === value && !locked;
                return (
                  <TouchableOpacity
                    key={value}
                    style={[
                      styles.periodBtn,
                      { borderColor: theme.border },
                      active && { backgroundColor: theme.primary, borderColor: theme.primary },
                      locked && { opacity: 0.4 },
                    ]}
                    onPress={() => {
                      lightImpact();
                      setReflectionPeriod(value);
                      setReflectionMessage(null);
                      setReflectionError(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={(value === 'weekly' ? t('progress.reflection.weeklyA11y') : t('progress.reflection.monthlyA11y')) + (locked ? t('progress.reflection.lockedSuffix') : '')}
                    accessibilityState={{ selected: active, disabled: locked }}
                  >
                    <Text style={[styles.periodBtnText, { color: active ? '#fff' : theme.textMuted }]}>
                      {locked ? '🔒' : label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <Text style={[styles.cardHint, { color: theme.textMuted }]}>
            {t('progress.reflection.hint')}
          </Text>

          {reflectionLocked ? (
            <View style={[styles.lockedMsg, { borderColor: theme.border }]}>
              <Text style={styles.lockedIcon}>🔒</Text>
              <Text style={[styles.lockedTitle, { color: theme.text }]}>
                {t('progress.reflection.unlocks', { count: reflectionPeriod === 'weekly' ? daysUntilWeekly : daysUntilMonthly })}
              </Text>
              <Text style={[styles.cardHint, { color: theme.textMuted, textAlign: 'center', marginTop: 2 }]}>
                {reflectionPeriod === 'weekly'
                  ? t('progress.reflection.unlockWeekly')
                  : t('progress.reflection.unlockMonthly')}
              </Text>
            </View>
          ) : reflectionLoading ? (
            <View style={styles.reflectionLoading}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[styles.cardHint, { color: theme.textMuted, marginTop: 8 }]}>
                {reflectionPeriod === 'weekly' ? t('progress.reflection.generatingWeekly') : t('progress.reflection.generatingMonthly')}
              </Text>
            </View>
          ) : reflectionMessage ? (
            <>
              <Text style={[styles.reflectionText, { color: theme.text }]}>{reflectionMessage}</Text>
              {reflectionGeneratedAt && (
                <Text style={[styles.cardHint, { color: theme.textMuted, marginTop: 8 }]}>
                  {t('progress.reflection.generated', { date: new Date(reflectionGeneratedAt).toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' }) })}
                </Text>
              )}
            </>
          ) : (
            <>
              {reflectionError && (
                <Text style={[styles.cardHint, { color: theme.danger, marginTop: 4 }]}>
                  {reflectionErrorMsg && /limit/i.test(reflectionErrorMsg) ? reflectionErrorMsg : t('progress.reflection.failed')}
                  {reflectionErrorMsg && /limit/i.test(reflectionErrorMsg) && !isPro ? (
                    <Text style={{ color: theme.primary, fontWeight: '700' }} onPress={() => openPaywall('ai')}>{t('progress.reflection.seePro')}</Text>
                  ) : null}
                </Text>
              )}
              <TouchableOpacity
                style={[styles.generateBtn, { backgroundColor: theme.primary }]}
                onPress={handleGenerateReflection}
                accessibilityRole="button"
                accessibilityLabel={reflectionPeriod === 'weekly' ? t('progress.reflection.generateWeekly') : t('progress.reflection.generateMonthly')}
              >
                <Text style={styles.generateBtnText}>
                  {reflectionPeriod === 'weekly' ? t('progress.reflection.generateWeekly') : t('progress.reflection.generateMonthly')}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>

      {/* Bar tap tooltip */}
      {tooltipInfo && (
        <BarTooltip
          label={tooltipInfo.label}
          value={tooltipInfo.value}
          onClose={() => setTooltipInfo(null)}
          theme={theme}
        />
      )}

      <ShareCards visible={shareOpen} onClose={() => setShareOpen(false)} />

      <Dialog
        visible={streakRuleOpen}
        onClose={() => setStreakRuleOpen(false)}
        title={t('progress.streakRule.title')}
        body={t('progress.streakRule.body')}
        actions={[{ key: 'close', label: t('common.close'), onPress: () => setStreakRuleOpen(false) }]}
      />

      {/* Day detail sheet */}
      <DayDetailModal
        visible={!!selectedDay}
        day={selectedDay}
        onClose={() => setSelectedDay(null)}
        theme={theme}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 24, paddingBottom: 48 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  heading: { fontSize: 28, fontWeight: 'bold' },
  shareChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  shareChipText: { fontSize: 13, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  freezeLine: { fontSize: 12, textAlign: 'center', marginBottom: 24, lineHeight: 17 },
  statSlot: { flex: 1 },
  statInfo: { position: 'absolute', top: 6, right: 6, padding: 2 },
  statCard: {
    flex: 1, alignItems: 'center', paddingVertical: 20, paddingHorizontal: 8,
    borderRadius: 14, borderWidth: 1, gap: 6,
  },
  statEmoji: { fontSize: 26 },
  statValue: { fontSize: 26, fontWeight: 'bold' },
  statLabel: { fontSize: 11, textAlign: 'center', lineHeight: 14 },
  card: { borderRadius: 16, borderWidth: 1, padding: 20, marginBottom: 24 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardHint: { fontSize: 11, color: '#9CA3AF', marginTop: 2, marginBottom: 6 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  periodToggle: { flexDirection: 'row', gap: 5 },
  periodBtn: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 16, borderWidth: 1.5 },
  periodBtnText: { fontSize: 11, fontWeight: '700' },
  heatGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  moodStrip: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  moodDay: { alignItems: 'center', flex: 1 },
  moodDayEmoji: { fontSize: 22 },
  moodDayLabel: { fontSize: 10, marginTop: 2 },
  moodStats: { flexDirection: 'row', gap: 8, marginTop: 12 },
  moodStat: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  moodStatValue: { fontSize: 18, fontWeight: '800' },
  moodStatLabel: { fontSize: 10, marginTop: 2 },
  moodHeadline: { fontSize: 13, lineHeight: 19, marginTop: 12 },
  corrRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  corrIcon: { fontSize: 16 },
  corrName: { flex: 1, fontSize: 13, fontWeight: '600' },
  corrDelta: { fontSize: 13, fontWeight: '800' },
  trophyRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  trophyTile: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, gap: 2 },
  trophyEmoji: { fontSize: 24 },
  trophyDays: { fontSize: 14, fontWeight: '800' },
  trophyLabel: { fontSize: 10 },
  medalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  medal: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '100%' },
  medalEmoji: { fontSize: 16 },
  medalName: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
  heatLegend: { flexDirection: 'row', gap: 14, marginBottom: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 2 },
  legendLabel: { fontSize: 11 },
  // Day detail modal
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingBottom: 8, maxHeight: '85%',
  },
  dragHandleArea: { alignItems: 'center', paddingVertical: 12 },
  handleBar: { width: 40, height: 4, borderRadius: 2 },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: 'bold' },
  sheetSub: { fontSize: 13, marginTop: 2 },
  closeBtn: { padding: 4, marginLeft: 8 },
  closeBtnTxt: { fontSize: 18, fontWeight: 'bold' },
  ratioBarBg: { height: 8, borderRadius: 4, overflow: 'hidden' },
  ratioBarFill: { height: 8, borderRadius: 4 },
  noData: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  habitRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: 1,
  },
  habitIcon: { fontSize: 22 },
  habitName: { fontSize: 14, fontWeight: '600' },
  habitSub: { fontSize: 12, marginTop: 2 },
  // AI reflection
  reflectionLoading: { alignItems: 'center', paddingVertical: 20 },
  reflectionText: { fontSize: 14, lineHeight: 22, marginTop: 12 },
  generateBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  generateBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  lockedMsg: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 12, marginTop: 8, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed' },
  lockedIcon: { fontSize: 28, marginBottom: 6 },
  lockedTitle: { fontSize: 15, fontWeight: '700' },
  // Bar tooltip
  tooltipOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  tooltip: {
    borderRadius: 16, borderWidth: 1, paddingHorizontal: 28, paddingVertical: 18,
    alignItems: 'center', minWidth: 150,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, elevation: 6,
  },
  tooltipLabel: { fontSize: 13, marginBottom: 4 },
  tooltipValue: { fontSize: 36, fontWeight: 'bold' },
  tooltipHint: { fontSize: 12, marginTop: 2 },
});
