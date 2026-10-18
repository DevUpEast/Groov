import React, { useRef, useState, useMemo, useCallback } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Platform, Dimensions,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useApp } from '../context/AppContext';
import { addDays, parseDateKey } from '../utils/dates';
import SegmentedControl from './ui/SegmentedControl';
import { track, Events } from '../utils/analytics';
import { weekdayInitials } from '../utils/schedule';
import { t, getLocale, useLocale } from '../i18n';
import { elevation, shareCard, space, radius } from '../theme/tokens';
import OverlayModal from './ui/OverlayModal';
import AppText from './ui/AppText';
import { numeric } from '../theme/typography';

// Shareable cards (#31): streak card, weekly recap and a year-in-pixels grid.
// Each card is rendered off-screen-sized, captured with react-native-view-shot and
// handed to the share sheet (web: downloaded).

const CARD_W = Math.min(Dimensions.get('window').width - 48, 360);
// Fixed brand art, the same in both themes (VA-7).
const BRAND = shareCard.bg;
const BRAND_DARK = shareCard.bgDeep;

export const CARD_KINDS = [
  { key: 'streak', emoji: '🔥', get label() { return t('shareCards.kinds.streak'); } },
  { key: 'week', emoji: '📅', get label() { return t('shareCards.kinds.week'); } },
  { key: 'year', emoji: '🟪', get label() { return t('shareCards.kinds.year'); } },
];

function StreakCard({ streak, best, perfectDays, habits, displayName, today }) {
  return (
    <View style={[styles.card, { backgroundColor: BRAND }]}>
      <Text style={styles.cardKicker}>{displayName ? t('shareCards.namedStreak', { name: displayName }) : t('shareCards.myStreak')}</Text>
      <AppText variant="display" style={styles.bigNumber}>{streak}</AppText>
      <Text style={styles.bigLabel}>{t('shareCards.daysInRow', { count: streak })}</Text>
      <View style={styles.statRow}>
        <View style={styles.stat}><Text style={styles.statValue}>{best}</Text><Text style={styles.statLabel}>{t('shareCards.best')}</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{perfectDays}</Text><Text style={styles.statLabel}>{t('shareCards.perfectDays')}</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{habits}</Text><Text style={styles.statLabel}>{t('shareCards.habits')}</Text></View>
      </View>
      <Footer date={today} />
    </View>
  );
}

function WeekCard({ days, displayName, today }) {
  const done = days.filter(d => d.total > 0 && d.completed >= d.total).length;
  const pct = days.length ? Math.round((days.reduce((a, d) => a + (d.total ? d.completed / d.total : 0), 0) / days.length) * 100) : 0;
  return (
    <View style={[styles.card, { backgroundColor: BRAND_DARK }]}>
      <Text style={styles.cardKicker}>{displayName ? t('shareCards.namedWeek', { name: displayName }) : t('shareCards.myWeek')}</Text>
      <AppText variant="display" style={styles.bigNumber}>{pct}%</AppText>
      <Text style={styles.bigLabel}>{t('shareCards.weekSummary', { count: done })}</Text>
      <View style={styles.weekRow}>
        {days.map(d => {
          const r = d.total ? d.completed / d.total : 0;
          return (
            <View key={d.date} style={styles.weekDay}>
              <View style={styles.weekBarTrack}>
                <View style={[styles.weekBarFill, { height: `${Math.max(6, r * 100)}%`, opacity: d.future ? 0.2 : 1 }]} />
              </View>
              <Text style={styles.weekLabel}>{weekdayInitials()[parseDateKey(d.date).getDay()]}</Text>
            </View>
          );
        })}
      </View>
      <Footer date={today} />
    </View>
  );
}

function YearCard({ year, cells, displayName, today }) {
  // Split into two rows of ~27 weeks so each cell can be twice as large.
  const half = Math.ceil(cells.length / 2);
  const rows = [cells.slice(0, half), cells.slice(half)];
  const cellBig = Math.max(6, Math.floor((CARD_W - 40 - (half - 1) * 2) / half));
  // 53 columns x 7 rows, Monday first, like a contribution graph.
  // 53 columns must fit the card width; cells are square with a 2px gap.
  return (
    <View style={[styles.card, { backgroundColor: shareCard.bgInk }]}>
      <Text style={styles.cardKicker}>{displayName ? t('shareCards.namedYear', { name: displayName, year }) : t('shareCards.myYear', { year })}</Text>
      {rows.map((rowCols, r) => (
        <View key={r} style={{ flexDirection: 'row', marginTop: r === 0 ? 14 : 10 }}>
          {rowCols.map((col, i) => (
            <View key={i} style={{ marginRight: 2 }}>
              {col.map((c, j) => (
                <View key={j} style={{ width: cellBig, height: cellBig, marginBottom: 2, borderRadius: radius.cell, backgroundColor: c === null ? 'transparent' : c >= 1 ? shareCard.cellPerfect : c > 0 ? shareCard.cellPartial : shareCard.cellNone }} />
              ))}
            </View>
          ))}
        </View>
      ))}
      <View style={[styles.legendRow, { marginTop: space.sm }]}>
        {[[shareCard.cellNone, 'none'], [shareCard.cellPartial, 'partial'], [shareCard.cellPerfect, 'perfect']].map(([c, l]) => (
          <View key={l} style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: c }]} /><Text style={styles.legendText}>{t(`shareCards.legend.${l}`)}</Text></View>
        ))}
      </View>
      <Footer date={today} />
    </View>
  );
}

function Footer({ date }) {
  return (
    <View style={styles.footer}>
      <Text style={styles.footerBrand}>Groov</Text>
      <Text style={styles.footerDate}>{parseDateKey(date).toLocaleDateString(getLocale(), { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
    </View>
  );
}

export default function ShareCards({ visible, onClose, initialKind = 'streak' }) {
  const { theme, getOverallStreak, getBestStreak, getLastNDays, getDaySummary, habits, displayName, todayStr } = useApp();
  useLocale();
  const [kind, setKind] = useState(initialKind);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const today = todayStr();

  const last7 = useMemo(() => getLastNDays(7), [getLastNDays]);
  const last30 = useMemo(() => getLastNDays(30), [getLastNDays]);
  const perfectDays = last30.filter(d => d.total > 0 && d.completed >= d.total).length;

  const yearCells = useMemo(() => {
    const year = today.slice(0, 4);
    const jan1 = `${year}-01-01`;
    // Start the grid on the Monday on/before Jan 1.
    const dow = parseDateKey(jan1).getDay();
    let key = addDays(jan1, -((dow + 6) % 7));
    const cols = [];
    for (let c = 0; c < 53; c++) {
      const col = [];
      for (let r = 0; r < 7; r++) {
        if (key.slice(0, 4) !== year || key > today) col.push(null);
        else {
          // Same rule as Progress (utils/dayStatus.js): schedules, goals and
          // createdAt; a rest day or a day before any habit is an empty cell.
          const d = getDaySummary(key);
          col.push(d.total > 0 ? d.completed / d.total : 0);
        }
        key = addDays(key, 1);
      }
      cols.push(col);
    }
    return { year, cols };
  }, [today, getDaySummary]);

  const share = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await captureRef(ref, { format: 'png', quality: 1, result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile' });
      track(Events.SHARE_CARD, { kind });
      if (Platform.OS === 'web') {
        const a = document.createElement('a'); a.href = uri; a.download = `groov-${kind}.png`; a.click();
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: t('shareCards.dialogTitle') });
      }
    } catch (e) {
      if (__DEV__) console.warn('share failed:', e?.message);
    } finally {
      setBusy(false);
    }
  }, [busy, kind]);

  if (!visible) return null;
  return (
    <OverlayModal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: theme.scrim }]}>
        <View style={[styles.sheet, elevation.sheet, { backgroundColor: theme.raised, shadowColor: theme.shadow }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>{t('shareCards.title')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Text style={[styles.closeTxt, { color: theme.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          </View>
          <SegmentedControl
            theme={theme}
            role="tab"
            fill
            compact
            style={styles.tabs}
            value={kind}
            onChange={setKind}
            options={CARD_KINDS.map(k => ({ value: k.key, label: t('shareCards.kindTab', { emoji: k.emoji, label: k.label }), accessibilityLabel: k.label }))}
          />
          <ScrollView contentContainerStyle={{ alignItems: 'center', paddingVertical: space.xs }} showsVerticalScrollIndicator={false}>
            <View ref={ref} collapsable={false} style={{ width: CARD_W }}>
              {kind === 'streak' && <StreakCard streak={getOverallStreak()} best={getBestStreak()} perfectDays={perfectDays} habits={habits.length} displayName={displayName} today={today} />}
              {kind === 'week' && <WeekCard days={last7} displayName={displayName} today={today} />}
              {kind === 'year' && <YearCard year={yearCells.year} cells={yearCells.cols} displayName={displayName} today={today} />}
            </View>
          </ScrollView>
          <TouchableOpacity style={[styles.shareBtn, { backgroundColor: theme.action, opacity: busy ? 0.6 : 1 }]} onPress={share} disabled={busy} accessibilityRole="button" accessibilityLabel={t('shareCards.shareImage')}>
            {busy ? <ActivityIndicator color={theme.onAction} /> : <Text style={[styles.shareBtnText, { color: theme.onAction }]}>{t('shareCards.shareImage')}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </OverlayModal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: Platform.OS === 'ios' ? 40 : 24, maxHeight: '92%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  title: { fontSize: 20, fontWeight: 'bold' },
  closeBtn: { padding: space.xxs },
  closeTxt: { fontSize: 20, fontWeight: 'bold' },
  tabs: { marginBottom: space.xs },
  card: { borderRadius: radius.sheet, padding: 20, width: CARD_W },
  cardKicker: { color: shareCard.fgSecondary, fontSize: 13, fontWeight: '700' },
  // The display face at share-card scale (fixed brand art, not the in-app scale). No weight:
  // AppText supplies the face (Bold) or, after a font timeout, the system display weight.
  bigNumber: { color: shareCard.fg, fontSize: 72, marginTop: 6, lineHeight: 80 },
  bigLabel: { color: shareCard.fgStrong, fontSize: 16, fontWeight: '600', marginTop: -space.xxs },
  statRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  stat: { flex: 1, backgroundColor: shareCard.well, borderRadius: radius.card, paddingVertical: 10, alignItems: 'center' },
  statValue: { color: shareCard.fg, fontSize: 20, fontWeight: '800', ...numeric },
  statLabel: { color: shareCard.fgSecondary, fontSize: 12, marginTop: 2 },
  weekRow: { flexDirection: 'row', gap: space.xs, height: 110, alignItems: 'flex-end', marginTop: 18 },
  weekDay: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  weekBarTrack: { flex: 1, width: '70%', backgroundColor: shareCard.well, borderRadius: radius.control, overflow: 'hidden', justifyContent: 'flex-end' },
  weekBarFill: { width: '100%', backgroundColor: shareCard.fg, borderRadius: radius.control },
  weekLabel: { color: shareCard.fgSecondary, fontSize: 12, marginTop: space.xxs, fontWeight: '700' },
  legendRow: { flexDirection: 'row', gap: space.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  legendDot: { width: 9, height: 9, borderRadius: radius.cell },
  legendText: { color: shareCard.fgTertiary, fontSize: 12 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 },
  footerBrand: { color: shareCard.fg, fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
  footerDate: { color: shareCard.fgTertiary, fontSize: 12 },
  shareBtn: { marginTop: space.sm, paddingVertical: 14, borderRadius: radius.card, alignItems: 'center' },
  shareBtnText: { fontSize: 16, fontWeight: '700' },
});
