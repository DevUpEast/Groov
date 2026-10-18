// The Today header (C-04, D-00 r6): the date, the greeting, and the brand strip with the
// 88 pt progress ring, the day's line, the 7-day beat row and the streak chip; plus the 48 pt
// sticky bar that takes over once the strip scrolls away.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ProgressRing from './ProgressRing';
import AppText from './ui/AppText';
import CheckMark from './ui/CheckMark';
import RollingNumber from './ui/RollingNumber';
import useTween, { useBeatValue } from '../hooks/useTween';
import { useMotion, amount } from '../theme/motion';
import { space, radius, size, elevation } from '../theme/tokens';
import { type, numeric } from '../theme/typography';
import { t, useLocale } from '../i18n';
import { summarizeBeats } from '../utils/weekBeats';
import PressableScale, { hitSlopFor } from './ui/PressableScale';
import { subscribeBeats } from '../utils/beatBus';
import { useAnchor } from '../utils/creditAnchors';

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
// `tick` (C-06b, §4.1 beat 8 at +875): the streakTick beat that raised the count. The number
// rolls and the flame pulses 1.12x (spring.snappy); under reduced motion the chip flashes its
// signature colour instead (§4.3).
export function StreakChip({ streak, frozen = false, theme, style, onPress, tick = null }) {
  const label = frozen ? t('today.streak.frozenYesterday', { count: streak }) : t('today.streak.a11y', { count: streak });
  const m = useMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const last = useRef(streak);
  useEffect(() => {
    const rose = streak > last.current;
    last.current = streak;
    if (!rose || !tick) return;
    if (m.reduced) {
      const half = m.duration.reduced / 2;
      Animated.sequence([
        m.timing(flash, { toValue: 1, duration: half }),
        m.timing(flash, { toValue: 0, duration: half }),
      ]).start();
      return;
    }
    Animated.sequence([
      m.timing(pulse, { toValue: amount.flamePulse, duration: m.duration.press, easing: m.easing.emphasizedDecel }),
      m.springTo(pulse, m.spring.snappy, { toValue: 1 }),
    ]).start();
  }, [streak]); // eslint-disable-line react-hooks/exhaustive-deps
  const body = (
    <>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, { backgroundColor: theme.signature, opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, amount.flashOpacity] }) }]} />
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <Ionicons name="flame" size={15} color={theme.signature} />
      </Animated.View>
      <RollingNumber value={streak} roll={!!tick} style={[styles.chipNum, { color: theme.signatureText }]} maxFontSizeMultiplier={1.3} />
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
// `pop` (C-06b, §4.1 beat 6 at +250): the linkedReward beat that claimed today. The chip
// springs in from 0.8 (spring.snappy) with the challenge motif; under reduced motion its ✓
// fades in over 150 ms instead.
export function ChallengeChip({ name, day, days, done, theme, onPress, pop = null }) {
  // Trimmed: the chip's 4 pt gap spaces the parts, so a truncated name's ellipsis does not
  // sit a space and a half away from "· day 2".
  const [before = '', after = ''] = t('today.challengeChip', { name: NAME_MARK, day }).split(NAME_MARK).map(x => x.trim());
  const label = t(done ? 'today.challenge.a11yDone' : 'today.challenge.a11yPending', { name, day, days });
  const textStyle = [styles.chipText, { color: theme.text }];
  const m = useMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const mark = useRef(new Animated.Value(1)).current;
  const last = useRef(done);
  useEffect(() => {
    const claimed = done && !last.current;
    last.current = done;
    if (!claimed || !pop) return;
    if (m.reduced) {
      mark.setValue(0);
      m.timing(mark, { toValue: 1, duration: m.duration.reduced }).start();
      return;
    }
    scale.setValue(amount.chipPopFrom);
    m.springTo(scale, m.spring.snappy, { toValue: 1 }).start();
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    // A row wrapper, so the chip inside still shrinks (and its name truncates) in the strip.
    <Animated.View style={[styles.shrink, styles.popWrap, { transform: [{ scale }] }]}>
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
        ? <Animated.View style={[styles.fixed, { opacity: mark }]}><Ionicons name="checkmark" size={14} color={theme.text} /></Animated.View>
        : <Ionicons name="ellipse-outline" size={12} color={theme.text} style={styles.fixed} />}
    </PressableScale>
    </Animated.View>
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
// A chip that arrives on a beat (the streak chip at +875 on the first day of a streak) grows
// in from zero width instead of shoving its neighbour across in one frame (C-06b round 1 S1).
// It measures its child off-layout, then widens over duration.state (JS driver: a width).
// `active` is read once, at mount; reduced motion shows it at once.
function GrowIn({ active, children }) {
  const m = useMotion();
  const [growing, setGrowing] = useState(() => !!active && !m.reduced);
  const [box, setBox] = useState(null);
  const width = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!growing || !box) return undefined;
    const a = Animated.timing(width, { toValue: box.w, duration: m.duration.state, easing: m.easing.emphasizedDecel, useNativeDriver: false });
    a.start(({ finished }) => { if (finished) setGrowing(false); });
    return () => a.stop();
  }, [growing, box]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!growing) return children;
  return (
    <Animated.View style={[styles.growBox, { width, height: box ? box.h : CHIP_H }]}>
      <View style={styles.growMeasure} onLayout={e => { const { width: w, height: h } = e.nativeEvent.layout; if (!box) setBox({ w, h }); }}>
        {children}
      </View>
    </Animated.View>
  );
}

function BeatsAndChips({ beats, streak, frozen, challenges, theme, onStreakPress, onChallengePress, streakTick = null, chipsBeat = null }) {
  const list = challenges || [];
  const stacked = list.length >= 2;
  let streakItem = null;
  if (streak > 0) {
    streakItem = (
      <GrowIn key="streak" active={!!streakTick}>
        <StreakChip streak={streak} frozen={frozen} theme={theme} onPress={onStreakPress} tick={streakTick} />
      </GrowIn>
    );
  }
  else if (list.length === 0) streakItem = <StreakStartChip key="start" theme={theme} onPress={onStreakPress} />;
  const slot = slotChallenge(list);
  const first = slot
    ? <ChallengeChip key={slot.id} name={slot.name} day={slot.day} days={slot.days} done={slot.done} theme={theme} onPress={onChallengePress} pop={chipsBeat} />
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

/// The ring in each state. `state`: 'progress' | 'complete' | 'rest'. Empty progress (0 done)
// draws the dashed brandInk track, so no state relies on the decorative brandTrack.
// `bare`: the 28 pt sticky ring, which has no room for a count or glyph.
// C-06b (§4.1): the props are the held values of useHeaderMoment, so they change on the beat.
// - The green arc tweens on the progress beat (+125, 300 ms).
// - On the resolution beat (+750) a gold arc sweeps clockwise over it (200 ms,
//   easing.standard), the numeral fades out and a ✓ draws in. No green/gold cross-fade:
//   pixels go from green to gold at the sweep edge, never through olive (round 1 M1).
// - Leaving complete (an un-check) is a cut: gold, ✓, numeral and caption switch in the one
//   frame with the line, and only the arc tweens back (round 1 M3).
// - Reduced motion: the gold arc cuts in one frame; only the numeral and ✓ fade (150 ms).
// `roll`: the beat that changed the count (it rolls). `liveComplete`: the live (not held)
// state is complete; the gold sweep is started from the resolution beat only then (round 1
// B1: a step that broke the day inside the window must not leave the ring gold).
const PROGRESS_BEAT = Object.freeze({ beat: 'progress' });
const RESOLUTION_BEAT = Object.freeze({ beat: 'resolution' });
const STREAK_BEAT = Object.freeze({ beat: 'streakTick' });
const LINKED_BEAT = Object.freeze({ beat: 'linkedReward' });

export function TodayRing({ state, completed, total, theme, ringSize, stroke, caption = true, bare = false, roll = null, liveComplete = null }) {
  const m = useMotion();
  const dashed = state === 'rest' || (state === 'progress' && completed === 0);
  const complete = state === 'complete';
  const live = useRef(liveComplete);
  live.current = liveComplete == null ? complete : liveComplete;
  // Started from the resolution beat itself (anticipate), before the re-render it causes (the
  // held state), so they land on +750; provisional until that render confirms them.
  const toComplete = (item) => (item.beat === 'resolution' && live.current ? 1 : null);
  const sweep = useTween(complete ? 1 : 0, m.reduced ? { onlyOnBeat: true } : {
    // easing.standard (design r2): emphasizedDecel filled ~85 % in two frames and read as a snap.
    beat: RESOLUTION_BEAT, onlyOnBeat: true, easing: m.easing.standard, log: bare ? null : 'gold', anticipate: toComplete,
  });
  // The numeral / ✓ swap (native): a fade on the resolution beat (150 ms reduced), a cut back.
  const swap = useTween(complete ? 1 : 0, {
    beat: RESOLUTION_BEAT, onlyOnBeat: true, useNativeDriver: true, log: bare ? null : 'ringCheck', anticipate: toComplete,
  });
  // The ✓ draws in (full motion); under reduced motion it only fades with `swap`.
  const draw = useTween(m.reduced || complete ? 1 : 0, {
    beat: RESOLUTION_BEAT, onlyOnBeat: true, useNativeDriver: true, easing: m.easing.emphasizedDecel,
    anticipate: m.reduced ? null : toComplete, from: (_p, next) => (next === 1 ? 0 : null),
  });
  const fades = useMemo(() => ({
    numeral: swap.interpolate({ inputRange: [0, amount.numeralOutBy], outputRange: [1, 0], extrapolate: 'clamp' }),
    check: swap.interpolate({ inputRange: [0, amount.checkInFrom], outputRange: [0, 1], extrapolate: 'clamp' }),
  }), [swap]);
  const ringProps = { size: ringSize, strokeWidth: stroke, color: theme.success, completeColor: theme.signature, completeProgress: sweep };
  const tween = { beat: PROGRESS_BEAT, onlyOnBeat: true, log: bare ? null : 'ring' };
  if (state === 'rest') {
    return (
      <ProgressRing
        {...ringProps}
        tween={tween}
        progress={0}
        bg={theme.brandInk}
        trackDashed
        center={bare ? <View /> : <Ionicons name="moon-outline" size={26} color={theme.textSecondary} />}
        sublabel={caption && !bare ? t('today.ring.restCaption') : null}
        sublabelColor={theme.textSecondary}
      />
    );
  }
  // Progress and complete share one centre: the count and the ✓ stacked and swapped by
  // opacity, so the change never re-mounts the label mid-moment.
  const center = bare ? <View /> : (
    <View style={styles.ringCenter}>
      <Animated.View style={{ opacity: fades.numeral }}>
        <RollingNumber
          value={`${completed}/${total}`}
          roll={!!roll}
          Component={AppText}
          variant="displayRing"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          maxFontSizeMultiplier={1.2}
          style={{ color: theme.text, maxWidth: ringSize - stroke * 2 - 8, textAlign: 'center' }}
        />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.ringCheck, { opacity: fades.check }]} pointerEvents="none">
        <CheckMark color={theme.signature} size={RING_CHECK} strokeWidth={RING_CHECK_STROKE} progress={draw} />
      </Animated.View>
    </View>
  );
  return (
    <ProgressRing
      {...ringProps}
      tween={tween}
      progress={complete ? 1 : (total > 0 ? completed / total : 0)}
      bg={dashed ? theme.brandInk : theme.brandTrack}
      trackDashed={dashed}
      center={center}
      sublabel={caption && !bare ? (complete ? t('today.ring.ofTotal', { completed, total }) : t('today.ring.habits')) : null}
      sublabelColor={theme.textSecondary}
    />
  );
}
// The ring's ✓: an SVG CheckMark whose drawn glyph matches the 30 pt Ionicons check it replaces.
const RING_CHECK = 36;
const RING_CHECK_STROKE = 1.6;

// The strip's first line, and the ring's spoken label.
export function dayLine({ state, completed, total, streak }) {
  if (state === 'complete') return streak > 0 ? t('today.ring.complete', { count: streak }) : t('today.ring.completeNoStreak');
  if (state === 'rest') return streak > 0 ? t('today.ring.rest', { count: streak }) : t('today.restDay.title');
  // Nothing done yet: the first-run nudge (plan §1.2 8b) instead of "0 of 4 done".
  if (completed === 0) return t('today.ring.empty');
  // Every habit counted but the day not yet resolved (125-750 ms of a completing check, C-06b
  // round 1 M3): "5 of 5 done", never "0 to go".
  if (total > 0 && completed >= total) return t('today.ring.progressAll', { completed, total });
  return t('today.ring.progress', { completed, total, remaining: Math.max(0, total - completed) });
}

const sameCount = (a, b) => a.completed === b.completed && a.total === b.total;
const beatsKey = (list) => (list || []).map(b => `${b.key}:${b.status}:${b.today ? 1 : 0}`).join('|');
const sameBeats = (a, b) => a === b || beatsKey(a) === beatsKey(b);
const chipsKey = (list) => (list || []).map(c => `${c.id}:${c.name}:${c.day}:${c.days}:${c.done ? 1 : 0}`).join('|');
const sameChips = (a, b) => a === b || chipsKey(a) === chipsKey(b);

/**
 * C-06b: what the strip shows during a check-off moment (§4.1). Moving forward, each value is
 * held until its beat (src/hooks/useTween.js `useBeatValue`):
 * - the count, the arc and the progress line at +125 (progress); the beat-row mark at +425;
 * - the challenge chips at +250 (linkedReward), where the claimed chip springs;
 * - the complete state (gold sweep, ✓, caption, "Day complete" line) at +750 (resolution);
 * - the streak chip at +875 (streakTick), where its number rolls and the flame pulses.
 * Moving back (an un-check, a limit broken, a pull that lowers the count) nothing is held:
 * the centre, caption, line and chips switch in the one frame and only the arc tweens (round 1
 * M3). The line is derived from the shown state and count, so it never contradicts the ring.
 * Outside a moment (a sync pull, the choreography flag off) every value is live.
 * Screen-reader labels always use the live values.
 */
export function useHeaderMoment({ state, completed, total, streak, beats, challenges }) {
  const was = useRef(null);
  const prev = was.current || { state, completed, total, streak };
  // Back, or a different day size: shown at once.
  const back = completed < prev.completed || total !== prev.total || (prev.state === 'complete' && state !== 'complete');
  const shownState = useBeatValue(state, state === 'complete' && !back ? RESOLUTION_BEAT : null);
  const count = useBeatValue({ completed, total }, back ? null : PROGRESS_BEAT, { isEqual: sameCount });
  const shownStreak = useBeatValue(streak, streak < prev.streak ? null : STREAK_BEAT);
  const shownBeats = useBeatValue(beats, back ? null : PROGRESS_BEAT, { isEqual: sameBeats, release: 'end' });
  const chips = useBeatValue(challenges, LINKED_BEAT, { isEqual: sameChips });
  const shown = {
    state: shownState.value,
    completed: count.value.completed,
    total: count.value.total,
    streak: shownStreak.value,
  };
  was.current = shown;
  return {
    ...shown,
    countBeat: count.beat,
    line: shown.state ? dayLine({ state: shown.state, completed: shown.completed, total: shown.total, streak }) : null,
    streakTick: shownStreak.beat,
    beats: shownBeats.value,
    challenges: chips.value,
    chipsBeat: chips.beat,
  };
}

// The ring's pulse at the resolution (C-07, §4.1 beat 7b): 1 -> 1.06 (about 5 pt on the 88 pt
// ring) over duration.press, then back on spring.snappy, as the credit lands and the gold
// sweeps. Only when the day is (live) complete; none under reduced motion (the ring turns gold
// with a ✓). The wrapper is also the credit's target anchor (`anchorKey`), measured by
// CreditFlight, RingBurst and the milestone screen.
export function RingPulse({ live, anchorKey, children }) {
  const m = useMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const anchor = useAnchor(anchorKey);
  const liveRef = useRef(live);
  liveRef.current = live;
  useEffect(() => subscribeBeats(({ type, item }) => {
    if (type !== 'fire' || item.beat !== 'resolution' || m.reduced || !liveRef.current) return;
    Animated.sequence([
      m.timing(scale, { toValue: amount.ringPulse, duration: m.duration.press, easing: m.easing.emphasizedDecel }),
      m.springTo(scale, m.spring.snappy, { toValue: 1 }),
    ]).start();
  }), [m, scale]);
  return (
    <Animated.View ref={anchor} collapsable={false} style={{ transform: [{ scale }] }}>
      {children}
    </Animated.View>
  );
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
  const shown = useHeaderMoment({ state, completed, total, streak, beats, challenges });
  const liveLine = state ? dayLine({ state, completed, total, streak }) : null;
  const ringLabel = state === 'progress' ? t('today.ring.a11y', { completed, total }) : liveLine;
  const shownState = state ? (shown.state || state) : null;
  // The strip is TodayScreen's (layout, header budget) and the credit's departure edge (C-07).
  const stripAnchor = useAnchor('strip');
  const setStrip = useCallback((node) => {
    if (stripRef) stripRef.current = node;
    stripAnchor(node);
  }, [stripRef, stripAnchor]);
  return (
    <View>
      <AppText variant="footnote" style={[styles.date, { color: theme.textSecondary }]}>{date}</AppText>
      <Greeting greeting={greeting} name={name} theme={theme} />
      {state ? (
        <View
          ref={setStrip}
          onLayout={onStripLayout}
          style={[styles.strip, { backgroundColor: theme.brandSurface }, !isDark && elevation.brandStrip]}
        >
          <View accessible accessibilityRole="progressbar" accessibilityLabel={ringLabel}
            accessibilityValue={state === 'progress' || state === 'complete' ? { min: 0, max: total, now: completed } : undefined}
          >
            <RingPulse live={state === 'complete'} anchorKey="ring">
              <TodayRing state={shownState} completed={shown.completed} total={shown.total} theme={theme} ringSize={ringSize} stroke={stroke} caption={!compact} roll={shown.countBeat} liveComplete={state === 'complete'} />
            </RingPulse>
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
              {shown.line ?? liveLine}
            </Text>
            <BeatsAndChips
              beats={shown.beats} streak={shown.streak} frozen={frozen} challenges={shown.challenges} theme={theme}
              onStreakPress={onStreakPress} onChallengePress={onChallengePress}
              streakTick={shown.streakTick} chipsBeat={shown.chipsBeat}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ── Sticky bar ──────────────────────────────────────────────────────────────────────────
/**
 * The collapsed header (DEP-5): opaque bg, a border hairline, the 28 pt ring, the count, the
 * greeting and the streak. Tapping it scrolls back to the top. It follows the same beats as
 * the strip (useHeaderMoment).
 */
export function TodayStickyBar({ theme, state, completed, total, greeting, streak, frozen = false, onPress, a11yLabel }) {
  useLocale();
  const shown = useHeaderMoment({ state, completed, total, streak, beats: null, challenges: null });
  const barAnchor = useAnchor('sticky');
  if (!state) return null;
  const shownState = shown.state || state;
  return (
    <Pressable
      ref={barAnchor}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={t('today.sticky.hint')}
      style={[styles.sticky, { backgroundColor: theme.bg, borderBottomColor: theme.border }]}
    >
      <RingPulse live={state === 'complete'} anchorKey="ringSticky">
        <TodayRing state={shownState} completed={shown.completed} total={shown.total} theme={theme} ringSize={size.ringCollapsed} stroke={4} bare liveComplete={state === 'complete'} />
      </RingPulse>
      {shownState !== 'rest' ? (
        <RollingNumber value={`${shown.completed}/${shown.total}`} roll={!!shown.countBeat} style={[styles.stickyCount, { color: theme.text }]} maxFontSizeMultiplier={1.3} />
      ) : null}
      <Text style={[styles.stickyTitle, { color: theme.text }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{greeting}</Text>
      {shown.streak > 0 ? <StreakChip streak={shown.streak} frozen={frozen} theme={theme} style={styles.stickyChip} tick={shown.streakTick} /> : null}
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
  restBar: { width: 7, height: 2, borderRadius: radius.pill },
  todayRing: { position: 'absolute', top: -3, left: -3, width: 20, height: 20, borderRadius: radius.cell + 2, borderWidth: 2 },
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
  flash: { borderRadius: radius.pill },
  popWrap: { flexDirection: 'row' },
  growBox: { overflow: 'hidden', flexShrink: 0 },
  growMeasure: { position: 'absolute', left: 0, top: 0, flexDirection: 'row' },
  ringCenter: { alignItems: 'center', justifyContent: 'center' },
  ringCheck: { alignItems: 'center', justifyContent: 'center' },
  stickyCount: { fontSize: 15, fontWeight: '600', ...numeric },
  stickyTitle: { flex: 1, minWidth: 0, fontSize: 17, fontWeight: '600' },
});
