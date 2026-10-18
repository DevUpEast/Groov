import React, { useState } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import SafeAreaView from '../components/SafeAreaView';
import { useApp } from '../context/AppContext';
import { themes } from '../theme/colors';
import { palette, pairs, data, accents, accentOnFill, space, radius, RGBA_ROLES } from '../theme/tokens';
import { contrastRatio } from '../theme/contrast';
import ProgressRing from '../components/ProgressRing';
import TodayHeader, { TodayStickyBar } from '../components/TodayHeader';
import AppText from '../components/ui/AppText';
import { t } from '../i18n';

// Dev-only token preview (F-01, plan §2.1). Opened with groov://dev/design in a dev build or
// the web mockup (`--route dev/design`); App.js never renders it in a release build.
// Labels are token names, which are identifiers rather than UI copy, so they stay English.

const resolve = (theme, key) => (key.startsWith('data.') ? data[theme][key.slice(5)] : palette[theme][key] ?? key);

// The Today header states (C-04): rendered side by side for review, with fixed sample data.
const BEATS = (today) => ['done', 'done', 'rest', 'done', 'done', 'done', today].map((status, i) => ({ key: `d${i}`, status, today: i === 6 }));
const TODAY_HEADER_CASES = [
  { id: 'progress', props: { name: 'Claude', state: 'progress', completed: 2, total: 4, streak: 11, beats: BEATS('open') } },
  { id: 'complete', props: { name: 'Claude', state: 'complete', completed: 4, total: 4, streak: 12, beats: BEATS('complete') } },
  { id: 'rest', props: { name: 'Claude', state: 'rest', completed: 0, total: 0, streak: 12, beats: BEATS('rest') } },
  { id: 'empty', props: { name: 'Claude', state: 'progress', completed: 0, total: 4, streak: 0, beats: BEATS('open').slice(4) } },
  { id: 'long-name', props: { name: 'Maximilian Mustermann-Schmidt', state: 'progress', completed: 2, total: 4, streak: 11, beats: BEATS('open') } },
  { id: 'compact', props: { name: 'Claude', state: 'progress', completed: 2, total: 4, streak: 11, beats: BEATS('open'), compact: true } },
];

function Section({ title, theme, children }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.text }]} accessibilityRole="header">{title}</Text>
      {children}
    </View>
  );
}

export default function DesignPreview({ visible, onClose }) {
  const { themeName } = useApp();
  const [name, setName] = useState(null);
  const shown = name || themeName || 'light';
  const theme = themes[shown];
  const roles = Object.keys(palette[shown]).filter(k => k !== 'celebration');
  const themePairs = pairs.filter(p => p.theme === shown);
  const failing = themePairs.filter(p => p.min && contrastRatio(resolve(shown, p.fg), resolve(shown, p.bg), p.on ? resolve(shown, p.on) : undefined) < p.min);

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar style={shown === 'dark' ? 'light' : 'dark'} />
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">Design tokens</Text>
          {['light', 'dark'].map(n => (
            <TouchableOpacity
              key={n}
              onPress={() => setName(n)}
              style={[styles.chip, { borderColor: shown === n ? theme.selectionBorder : theme.controlBorder, backgroundColor: shown === n ? theme.selection : theme.surface }]}
              accessibilityRole="button"
              accessibilityState={{ selected: shown === n }}
              accessibilityLabel={n}
            >
              <Text style={[styles.chipText, { color: shown === n ? theme.onSelection : theme.textSecondary }]}>{n}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <Text style={[styles.closeText, { color: theme.textSecondary }]}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Section title="Today header (C-04)" theme={theme}>
            {TODAY_HEADER_CASES.map(c => (
              <View key={c.id} style={styles.headerCase} testID={`today-header-${c.id}`}>
                <Text style={[styles.swatchHex, { color: theme.textTertiary }]}>{c.id}</Text>
                <TodayHeader theme={theme} isDark={shown === 'dark'} date="Thursday, October 15" greeting={t('today.greeting.evening')} compact={false} {...c.props} />
              </View>
            ))}
            {TODAY_HEADER_CASES.slice(0, 3).map(c => (
              <View key={`sticky-${c.id}`} style={styles.stickyCase}>
                <TodayStickyBar theme={theme} greeting={t('today.greeting.evening')} {...c.props} />
              </View>
            ))}
          </Section>

          <Text style={[styles.summary, { color: failing.length ? theme.dangerText : theme.successText }]}>
            {`${themePairs.length - failing.length}/${themePairs.length} pairs pass`}
          </Text>

          <Section title="Type (§2.7)" theme={theme}>
            <View style={styles.ringRow}>
              {['0/5', '12/15', '100/120'].map((label, i) => (
                <ProgressRing key={label} progress={[0, 0.8, 0.83][i]} size={110} strokeWidth={10} color={theme.meter} bg={theme.track} label={label} sublabel="habits" sublabelColor={theme.textSecondary} />
              ))}
            </View>
            <AppText variant="display" style={{ color: theme.link }}>365</AppText>
            <AppText variant="title" style={{ color: theme.text }}>Title 28</AppText>
            <AppText variant="headline" style={{ color: theme.text }}>Headline 20</AppText>
            <AppText variant="body" style={{ color: theme.text }}>Body</AppText>
            <AppText variant="footnote" style={{ color: theme.textSecondary }}>Footnote 13</AppText>
            <AppText variant="caption" style={{ color: theme.textSecondary }}>Caption 12 (the floor)</AppText>
          </Section>

          <Section title="Roles" theme={theme}>
            <View style={styles.grid}>
              {roles.map(k => (
                <View key={k} style={styles.swatchCell}>
                  <View style={[styles.swatch, { backgroundColor: palette[shown][k], borderColor: theme.border }]} />
                  <Text style={[styles.swatchName, { color: theme.text }]} numberOfLines={1}>{k}</Text>
                  <Text style={[styles.swatchHex, { color: theme.textTertiary }]} numberOfLines={1}>
                    {RGBA_ROLES.includes(k) ? 'rgba' : palette[shown][k]}
                  </Text>
                </View>
              ))}
            </View>
          </Section>

          <Section title="Pairs (§2.5)" theme={theme}>
            {themePairs.map(p => {
              const fg = resolve(shown, p.fg);
              const bg = resolve(shown, p.bg);
              const r = contrastRatio(fg, bg, p.on ? resolve(shown, p.on) : undefined);
              const ok = !p.min || r >= p.min;
              return (
                <View key={p.name} style={[styles.pairRow, { backgroundColor: bg, borderColor: theme.border }]}>
                  <Text style={[styles.pairText, { color: fg }]} numberOfLines={2}>{p.name}</Text>
                  <Text style={[styles.pairRatio, { color: fg }]}>{`${r.toFixed(2)}${p.min ? ` / ${p.min}` : ''}${ok ? '' : ' ✗'}`}</Text>
                </View>
              );
            })}
          </Section>

          <Section title="Accents (§2.3)" theme={theme}>
            {Object.entries(accents).map(([id, a]) => (
              <View key={id} style={[styles.accentRow, { backgroundColor: a[shown].tint }]}>
                <View style={[styles.check, { backgroundColor: a[shown].fill }]}>
                  <Text style={[styles.checkText, { color: accentOnFill[shown] }]}>✓</Text>
                </View>
                <Text style={[styles.accentName, { color: theme.text }]}>{id}</Text>
                <Text style={[styles.swatchHex, { color: theme.textSecondary }]}>{`${a[shown].fill} · ${a[shown].tint}`}</Text>
              </View>
            ))}
          </Section>

          <Section title="Data ramp (§2.4)" theme={theme}>
            <View style={styles.rampRow}>
              <View style={[styles.cell, { borderWidth: 1.5, borderColor: theme.controlBorder, backgroundColor: theme.surface }]} />
              <View style={[styles.cell, { backgroundColor: data[shown].partial }]} />
              <View style={[styles.cell, { backgroundColor: data[shown].perfect }]} />
              <View style={[styles.cell, { borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.controlBorder }]} />
              <View style={[styles.cell, { borderWidth: 2, borderColor: data[shown].todayRing }]} />
            </View>
            <Text style={[styles.swatchHex, { color: theme.textSecondary }]}>missed · partial · perfect · rest · today</Text>
          </Section>

          <Section title="Brand strip" theme={theme}>
            <View style={[styles.strip, { backgroundColor: theme.brandSurface }]}>
              <View style={[styles.ring, { borderColor: theme.brandTrack }]} />
              <View style={[styles.ring, { borderColor: theme.brandInk, borderStyle: 'dashed' }]} />
              <View style={[styles.cell, { borderWidth: 1.5, borderColor: theme.beatOutline }]} />
              <Text style={[styles.stripText, { color: theme.text }]}>text</Text>
              <Text style={[styles.stripText, { color: theme.textSecondary }]}>secondary</Text>
              <Text style={[styles.stripText, { color: theme.signatureText }]}>signature</Text>
            </View>
          </Section>

          <Section title="Actions" theme={theme}>
            <View style={styles.rampRow}>
              <View style={[styles.btn, { backgroundColor: theme.action }]}><Text style={[styles.btnText, { color: theme.onAction }]}>action</Text></View>
              <View style={[styles.btn, { backgroundColor: theme.actionTint }]}><Text style={[styles.btnText, { color: theme.onActionTint }]}>tint</Text></View>
              <View style={[styles.btn, { backgroundColor: theme.dangerFill }]}><Text style={[styles.btnText, { color: theme.onDanger }]}>danger</Text></View>
              <View style={[styles.btn, { backgroundColor: theme.disabledContainer }]}><Text style={[styles.btnText, { color: theme.onDisabled }]}>disabled</Text></View>
            </View>
            <View style={[styles.toast, { backgroundColor: theme.toast, borderColor: theme.toastEdge }]}>
              <Text style={[styles.btnText, { color: theme.onToast, flex: 1 }]}>toast</Text>
              <Text style={[styles.btnText, { color: theme.toastAction }]}>Undo</Text>
            </View>
          </Section>

          <Section title="Space and radius (§2.6)" theme={theme}>
            {Object.entries(space).map(([k, v]) => (
              <View key={k} style={styles.spaceRow}>
                <Text style={[styles.spaceName, { color: theme.textSecondary }]}>{`${k} ${v}`}</Text>
                <View style={{ width: v * 2, height: 8, backgroundColor: theme.action, borderRadius: 2 }} />
              </View>
            ))}
            <View style={styles.rampRow}>
              {Object.entries(radius).map(([k, v]) => (
                <View key={k} style={[styles.radiusBox, { borderRadius: Math.min(v, 28), borderColor: theme.controlBorder }]}>
                  <Text style={[styles.swatchHex, { color: theme.textSecondary }]}>{k}</Text>
                </View>
              ))}
            </View>
          </Section>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  headerCase: { marginBottom: 16 },
  stickyCase: { height: 48, marginBottom: 8 },
  ringRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  title: { flex: 1, fontSize: 20, fontWeight: '600' },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, minHeight: 32, justifyContent: 'center' },
  chipText: { fontSize: 13, fontWeight: '600' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 18 },
  scroll: { padding: 16, paddingBottom: 48 },
  summary: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 17, fontWeight: '600', marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatchCell: { width: 104 },
  swatch: { height: 40, borderRadius: 8, borderWidth: 1 },
  swatchName: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  swatchHex: { fontSize: 12 },
  pairRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 4 },
  pairText: { flex: 1, fontSize: 13 },
  pairRatio: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  accentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 12, marginBottom: 8 },
  check: { width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  checkText: { fontSize: 16, fontWeight: '700' },
  accentName: { fontSize: 15, fontWeight: '600', width: 72 },
  rampRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 },
  cell: { width: 24, height: 24, borderRadius: 4 },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 16, flexWrap: 'wrap' },
  ring: { width: 40, height: 40, borderRadius: 20, borderWidth: 4 },
  stripText: { fontSize: 13, fontWeight: '600' },
  btn: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  btnText: { fontSize: 15, fontWeight: '600' },
  toast: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  spaceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  spaceName: { fontSize: 12, width: 72 },
  radiusBox: { width: 64, height: 48, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
