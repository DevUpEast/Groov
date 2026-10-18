import React, { useState, useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useApp } from '../context/AppContext';
import { completionsInWeek, describeSchedule } from '../utils/schedule';
import { addDays } from '../utils/dates';
import feedback from '../services/feedback';
import { announce } from '../utils/a11y';
import HabitIcon from './HabitIcon';
import ActionSheet from './ui/ActionSheet';
import PressableScale, { hitSlopFor } from './ui/PressableScale';
import IconButton from './ui/IconButton';
import AppText from './ui/AppText';
import CheckMark from './ui/CheckMark';
import { usesCounter, countStep, describeProgress, unitLabel } from '../utils/habits';
import { t, useLocale, getLocale } from '../i18n';
import { resolveAccent } from '../theme/accents';
import { type, numeric } from '../theme/typography';
import { space, radius, size } from '../theme/tokens';
import { FLAGS } from '../utils/flags';
import RollingNumber from './ui/RollingNumber';
import useTween from '../hooks/useTween';
import { findBeat, matchesBeat, subscribeBeats } from '../utils/beatBus';
import { amount, duration as durations, easing as easings, useMotion } from '../theme/motion';
import { useAnchor, checkKey } from '../utils/creditAnchors';

// C-06b (plan §4.1): the card's part of the check-off moment, on the beats useCheckoffMoment
// emits (src/utils/beatBus.js). Outside a moment (a sync pull, the widget, the choreography
// flag off) every change shows at once.
// - confirm (0): the ✓ draws in over 200 ms (emphasizedDecel) and the previous look (the open
//   card and ring, or on an un-check the tinted card and filled disc) fades out over the new
//   one, so the accent fill and the opaque tint fade in by opacity, never by a colour tween.
//   Both start at the commit of the new done state, over their full length (round 1 M2: on
//   the beat clock the ~100 ms tap render ate them, and no partial frame ever painted);
// - count (0) / confirm of this habit: the counter's number rolls;
// - habitStreak (375): the sub-line with the streak pulses 1 -> 1.06 -> 1 over 200 ms.
// Reduced motion: the ✓ appears under the 150 ms fade, the number cross-fades in place and
// the streak gets a signature-colour flash instead of a scale (§4.3).
const confirmMatch = (habitId) => ({ beat: 'confirm', habitId });
const ownBeat = (item, habitId) => item.habitId === habitId;

// The previous done look while it fades out over the new one: { from: { done } | null,
// opacity }. Decided in render, so the frame that commits the new state already carries the
// old look on top at full opacity (round 1 S5: no frame of "Done" before the ✓).
function useDoneFade(done, habitId) {
  const [, force] = useReducer((x) => x + 1, 0);
  const opacity = useRef(new Animated.Value(0)).current;
  const committed = useRef(done);
  const fading = useRef(null);
  let from = fading.current;
  if (done !== committed.current) {
    const hit = findBeat(confirmMatch(habitId));
    if (hit) {
      from = { done: committed.current };
      opacity.setValue(1);
    } else {
      from = null;
    }
  }
  useLayoutEffect(() => {
    if (committed.current === done) return;
    const was = committed.current;
    committed.current = done;
    const hit = findBeat(confirmMatch(habitId));
    if (!hit || hit.item.duration < FRAME_MS) { fading.current = null; opacity.setValue(0); return; }
    fading.current = { done: was };
    Animated.timing(opacity, { toValue: 0, duration: hit.item.duration, easing: easings.standard, useNativeDriver: true })
      .start(({ finished }) => { if (finished) { fading.current = null; force(); } });
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps
  return { from, opacity };
}
const FRAME_MS = 16;

// The sub-line parts joined with " · ", first letter capitalised for the locale: the streak
// strings are lower case so they read naturally after "Done ·" (G-01: "Día completo · racha
// de 12 días") and still start the line in upper case when they come first.
export function joinSubLine(parts, locale) {
  const line = parts.filter(Boolean).join(' · ');
  if (!line) return '';
  const first = String.fromCodePoint(line.codePointAt(0));
  return first.toLocaleUpperCase(locale) + line.slice(first.length);
}

// What a tap on the card body does (C-02b, BTN-6):
//   daily / quit -> 'toggle' (done / not done)
//   counter (volume, timed, at most) -> 'detail' (opens the habit's detail sheet) when
//     FLAGS.counterBodyOpensDetail is on and the screen can show one, else 'increment' (+step).
export function bodyPressAction(habit, { opensDetail = FLAGS.counterBodyOpensDetail, canOpenDetail = false } = {}) {
  if (!usesCounter(habit)) return 'toggle';
  return opensDetail && canOpenDetail ? 'detail' : 'increment';
}

// The finished counter collapses to one pill (C-02b, CHK-7): volume and timed habits at goal,
// unless a timer is still running (its stop button must stay reachable). "At most" habits are
// "done" from 0, so they keep their − / + controls.
export function showsDonePill(habit, { done, timerRunning = false } = {}) {
  return usesCounter(habit) && habit.type !== 'atMost' && !!done && !timerRunning;
}

export default function HabitCard({ habit, onIncrement, onDecrement, onNote, onSkipToggle, onOpenDetail }) {
  const {
    getHabitCount, isHabitDone, isHabitDoneOn, getStreakForHabit, theme, themeName, todayStr,
    isHabitSkippedOn, toggleSkipHabitOn, toggleHabitDoneOn, getNote,
  } = useApp();
  useLocale();
  // The habit's curated accent for this theme (C-01): legacy, unknown and missing colours are
  // remapped at read time. `ring` is the unchecked 2 px ring, `fill` + `onFill` the done check,
  // `tint` the opaque done-card ground; every pair is >= 3:1 (CHK-2, accents.test.js).
  const accent = resolveAccent(habit.color, themeName);
  const count = getHabitCount(habit.id);
  const done = isHabitDone(habit);
  const today = todayStr();
  const skipped = !done && isHabitSkippedOn(habit.id, today);
  const isVolume = usesCounter(habit);
  const isQuit = habit.type === 'quit';
  const isTimed = habit.type === 'timed';
  const isLimit = habit.type === 'atMost';
  const overLimit = isLimit && count > habit.volumeGoal;
  const step = countStep(habit);
  // Consecutive days (ending today) this habit hit its goal; one day is not yet a streak.
  const streak = getStreakForHabit(habit.id);
  const streakLabel = streak >= 2 ? (isQuit ? t('habitCard.streakClean', { count: streak }) : t('habitCard.streak', { count: streak })) : null;

  // C-06b motion (see the top of the file).
  const m = useMotion();
  const fade = useDoneFade(done, habit.id);
  // The day-complete credit leaves from this card's check (C-07); only one of the check disc
  // and the done pill is rendered at a time.
  const checkAnchor = useAnchor(checkKey(habit.id));
  // Native driver, started at the commit over the full 200 ms (fromCommit, round 1 M2).
  const draw = useTween(m.reduced || done ? 1 : 0, {
    beat: confirmMatch(habit.id), onlyOnBeat: true, fromCommit: true, easing: easings.emphasizedDecel, useNativeDriver: true,
    from: (_prev, next) => (next === 1 ? 0 : null), log: (to) => (to === 1 ? 'check' : null),
  });
  // A roll only for this habit's own count or confirm beat (not Mark the rest's, round 1 n3).
  const countHit = findBeat({ beat: ['count', 'confirm'], habitId: habit.id });
  const rolls = !!countHit && ownBeat(countHit.item, habit.id);
  const countRoll = { roll: rolls, duration: rolls ? countHit.item.duration : durations.state };
  const streakPulse = useRef(new Animated.Value(1)).current;
  const streakFlash = useRef(new Animated.Value(0)).current;
  useEffect(() => subscribeBeats(({ type, item }) => {
    if (type !== 'fire' || !matchesBeat(item, { beat: 'habitStreak', habitId: habit.id })) return;
    const half = item.duration / 2;
    // Reduced motion: a signature-colour wash behind the sub-line, like the streak chip (m2).
    const [v, peak, rest] = m.reduced ? [streakFlash, 1, 0] : [streakPulse, amount.streakPulse, 1];
    Animated.sequence([
      m.timing(v, { toValue: peak, duration: half }),
      m.timing(v, { toValue: rest, duration: half }),
    ]).start();
  }), [habit.id, m]); // eslint-disable-line react-hooks/exhaustive-deps

  // Timed habits: a simple start/stop timer that adds whole minutes when stopped.
  const [timerStart, setTimerStart] = useState(null);
  const [, setTick] = useState(0);
  const tickRef = useRef(null);
  useEffect(() => {
    if (!timerStart) { clearInterval(tickRef.current); return undefined; }
    tickRef.current = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(tickRef.current);
  }, [timerStart]);
  const elapsedSec = timerStart ? Math.floor((Date.now() - timerStart) / 1000) : 0;
  // Start/stop plays toggle.on / toggle.off: Android only. On iOS the timer button is silent by
  // design (F-06, F-04a n5): §2.10 gives toggles no iOS haptic ("native": only a real Switch has
  // one) and a plain press is silent; a stop that logs minutes still gets counter.step/habit.done.
  // A counter change read out for screen readers (every path, not only the body tap: the
  // per-check toast is gone since C-06a, so this is the only confirmation).
  const sayCount = (n) => announce(t(isLimit ? 'habitCard.announce.countMax' : 'habitCard.announce.count', { name: habit.name, count: Math.max(0, n), goal: habit.volumeGoal }));
  const toggleTimer = () => {
    if (!timerStart) { feedback.toggled(true); setTimerStart(Date.now()); return; }
    const mins = Math.round(elapsedSec / 60);
    setTimerStart(null);
    // A stop that logs minutes gets the increment's feedback (counter.step or habit.done).
    if (mins >= 1) { onIncrement(mins); sayCount(count + mins); }
    else feedback.toggled(false);
  };
  // perWeek habits show weekly progress instead of a per-day count.
  const perWeek = habit.schedule?.type === 'perWeek' ? habit.schedule.target : 0;
  const weekDone = perWeek ? completionsInWeek(todayStr(), todayStr(), (k) => isHabitDoneOn(habit, k)) : 0;
  const weekLabel = perWeek ? (weekDone >= perWeek ? t('habitCard.weekDone', { done: weekDone, target: perWeek }) : t('habitCard.week', { done: weekDone, target: perWeek })) : null;
  const note = getNote(habit.id, today);
  const intentionLabel = habit.intention ? t('habitDetail.afterI', { intention: habit.intention }) : null;
  // One done rule (D-00): a done card reads "Done · N-day streak"; a quit habit reads "Avoided
  // today · N days clean". The count of a limit habit stays, because for "at most" the number
  // is the point; other progress gives way to "Done".
  // An open daily or quit card leads with its intention ("After I …", D-00), keeps the week and
  // streak, and falls back to its schedule ("Every day"), so every card has a sub-line and the
  // name sits at the same y before and after a check-off (C-02a design S2).
  const parts = [
    done ? (isQuit ? t('progressText.quit') : t('habitCard.done')) : null,
    skipped ? t('habitCard.skippedToday') : null,
    !done && !skipped && !isVolume ? intentionLabel : null,
    !done || isLimit ? describeProgress(habit, count) : null,
    timerStart ? t('habitCard.timer', { time: `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, '0')}` }) : null,
    weekLabel, streakLabel, note ? '📝' : null,
  ];
  const subLine = joinSubLine(parts, getLocale()) || describeSchedule(habit.schedule);

  // Long-press: forgiveness actions (skip today keeps the streak; fix yesterday).
  const yesterday = addDays(today, -1);
  const yesterdayDone = isHabitDoneOn(habit, yesterday);
  // An ActionSheet, not a system alert: Android alerts show at most 3 buttons (Cancel was dropped)
  // and ignore back. The sheet plays the long-press haptic itself.
  const [menuOpen, setMenuOpen] = useState(false);
  const handleLongPress = () => setMenuOpen(true);
  // The counter and timer buttons are part of the card: a long hold on them opens the same menu.
  const holdForOptions = { onLongPress: handleLongPress, delayLongPress: LONG_PRESS_MS };
  const removeAmount = Math.min(step, count);
  const menuOptions = [
    { label: skipped ? t('habitCard.longPress.unskip') : t('habitCard.longPress.skip'), onPress: () => { toggleSkipHabitOn(habit.id, today); onSkipToggle?.(habit); } },
    { label: yesterdayDone ? t('habitCard.longPress.undoYesterday') : t('habitCard.longPress.markYesterday'), onPress: () => toggleHabitDoneOn(habit.id, yesterday) },
    // The − is hidden once a counter reaches its goal (the done pill), so the decrement lives
    // here too (C-02b acceptance d; C-03 keeps this option).
    // The label says what is removed: a step, or what is left when that is less (count floors
    // at 0, code review m3).
    ...(isVolume && count > 0 ? [{ label: removeAmount > 1 ? t('habitCard.longPress.minusMany', { count: removeAmount }) : t('habitCard.longPress.minusOne'), onPress: () => { onDecrement(removeAmount); sayCount(count - removeAmount); } }] : []),
    ...(onNote ? [{ label: note ? t('habitCard.longPress.editNote') : t('habitCard.longPress.addNote'), onPress: () => onNote(habit, today) }] : []),
  ];

  // Tapping anywhere on the card: see bodyPressAction.
  const bodyAction = bodyPressAction(habit, { canOpenDetail: !!onOpenDetail });
  const opensDetail = bodyAction === 'detail';
  const donePill = showsDonePill(habit, { done, timerRunning: !!timerStart });
  const handleCardPress = opensDetail
    ? () => onOpenDetail(habit)
    : isLimit
    ? () => { onIncrement(step); announce(t('habitCard.announce.countMax', { name: habit.name, count: count + step, goal: habit.volumeGoal })); }
    : isVolume
      ? () => { onIncrement(step); announce(t('habitCard.announce.count', { name: habit.name, count: count + step, goal: habit.volumeGoal })); }
      : () => { if (done) { onDecrement(1); announce(t('habitCard.announce.unchecked', { name: habit.name })); } else { onIncrement(1); announce(isQuit ? t('habitCard.announce.avoided', { name: habit.name }) : t('habitCard.announce.done', { name: habit.name })); } };

  return (
    <>
      {/* PressableScale: 0.97 press scale, ripple on Android, overlay on iOS/web (F-06). */}
      <PressableScale
        style={[
          styles.card,
          // borderStyle is always explicit: Android keeps a dashed border after the key is
          // dropped, so an unskipped (or skipped-then-done) card would stay dashed.
          { backgroundColor: theme.surface, borderColor: theme.border, borderStyle: 'solid' },
          // Done: the opaque, pre-mixed accent tint (CHK-8) edge to edge. The border takes the
          // tint too, so an all-done list is calm tinted blocks with no outlines (C-01 review);
          // the filled check carries "done".
          done && { backgroundColor: accent.tint, borderColor: accent.tint },
          overLimit && { borderColor: theme.dangerText, backgroundColor: theme.dangerTint },
          // Skipped: a dashed controlBorder outline at full opacity, nothing faded (C-02a).
          skipped && { borderColor: theme.controlBorder, borderStyle: 'dashed' },
        ]}
        onPress={handleCardPress}
        onLongPress={handleLongPress}
        delayLongPress={LONG_PRESS_MS}
        // A daily / quit body tap checks the card off (or back): the ✓ and the tint are the
        // feedback, so no ripple greys the fresh tint (C-06b carry S2).
        stateChange={bodyAction === 'toggle'}
        accessibilityRole={isVolume ? 'button' : 'checkbox'}
        accessibilityState={isVolume ? undefined : { checked: done }}
        accessibilityLabel={`${habit.name}${isVolume ? `${unitLabel(habit) ? t('habitCard.a11y.countUnit', { count, goal: habit.volumeGoal, unit: unitLabel(habit) }) : t('habitCard.a11y.count', { count, goal: habit.volumeGoal })}${isLimit ? t('habitCard.a11y.maximum') : ''}` : ''}${overLimit ? t('habitCard.a11y.overLimit') : done ? (isQuit ? t('habitCard.a11y.avoided') : t('habitCard.a11y.done')) : skipped ? t('habitCard.a11y.skipped') : t('habitCard.a11y.notDone')}${streak >= 2 ? t('habitCard.a11y.streak', { count: streak }) : ''}`}
        accessibilityHint={opensDetail ? t('habitCard.a11y.openDetail') : t('habitCard.a11y.hint')}
      >
        {/* C-06b: the previous look fading out over the new one (useDoneFade). */}
        {fade.from ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.fadeLayer, fade.from.done ? { backgroundColor: accent.tint, borderColor: accent.tint } : { backgroundColor: theme.surface, borderColor: theme.border }, { opacity: fade.opacity }]}
          />
        ) : null}
        {/* The icon sits in a neutral 40 px well; the accent lives only in the check (CHK-4/5). */}
        <View style={[styles.well, { backgroundColor: theme.well }]}>
          <HabitIcon habit={habit} size={22} imageStyle={styles.iconImage} textStyle={styles.icon} />
        </View>

        <View style={styles.info}>
          {/* Full `text` contrast in every state: done is carried by the check and tint (CHK-3). */}
          <AppText variant="bodyStrong" style={{ color: theme.text }} numberOfLines={1}>
            {habit.name}
          </AppText>
          {/* Always rendered (schedule fallback). Counter and timer cards have a narrow info
              column beside 3 or 4 controls, so their sub-line may wrap to a second line rather
              than cut the streak off (code review m2). */}
          <View>
            <Animated.View pointerEvents="none" style={[styles.subFlash, { backgroundColor: theme.signatureTint, opacity: streakFlash }]} />
            <Animated.Text style={[styles.sub, { color: theme.textSecondary, transform: [{ scale: streakPulse }], transformOrigin: 'left center' }]} numberOfLines={isVolume ? 2 : 1}>{subLine}</Animated.Text>
          </View>
        </View>

        {donePill ? (
          /* Done counter (C-02b, D-00): the − / + / ▶ collapse to one filled accent pill
             "8 ✓". 36 tall like the buttons it replaces, so reaching the goal never changes
             the card height; it ends 12 from the edge like the check disc. A tap adds a step
             (counts may exceed the goal); a long hold opens the options (with "−1"). */
          <PressableScale
            testID="habit-done-pill"
            style={[styles.pill, { backgroundColor: accent.fill }]}
            onPress={() => {
              onIncrement(step);
              announce(t('habitCard.announce.count', { name: habit.name, count: count + step, goal: habit.volumeGoal }));
            }}
            {...holdForOptions}
            hitSlop={hitSlopFor(PILL_MIN_W, COUNTER_BTN)}
            accessibilityRole="button"
            accessibilityLabel={t('habitCard.doneCount', { name: habit.name, count, goal: habit.volumeGoal })}
            accessibilityHint={(step > 1 ? t('habitCard.a11y.addMany', { count: step, unit: unitLabel(habit) }) : t('habitCard.a11y.addOne', { unit: unitLabel(habit) })).trim()}
          >
            <RollingNumber value={count} {...countRoll} style={[styles.pillNum, { color: accent.onFill }]} numberOfLines={1} />
            {/* The credit leaves from this ✓ when the goal step completes the day (C-07). */}
            <View ref={checkAnchor} collapsable={false}>
              <CheckMark color={accent.onFill} size={16} progress={draw} />
            </View>
          </PressableScale>
        ) : isVolume ? (
          <View style={styles.counter}>
            {/* At 0 the − is disabled: IconButton's disabled variant (a disabledContainer hairline
                and an onDisabled glyph, lighter than the +), still focusable; a tap plays
                `refused`, a long hold opens the options. */}
            <IconButton
              size={COUNTER_BTN}
              icon="remove"
              iconSize={20}
              style={[styles.counterBtn, { borderColor: theme.controlBorder }]}
              onPress={() => { onDecrement(step); sayCount(count - step); }}
              {...holdForOptions}
              onDisabledLongPress={handleLongPress}
              disabled={count <= 0}
              accessibilityLabel={(step > 1 ? t('habitCard.a11y.removeMany', { count: step, unit: unitLabel(habit) }) : t('habitCard.a11y.removeOne', { unit: unitLabel(habit) })).trim()}
            />

            {/* The count is text (4.5:1). */}
            <RollingNumber value={count} {...countRoll} style={[styles.counterNum, { color: overLimit ? theme.dangerText : theme.text }]} numberOfLines={1} />

            {/* A timed habit's ▶ / ■ takes the + slot until it is done (CHK-7: one primary
                control per card); its minutes come from the timer, the detail sheet or the pill. */}
            {isTimed ? (
              <IconButton
                size={COUNTER_BTN}
                icon={timerStart ? 'stop' : 'play'}
                iconSize={16}
                color={timerStart ? theme.onDanger : accent.fill}
                style={[styles.counterBtn, { borderColor: timerStart ? theme.dangerFill : accent.ring, backgroundColor: timerStart ? theme.dangerFill : 'transparent' }]}
                onPress={toggleTimer}
                {...holdForOptions}
                accessibilityLabel={timerStart ? t('habitCard.a11y.stopTimer') : t('habitCard.a11y.startTimer')}
              />
            ) : (
              <IconButton
                size={COUNTER_BTN}
                icon="add"
                iconSize={20}
                color={isLimit ? theme.textSecondary : accent.fill}
                style={[styles.counterBtn, { borderColor: isLimit ? theme.controlBorder : accent.ring, backgroundColor: 'transparent' }]}
                onPress={() => { onIncrement(step); sayCount(count + step); }}
                {...holdForOptions}
                accessibilityLabel={(step > 1 ? t('habitCard.a11y.addMany', { count: step, unit: unitLabel(habit) }) : t('habitCard.a11y.addOne', { unit: unitLabel(habit) })).trim()}
              />
            )}
          </View>
        ) : (
          /* Daily and quit: a visual-only check in the fixed 48 dp trailing slot; the whole card
             handles the tap. One done form for every type: the accent disc with the SVG ✓
             (CHK-1; quit no longer draws 🛡). A skipped card's ring goes neutral. */
          <View style={styles.slot}>
            <View
              testID="habit-check"
              // The day-complete credit leaves from here (C-07, CreditFlight).
              ref={checkAnchor}
              collapsable={false}
              style={[
                styles.checkbox,
                { borderColor: done ? accent.fill : skipped ? theme.controlBorder : accent.ring },
                done && { backgroundColor: accent.fill },
              ]}
            >
              {/* The previous look fades out under the ✓, which draws on top (round 1 m1). */}
              {fade.from ? (
                <Animated.View
                  pointerEvents="none"
                  style={[styles.discFade, fade.from.done ? { backgroundColor: accent.fill, borderColor: accent.fill } : { backgroundColor: theme.surface, borderColor: skipped ? theme.controlBorder : accent.ring }, { opacity: fade.opacity }]}
                >
                  {fade.from.done ? <CheckMark color={accent.onFill} /> : null}
                </Animated.View>
              ) : null}
              {done ? <CheckMark color={accent.onFill} progress={draw} /> : null}
            </View>
          </View>
        )}
      </PressableScale>
      <ActionSheet
        visible={menuOpen}
        title={habit.name}
        message={t('habitCard.longPress.body')}
        options={menuOptions}
        onCancel={() => setMenuOpen(false)}
      />
    </>
  );
}

// Counter ± and timer buttons: 36 visual, hitSlop 6 to the 48 dp target (4 to 44 pt on iOS);
// the gap is two slops (12 dp / 8 pt), so neighbouring targets meet without overlapping.
const COUNTER_BTN = 36;
const LONG_PRESS_MS = 350;
const COUNTER_GAP = 2 * hitSlopFor(COUNTER_BTN).left;
// The done pill: 36 tall like the counter buttons (the card height is unchanged at goal) and
// at least 48 wide, so its own width already meets the touch minimum.
const PILL_MIN_W = 48;

// Anatomy (D-00 frame): 16 | 40 well | 12 | info | 48 trailing slot | 4. The well, the info
// column and the slot keep the same x on every card; the 32 check is centred in the slot (12
// from the edge) and the counter cluster ends there too (12).
const WELL = 40;

const styles = StyleSheet.create({
  card: {
    // §2.6: one minimum height for every Today card (72), so a check-off that adds the
    // "Done · 2-day streak" line never changes the card height or shifts the list (CHK-6).
    minHeight: size.todayCardMin,
    borderRadius: radius.card,
    borderWidth: 1,
    paddingLeft: space.md,
    paddingRight: space.xxs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.xs,
    // Cards are border-only in light and tonal in dark (§2.8); no shadow. Clips the ripple.
    overflow: 'hidden',
  },
  well: { width: WELL, height: WELL, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  icon: { fontSize: 22, lineHeight: 28, textAlign: 'center' },
  iconImage: { width: WELL, height: WELL, borderRadius: radius.pill },
  info: { flex: 1, minWidth: 0, paddingVertical: space.xs },
  // footnote 13/18; tabular, so the running timer ("0:03") and counts change without jitter.
  sub: { ...type.footnote, marginTop: 2, ...numeric },
  slot: { width: size.trailingSlot, alignItems: 'center', justifyContent: 'center' },
  // C-06b fade layers: they cover the border too (the card clips them to its rounded box).
  subFlash: { position: 'absolute', top: 1, bottom: -1, left: -space.xxs, right: 0, borderRadius: radius.cell },
  fadeLayer: { position: 'absolute', top: -1, left: -1, right: -1, bottom: -1, borderRadius: radius.card, borderWidth: 1 },
  discFade: {
    position: 'absolute', top: -2, left: -2, right: -2, bottom: -2, borderRadius: radius.pill, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  checkbox: {
    width: size.checkCircle, height: size.checkCircle, borderRadius: radius.pill,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  // Ends 12 from the card edge (4 padding + 8), the same right edge as the check disc (D-00).
  counter: { flexDirection: 'row', alignItems: 'center', gap: COUNTER_GAP, marginRight: space.xs },
  counterBtn: { borderWidth: 1.5 },
  counterNum: { ...type.numericSmall, minWidth: 20, textAlign: 'center' },
  // Ends 12 from the card edge, like the counter cluster and the check disc.
  pill: {
    height: COUNTER_BTN, minWidth: PILL_MIN_W, borderRadius: radius.pill, paddingHorizontal: space.sm,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xxs,
    marginRight: space.xs, overflow: 'hidden',
  },
  // 19 bold is WCAG large text (>= 18.66 px bold), so the 3:1 accent fill / onFill pair holds
  // for the digits too (light sky is 4.10:1, under the 4.5 a 16 px count would need).
  pillNum: { ...type.numericSmall, fontSize: 19, lineHeight: 22, fontWeight: '700' },
});
