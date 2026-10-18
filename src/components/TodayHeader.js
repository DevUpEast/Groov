// The Today header (C-04, D-00 r6): the date, the greeting, and the brand strip with the
// 88 pt progress ring, the day's line, the 7-day beat row and the streak chip; plus the 48 pt
// sticky bar that takes over once the strip scrolls away.
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ProgressRing from './ProgressRing';
import AppText from './ui/AppText';
import { space, radius, size, elevation } from '../theme/tokens';
import { type, numeric } from '../theme/typography';
import { t, useLocale } from '../i18n';
import { summarizeBeats } from '../utils/weekBeats';

const GREETING_LINE = 32; // title 28 on a 32 pt line (D-00), one line of the header budget

// ── Greeting ────────────────────────────────────────────────────────────────────────────
// Greeting and name share one line when they fit. When they do not, the greeting keeps its
// line and the name gets its own Text that tail-truncates (a nested span cannot ellipsize on
// its own). Two invisible copies decide which: the full string, free to wrap, against the
// greeting alone on one line, so the test holds at any font scale.
function Greeting({ greeting, name, theme }) {
  const full = name ? t('today.greeting.withName', { greeting, name }) : greeting;
  const [fullH, setFullH] = useState(0);
  const [oneH, setOneH] = useState(0);
  const wrapped = !!name && oneH > 0 && fullH > oneH * 1.4;
  const titleStyle = [styles.greeting, { color: theme.text }];
  const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants', 'aria-hidden': true, pointerEvents: 'none' };
  return (
    <View>
      {name ? (
        <View style={styles.measureLayer} {...hidden}>
          <AppText variant="title" style={[titleStyle, styles.invisible]} onLayout={e => setFullH(e.nativeEvent.layout.height)}>{full}</AppText>
          <AppText variant="title" style={[titleStyle, styles.invisible]} numberOfLines={1} onLayout={e => setOneH(e.nativeEvent.layout.height)}>{greeting}</AppText>
        </View>
      ) : null}
      {wrapped ? (
        <View accessible accessibilityRole="header" accessibilityLabel={full}>
          <AppText variant="title" style={titleStyle}>{t('today.greeting.lead', { greeting })}</AppText>
          <AppText variant="title" style={titleStyle} numberOfLines={1} ellipsizeMode="tail">{t('today.greeting.nameLine', { name })}</AppText>
        </View>
      ) : (
        <AppText variant="title" style={titleStyle} numberOfLines={1} ellipsizeMode="tail" accessibilityRole="header">{full}</AppText>
      )}
    </View>
  );
}

// ── Pieces of the strip ─────────────────────────────────────────────────────────────────
export function StreakChip({ streak, theme, style }) {
  return (
    <View
      style={[styles.chip, { backgroundColor: theme.signatureTint }, style]}
      accessible
      accessibilityLabel={t('habitCard.streak', { count: streak })}
    >
      <Ionicons name="flame" size={15} color={theme.signature} />
      <Text style={[styles.chipNum, { color: theme.signatureText }]} maxFontSizeMultiplier={1.3}>{streak}</Text>
    </View>
  );
}

// One 14 pt mark per day: done = success fill; today complete = gold; rest = dashed outline
// with a bar (the half-rest); missed = outline; today is ringed in the text colour.
function Beat({ status, today, theme }) {
  let mark;
  if (status === 'done') mark = <View style={[styles.beat, { backgroundColor: theme.success }]} />;
  else if (status === 'complete') mark = <View style={[styles.beat, { backgroundColor: theme.signature }]} />;
  else if (status === 'rest') {
    mark = (
      <View style={[styles.beat, styles.beatOutline, { borderColor: theme.beatOutline, borderStyle: 'dashed' }]}>
        <View style={[styles.restBar, { backgroundColor: theme.beatOutline }]} />
      </View>
    );
  } else mark = <View style={[styles.beat, styles.beatOutline, { borderColor: theme.beatOutline }]} />;
  return (
    <View style={styles.beatSlot}>
      {mark}
      {today ? <View style={[styles.todayRing, { borderColor: theme.text }]} /> : null}
    </View>
  );
}

function BeatRow({ beats, theme }) {
  if (!beats || beats.length === 0) return null;
  const s = summarizeBeats(beats);
  return (
    <View style={styles.beats} accessible accessibilityLabel={t('today.beats.a11y', s)}>
      {beats.map(b => <Beat key={b.key} status={b.status} today={b.today} theme={theme} />)}
    </View>
  );
}

// The ring in each state. `state`: 'progress' | 'complete' | 'rest'. Empty progress (0 done)
// draws the dashed brandInk track, so no state relies on the decorative brandTrack.
// `bare`: the 28 pt sticky ring, which has no room for a count or glyph.
export function TodayRing({ state, completed, total, theme, ringSize, stroke, caption = true, bare = false }) {
  const dashed = state === 'rest' || (state === 'progress' && completed === 0);
  const complete = state === 'complete';
  let center = null;
  let sublabel = null;
  if (complete) {
    center = <Ionicons name="checkmark" size={30} color={theme.signature} />;
    sublabel = t('today.ring.ofTotal', { completed, total });
  } else if (state === 'rest') {
    center = <Ionicons name="moon-outline" size={26} color={theme.textSecondary} />;
    sublabel = t('today.ring.restCaption');
  } else {
    sublabel = t('today.ring.habits');
  }
  return (
    <ProgressRing
      progress={complete ? 1 : state === 'rest' ? 0 : (total > 0 ? completed / total : 0)}
      size={ringSize}
      strokeWidth={stroke}
      color={complete ? theme.signature : theme.success}
      bg={dashed ? theme.brandInk : theme.brandTrack}
      trackDashed={dashed}
      label={`${completed}/${total}`}
      labelColor={theme.text}
      center={bare ? <View /> : center}
      sublabel={caption && !bare ? sublabel : null}
      sublabelColor={theme.textSecondary}
    />
  );
}

// The strip's first line, and the ring's spoken label.
export function dayLine({ state, completed, total, streak }) {
  if (state === 'complete') return streak > 0 ? t('today.ring.complete', { count: streak }) : t('today.ring.completeNoStreak');
  if (state === 'rest') return streak > 0 ? t('today.ring.rest', { count: streak }) : t('today.restDay.title');
  return t('today.ring.progress', { completed, total, remaining: Math.max(0, total - completed) });
}

// ── Header ──────────────────────────────────────────────────────────────────────────────
/**
 * `state`: 'progress' | 'complete' | 'rest', or null for no strip (no habits yet).
 * `compact`: the window is shorter than size.ringTodayCompactBelow (76 pt ring, no caption).
 * `onStripLayout(e)`: the strip's layout, for the sticky-bar threshold and the budget log.
 */
export default function TodayHeader({
  theme, isDark, date, greeting, name, state, completed, total, streak, beats, compact, onStripLayout, stripRef,
}) {
  useLocale();
  const ringSize = compact ? size.ringTodayCompact : size.ringToday;
  const stroke = compact ? size.ringTodayCompactStroke : size.ringTodayStroke;
  const line = state ? dayLine({ state, completed, total, streak }) : null;
  const ringLabel = state === 'progress' ? t('today.ring.a11y', { completed, total }) : line;
  return (
    <View>
      <AppText variant="footnote" style={[styles.date, { color: theme.textSecondary }]}>{date}</AppText>
      <Greeting greeting={greeting} name={name} theme={theme} />
      {state ? (
        <View
          ref={stripRef}
          onLayout={onStripLayout}
          style={[styles.strip, { backgroundColor: theme.brandSurface }, !isDark && elevation.brandStrip]}
        >
          <View accessible accessibilityRole="progressbar" accessibilityLabel={ringLabel}
            accessibilityValue={state === 'progress' || state === 'complete' ? { min: 0, max: total, now: completed } : undefined}
          >
            <TodayRing state={state} completed={completed} total={total} theme={theme} ringSize={ringSize} stroke={stroke} caption={!compact} />
          </View>
          <View style={styles.right}>
            <Text style={[styles.line, { color: theme.text }]} importantForAccessibility="no" accessibilityElementsHidden>{line}</Text>
            <BeatRow beats={beats} theme={theme} />
            {streak > 0 ? (
              <View style={styles.chips}>
                <StreakChip streak={streak} theme={theme} />
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ── Sticky bar ──────────────────────────────────────────────────────────────────────────
/**
 * The collapsed header (DEP-5): opaque bg, a border hairline, the 28 pt ring, the count, the
 * greeting and the streak. Tapping it scrolls back to the top.
 */
export function TodayStickyBar({ theme, state, completed, total, greeting, streak, onPress, a11yLabel }) {
  useLocale();
  if (!state) return null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={t('today.sticky.hint')}
      style={[styles.sticky, { backgroundColor: theme.bg, borderBottomColor: theme.border }]}
    >
      <TodayRing state={state} completed={completed} total={total} theme={theme} ringSize={size.ringCollapsed} stroke={4} bare />
      {state !== 'rest' ? <Text style={[styles.stickyCount, { color: theme.text }]} maxFontSizeMultiplier={1.3}>{`${completed}/${total}`}</Text> : null}
      <Text style={[styles.stickyTitle, { color: theme.text }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{greeting}</Text>
      {streak > 0 ? <StreakChip streak={streak} theme={theme} style={styles.stickyChip} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  date: { lineHeight: 17 },
  greeting: { lineHeight: GREETING_LINE, letterSpacing: -0.3, marginTop: 2 },
  measureLayer: { position: 'absolute', left: 0, right: 0, top: 0 },
  invisible: { opacity: 0 },
  strip: {
    marginTop: space.xs,
    borderRadius: radius.card,
    paddingVertical: space.xs,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  right: { flex: 1, minWidth: 0 },
  line: { ...type.callout, fontWeight: '600' },
  beats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xxs, marginTop: space.xs, paddingVertical: 1 },
  beatSlot: { width: 14, height: 14 },
  beat: { width: 14, height: 14, borderRadius: radius.cell },
  beatOutline: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  restBar: { width: 7, height: 2, borderRadius: 1 },
  todayRing: { position: 'absolute', top: -3, left: -3, width: 20, height: 20, borderRadius: 6, borderWidth: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.xs },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: space.xxs, alignSelf: 'flex-start',
    borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: space.xxs,
  },
  chipNum: { fontSize: 15, lineHeight: 20, fontWeight: '600', ...numeric },
  sticky: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 48,
    flexDirection: 'row', alignItems: 'center', gap: space.xs,
    paddingHorizontal: space.gutter, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stickyChip: { alignSelf: 'center' },
  stickyCount: { fontSize: 15, fontWeight: '600', ...numeric },
  stickyTitle: { flex: 1, minWidth: 0, fontSize: 17, fontWeight: '600' },
});
