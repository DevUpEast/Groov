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
import PressableScale, { hitSlopFor } from './ui/PressableScale';

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
// Chips are 24 pt tall (D-00: 13/600 text, 4 x 10 padding); a pressable one grows its touch
// area to the platform minimum with hitSlop rather than with height.
const CHIP_H = 24;
// (48 - 24) / 2: the vertical hitSlop that grows a chip to the 48 dp touch minimum.
const SLOP = 12;

// The streak (C-05): a gold Ionicons flame and the count in the system face at 600 with
// tabular figures (< 24 pt, F-03). `frozen`: a freeze covered yesterday, so it holds the
// streak today (a snowflake after the count, and the spoken label says so). With `onPress` it is a button that opens the
// streak rule dialog (S-08); without (the sticky bar, which is itself a button) a plain view.
export function StreakChip({ streak, frozen = false, theme, style, onPress }) {
  const label = frozen ? t('today.streak.frozenYesterday', { count: streak }) : t('today.streak.a11y', { count: streak });
  const body = (
    <>
      <Ionicons name="flame" size={15} color={theme.signature} />
      <Text style={[styles.chipNum, { color: theme.signatureText }]} maxFontSizeMultiplier={1.3}>{streak}</Text>
      {frozen ? <Ionicons name="snow" size={13} color={theme.signatureText} /> : null}
    </>
  );
  const chipStyle = [styles.chip, styles.fixed, { backgroundColor: theme.signatureTint }, style];
  if (!onPress) return <View style={chipStyle} accessible accessibilityLabel={label}>{body}</View>;
  return (
    <PressableScale
      onPress={onPress}
      style={chipStyle}
      hitSlop={hitSlopFor(48, CHIP_H)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t('today.streak.hint')}
    >
      {body}
    </PressableScale>
  );
}

// Streak 0 with no challenge chip beside it: a muted "Start a streak" chip, so the strip's
// chip row is never empty (C-04 carry). It opens the same rule dialog.
export function StreakStartChip({ theme, onPress }) {
  return (
    <PressableScale
      onPress={onPress}
      style={[styles.chip, styles.fixed, styles.outlineChip, { borderColor: theme.beatOutline }]}
      hitSlop={hitSlopFor(48, CHIP_H)}
      accessibilityRole="button"
      accessibilityLabel={t('today.streak.start')}
      accessibilityHint={t('today.streak.hint')}
    >
      <Ionicons name="flame-outline" size={15} color={theme.textSecondary} />
      <Text style={[styles.chipText, { color: theme.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{t('today.streak.start')}</Text>
    </PressableScale>
  );
}

// One active challenge: "Kickstart · day 2" and a check (today claimed) or an open circle.
// The name is the part that truncates; the day number always shows. The locale's string is
// split at %{name}, so its word order is kept ("%{name} · %{day}日目").
const NAME_MARK = '\u0000';
export function ChallengeChip({ name, day, days, done, theme, onPress }) {
  // Trimmed: the chip's 4 pt gap spaces the parts, so a truncated name's ellipsis does not
  // sit a space and a half away from "· day 2".
  const [before = '', after = ''] = t('today.challengeChip', { name: NAME_MARK, day }).split(NAME_MARK).map(x => x.trim());
  const label = t(done ? 'today.challenge.a11yDone' : 'today.challenge.a11yPending', { name, day, days });
  const textStyle = [styles.chipText, { color: theme.text }];
  return (
    <PressableScale
      onPress={onPress}
      style={[styles.chip, styles.shrink, { backgroundColor: theme.surface }]}
      hitSlop={hitSlopFor(48, CHIP_H)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t('today.challengeChipHint')}
    >
      {before ? <Text style={[textStyle, styles.fixed]} maxFontSizeMultiplier={1.3}>{before}</Text> : null}
      <Text style={[textStyle, styles.shrink]} numberOfLines={1} ellipsizeMode="tail" maxFontSizeMultiplier={1.3}>{name}</Text>
      {after ? <Text style={[textStyle, styles.fixed, styles.num]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{after}</Text> : null}
      {done
        ? <Ionicons name="checkmark" size={14} color={theme.text} style={styles.fixed} />
        : <Ionicons name="ellipse-outline" size={12} color={theme.text} style={styles.fixed} />}
    </PressableScale>
  );
}

// "+N": the active challenges the slot does not show. Its label reads each one's state, and
// it carries the same mark as a challenge chip: ✓ when every hidden challenge is claimed
// today, ○ otherwise (C-05 review M2).
function MoreChip({ hidden, theme, onPress }) {
  const count = hidden.length;
  const list = hidden
    .map(c => t(c.done ? 'today.challenge.a11yDone' : 'today.challenge.a11yPending', { name: c.name, day: c.day, days: c.days }))
    .join(t('today.challengeListSep'));
  const allDone = hidden.every(c => c.done);
  return (
    <PressableScale
      onPress={onPress}
      style={[styles.chip, styles.fixed, styles.moreChip, { backgroundColor: theme.surface }]}
      hitSlop={hitSlopFor(MORE_MIN_W, CHIP_H)}
      accessibilityRole="button"
      accessibilityLabel={t('today.challengeMore', { count, list })}
      accessibilityHint={t('today.challengeChipHint')}
    >
      <Text style={[styles.chipText, styles.num, { color: theme.text }]} maxFontSizeMultiplier={1.3}>{`+${count}`}</Text>
      {allDone
        ? <Ionicons name="checkmark" size={14} color={theme.text} style={styles.fixed} />
        : <Ionicons name="ellipse-outline" size={12} color={theme.text} style={styles.fixed} />}
    </PressableScale>
  );
}
const MORE_MIN_W = 40;

// The challenge the single slot shows when there are several: the first one not yet claimed
// today (the one to act on), else the first. Exported for tests.
export function slotChallenge(list) {
  return (list || []).find(c => !c.done) || (list || [])[0] || null;
}

// The beat row and the chips (C-05), laid out so that no state grows the strip past the ring
// (the SE fold budget: 4 cards above the tab bar, header <= 26 %):
// - 0 or 1 active challenge (D-00): beats, then one chip row [streak][challenge].
// - 2 or more: the streak chip moves up beside the beats, and the chip row holds one challenge
//   (the first unclaimed) and "+N" for the rest. Two challenge chips side by side would leave
//   each name a few letters in the ~215 pt column, and a second chip row costs 24 pt (SE: card
//   4 under the tab bar).
// At streak 0 the streak slot is empty, unless there is no challenge either: then the muted
// "Start a streak" chip takes it, so the row is never bare (C-04 carry).
// Touch targets: a chip's 12 pt hitSlop is clipped to its parent on Android, so each row is
// padded to the slop and pulled back with a negative margin (no layout change). The two
// stacked rows sit 4 pt apart and split that gap, so their touch zones never overlap.
function BeatsAndChips({ beats, streak, frozen, challenges, theme, onStreakPress, onChallengePress }) {
  const list = challenges || [];
  const stacked = list.length >= 2;
  let streakItem = null;
  if (streak > 0) streakItem = <StreakChip key="streak" streak={streak} frozen={frozen} theme={theme} onPress={onStreakPress} />;
  else if (list.length === 0) streakItem = <StreakStartChip key="start" theme={theme} onPress={onStreakPress} />;
  const slot = slotChallenge(list);
  const first = slot
    ? <ChallengeChip key={slot.id} name={slot.name} day={slot.day} days={slot.days} done={slot.done} theme={theme} onPress={onChallengePress} />
    : null;
  const hidden = list.filter(c => c !== slot);
  const more = hidden.length > 0 ? <MoreChip key="more" hidden={hidden} theme={theme} onPress={onChallengePress} /> : null;
  if (!stacked) {
    const row = [streakItem, first].filter(Boolean);
    return (
      <>
        <BeatRow beats={beats} theme={theme} />
        {row.length ? <View style={[styles.chips, styles.slop]}>{row}</View> : null}
      </>
    );
  }
  return (
    <>
      <View style={[styles.chips, styles.chipsTight, styles.slopTop]}>
        <BeatRow beats={beats} theme={theme} inline />
        {streakItem}
      </View>
      <View style={[styles.chips, styles.chipsTight, styles.slopBottom]}>{first}{more}</View>
    </>
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

function BeatRow({ beats, theme, inline = false }) {
  if (!beats || beats.length === 0) return null;
  const s = summarizeBeats(beats);
  return (
    <View style={[styles.beats, inline && styles.beatsInline]} accessible accessibilityLabel={t('today.beats.a11y', { ...s, count: s.days })}>
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
  // Nothing done yet: the first-run nudge (plan §1.2 8b) instead of "0 of 4 done".
  if (completed === 0) return t('today.ring.empty');
  return t('today.ring.progress', { completed, total, remaining: Math.max(0, total - completed) });
}

// ── Header ──────────────────────────────────────────────────────────────────────────────
/**
 * `state`: 'progress' | 'complete' | 'rest', or null for no strip (no habits yet).
 * `compact`: the window is shorter than size.ringTodayCompactBelow (76 pt ring, no caption).
 * `onStripLayout(e)`: the strip's layout, for the sticky-bar threshold and the budget log.
 * C-05 chips: `frozen` (a freeze covered yesterday, so it holds the streak today), `challenges` ([{ id, name, day, days,
 * done }], the active challenges in order), `onStreakPress` (the rule dialog) and
 * `onChallengePress` (the Challenges tab).
 */
export default function TodayHeader({
  theme, isDark, date, greeting, name, state, completed, total, streak, beats, compact, onStripLayout, stripRef,
  frozen = false, challenges, onStreakPress, onChallengePress,
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
            {/* Short windows (SE) keep the line to one line (shrinking a little on native, then
                truncating), so a long locale's line plus the chip row never grows the strip past
                the 76 pt ring and card 4 stays above the tab bar (C-05). */}
            <Text
              style={[styles.line, { color: theme.text }]}
              importantForAccessibility="no"
              accessibilityElementsHidden
              {...(compact ? { numberOfLines: 1, ellipsizeMode: 'tail', adjustsFontSizeToFit: true, minimumFontScale: 0.85 } : null)}
            >
              {line}
            </Text>
            <BeatsAndChips beats={beats} streak={streak} frozen={frozen} challenges={challenges} theme={theme} onStreakPress={onStreakPress} onChallengePress={onChallengePress} />
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
export function TodayStickyBar({ theme, state, completed, total, greeting, streak, frozen = false, onPress, a11yLabel }) {
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
      {streak > 0 ? <StreakChip streak={streak} frozen={frozen} theme={theme} style={styles.stickyChip} /> : null}
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
  // One row per line of chips, no wrap: a challenge name truncates instead (BeatsAndChips).
  chips: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: 6 },
  // Two rows under the line (2+ challenges): 20 + 4 + 24 + 4 + 24 = 76, the compact ring.
  chipsTight: { marginTop: space.xxs },
  // The touch slop (BeatsAndChips): padding the chips' 12 pt hitSlop, cancelled by margins.
  slop: { paddingVertical: SLOP, marginTop: 6 - SLOP, marginBottom: -SLOP },
  // Stacked rows: 12 pt outside the pair, 2 pt (half the 4 pt gap) between them.
  slopTop: { paddingTop: SLOP, paddingBottom: 2, marginTop: space.xxs - SLOP, marginBottom: -2 },
  slopBottom: { paddingTop: 2, paddingBottom: SLOP, marginTop: space.xxs - 2, marginBottom: -SLOP },
  moreChip: { minWidth: MORE_MIN_W, justifyContent: 'center' },
  beatsInline: { marginTop: 0, flexWrap: 'nowrap', flexShrink: 0 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: space.xxs, alignSelf: 'flex-start',
    minHeight: CHIP_H, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2,
  },
  outlineChip: { borderWidth: 1, paddingHorizontal: 9 },
  fixed: { flexShrink: 0 },
  shrink: { flexShrink: 1, minWidth: 0 },
  chipNum: { ...type.numericSmall, fontSize: 15, lineHeight: 20 },
  chipText: { ...type.footnoteStrong },
  num: { ...numeric },
  sticky: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 48,
    flexDirection: 'row', alignItems: 'center', gap: space.xs,
    paddingHorizontal: space.gutter, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stickyChip: { alignSelf: 'center' },
  stickyCount: { fontSize: 15, fontWeight: '600', ...numeric },
  stickyTitle: { flex: 1, minWidth: 0, fontSize: 17, fontWeight: '600' },
});
