import React, { useRef, useState, useMemo, useCallback } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Platform, Dimensions,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useApp } from '../context/AppContext';
import { addDays, parseDateKey } from '../utils/dates';
import { lightImpact, mediumImpact } from '../utils/haptics';
import { track, Events } from '../utils/analytics';

// Shareable cards (#31): streak card, weekly recap and a year-in-pixels grid.
// Each card is rendered off-screen-sized, captured with react-native-view-shot and
// handed to the share sheet (web: downloaded).

const CARD_W = Math.min(Dimensions.get('window').width - 48, 360);
const BRAND = '#4F46E5';
const BRAND_DARK = '#3730A3';

export const CARD_KINDS = [
  { key: 'streak', label: 'Streak', emoji: '🔥' },
  { key: 'week', label: 'This week', emoji: '📅' },
  { key: 'year', label: 'Year in pixels', emoji: '🟪' },
];

function StreakCard({ streak, best, perfectDays, habits, displayName, today }) {
  return (
    <View style={[styles.card, { backgroundColor: BRAND }]}>
      <Text style={styles.cardKicker}>{displayName ? `${displayName}'s` : 'My'} streak</Text>
      <Text style={styles.bigNumber}>{streak}</Text>
      <Text style={styles.bigLabel}>day{streak === 1 ? '' : 's'} in a row</Text>
      <View style={styles.statRow}>
        <View style={styles.stat}><Text style={styles.statValue}>{best}</Text><Text style={styles.statLabel}>best</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{perfectDays}</Text><Text style={styles.statLabel}>perfect days</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{habits}</Text><Text style={styles.statLabel}>habits</Text></View>
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
      <Text style={styles.cardKicker}>{displayName ? `${displayName}'s week` : 'My week'}</Text>
      <Text style={styles.bigNumber}>{pct}%</Text>
      <Text style={styles.bigLabel}>of habits done · {done} perfect day{done === 1 ? '' : 's'}</Text>
      <View style={styles.weekRow}>
        {days.map(d => {
          const r = d.total ? d.completed / d.total : 0;
          return (
            <View key={d.date} style={styles.weekDay}>
              <View style={styles.weekBarTrack}>
                <View style={[styles.weekBarFill, { height: `${Math.max(6, r * 100)}%`, opacity: d.future ? 0.2 : 1 }]} />
              </View>
              <Text style={styles.weekLabel}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'][parseDateKey(d.date).getDay()]}</Text>
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
    <View style={[styles.card, { backgroundColor: '#0F172A' }]}>
      <Text style={styles.cardKicker}>{displayName ? `${displayName}'s ${year}` : `${year}`} in pixels</Text>
      {rows.map((rowCols, r) => (
        <View key={r} style={{ flexDirection: 'row', marginTop: r === 0 ? 14 : 10 }}>
          {rowCols.map((col, i) => (
            <View key={i} style={{ marginRight: 2 }}>
              {col.map((c, j) => (
                <View key={j} style={{ width: cellBig, height: cellBig, marginBottom: 2, borderRadius: 2, backgroundColor: c === null ? 'transparent' : c >= 1 ? '#818CF8' : c > 0 ? '#F59E0B' : '#1E293B' }} />
              ))}
            </View>
          ))}
        </View>
      ))}
      <View style={[styles.legendRow, { marginTop: 12 }]}>
        {[['#1E293B', 'none'], ['#F59E0B', 'partial'], ['#818CF8', 'perfect']].map(([c, l]) => (
          <View key={l} style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: c }]} /><Text style={styles.legendText}>{l}</Text></View>
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
      <Text style={styles.footerDate}>{parseDateKey(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
    </View>
  );
}

export default function ShareCards({ visible, onClose, initialKind = 'streak' }) {
  const { theme, settings, getOverallStreak, getBestStreak, getLastNDays, habits, displayName, todayStr, completions, dailySnapshot } = useApp();
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
          const snap = dailySnapshot[key];
          const dayHabits = snap || [];
          if (dayHabits.length === 0) col.push(0);
          else {
            const comps = completions[key] || {};
            const done = dayHabits.filter(h => (comps[h.id] || 0) >= (h.volumeGoal || 1)).length;
            col.push(done / dayHabits.length);
          }
        }
        key = addDays(key, 1);
      }
      cols.push(col);
    }
    return { year, cols };
  }, [today, completions, dailySnapshot]);

  const share = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (settings.hapticsEnabled) mediumImpact();
      const uri = await captureRef(ref, { format: 'png', quality: 1, result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile' });
      track(Events.SHARE_CARD, { kind });
      if (Platform.OS === 'web') {
        const a = document.createElement('a'); a.href = uri; a.download = `groov-${kind}.png`; a.click();
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your progress' });
      }
    } catch (e) {
      if (__DEV__) console.warn('share failed:', e?.message);
    } finally {
      setBusy(false);
    }
  }, [busy, kind, settings.hapticsEnabled]);

  if (!visible) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Share your progress</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={[styles.closeTxt, { color: theme.textMuted }]}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.tabs}>
            {CARD_KINDS.map(k => {
              const on = kind === k.key;
              return (
                <TouchableOpacity key={k.key} style={[styles.tab, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primaryLight : 'transparent' }]} onPress={() => { if (settings.hapticsEnabled) lightImpact(); setKind(k.key); }} accessibilityRole="button" accessibilityState={{ selected: on }}>
                  <Text style={[styles.tabText, { color: on ? theme.primary : theme.textMuted }]}>{k.emoji} {k.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <ScrollView contentContainerStyle={{ alignItems: 'center', paddingVertical: 8 }} showsVerticalScrollIndicator={false}>
            <View ref={ref} collapsable={false} style={{ width: CARD_W }}>
              {kind === 'streak' && <StreakCard streak={getOverallStreak()} best={getBestStreak()} perfectDays={perfectDays} habits={habits.length} displayName={displayName} today={today} />}
              {kind === 'week' && <WeekCard days={last7} displayName={displayName} today={today} />}
              {kind === 'year' && <YearCard year={yearCells.year} cells={yearCells.cols} displayName={displayName} today={today} />}
            </View>
          </ScrollView>
          <TouchableOpacity style={[styles.shareBtn, { backgroundColor: theme.primary, opacity: busy ? 0.6 : 1 }]} onPress={share} disabled={busy} accessibilityRole="button" accessibilityLabel="Share image">
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.shareBtnText}>Share image</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 16, paddingBottom: Platform.OS === 'ios' ? 40 : 24, maxHeight: '92%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: 'bold' },
  closeBtn: { padding: 4 },
  closeTxt: { fontSize: 20, fontWeight: 'bold' },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, alignItems: 'center' },
  tabText: { fontSize: 12, fontWeight: '700' },
  card: { borderRadius: 24, padding: 20, width: CARD_W },
  cardKicker: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  bigNumber: { color: '#fff', fontSize: 72, fontWeight: '900', marginTop: 6, lineHeight: 80 },
  bigLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 16, fontWeight: '600', marginTop: -4 },
  statRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  stat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  statValue: { color: '#fff', fontSize: 20, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 2 },
  weekRow: { flexDirection: 'row', gap: 8, height: 110, alignItems: 'flex-end', marginTop: 18 },
  weekDay: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  weekBarTrack: { flex: 1, width: '70%', backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 6, overflow: 'hidden', justifyContent: 'flex-end' },
  weekBarFill: { width: '100%', backgroundColor: '#fff', borderRadius: 6 },
  weekLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 4, fontWeight: '700' },
  legendRow: { flexDirection: 'row', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 9, height: 9, borderRadius: 2 },
  legendText: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 },
  footerBrand: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
  footerDate: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  shareBtn: { marginTop: 12, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  shareBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
