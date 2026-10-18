import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform, useWindowDimensions } from 'react-native';
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
import { type, numeric, bodyFor } from '../theme/typography';
import { space, radius, size } from '../theme/tokens';

// The sub-line parts joined with " · ", first letter capitalised for the locale: the streak
// strings are lower case so they read naturally after "Done ·" (G-01: "Día completo · racha
// de 12 días") and still start the line in upper case when they come first.
export function joinSubLine(parts, locale) {
  const line = parts.filter(Boolean).join(' · ');
  if (!line) return '';
  const first = String.fromCodePoint(line.codePointAt(0));
  return first.toLocaleUpperCase(locale) + line.slice(first.length);
}

export default function HabitCard({ habit, onIncrement, onDecrement, onNote, onSkipToggle }) {
  const {
    getHabitCount, isHabitDone, isHabitDoneOn, getStreakForHabit, theme, themeName, todayStr,
    isHabitSkippedOn, toggleSkipHabitOn, toggleHabitDoneOn, getNote,
  } = useApp();
  useLocale();
  // Android (this RN build) scales fontSize with the system font scale but not lineHeight, so
  // at 1.3 the descenders of the name and sub-line clip and a two-digit count wraps out of
  // its line box (C-02a m3). iOS and web already scale both. lh() scales the line height to
  // match; at scale 1 it is the token value.
  const { fontScale } = useWindowDimensions();
  const lh = (v) => (Platform.OS === 'android' && fontScale > 1 ? Math.ceil(v * fontScale) : v);
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
  const toggleTimer = () => {
    if (!timerStart) { feedback.toggled(true); setTimerStart(Date.now()); return; }
    const mins = Math.round(elapsedSec / 60);
    setTimerStart(null);
    // A stop that logs minutes gets the increment's feedback (counter.step or habit.done).
    if (mins >= 1) onIncrement(mins);
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
  const menuOptions = [
    { label: skipped ? t('habitCard.longPress.unskip') : t('habitCard.longPress.skip'), onPress: () => { toggleSkipHabitOn(habit.id, today); onSkipToggle?.(habit); } },
    { label: yesterdayDone ? t('habitCard.longPress.undoYesterday') : t('habitCard.longPress.markYesterday'), onPress: () => toggleHabitDoneOn(habit.id, yesterday) },
    ...(onNote ? [{ label: note ? t('habitCard.longPress.editNote') : t('habitCard.longPress.addNote'), onPress: () => onNote(habit, today) }] : []),
  ];

  // Tapping anywhere on the card:
  //   daily  → toggle done/undone
  //   volume → add 1 (ignored when already maxed)
  const handleCardPress = isLimit
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
        accessibilityRole={isVolume ? 'button' : 'checkbox'}
        accessibilityState={isVolume ? undefined : { checked: done }}
        accessibilityLabel={`${habit.name}${isVolume ? `${unitLabel(habit) ? t('habitCard.a11y.countUnit', { count, goal: habit.volumeGoal, unit: unitLabel(habit) }) : t('habitCard.a11y.count', { count, goal: habit.volumeGoal })}${isLimit ? t('habitCard.a11y.maximum') : ''}` : ''}${overLimit ? t('habitCard.a11y.overLimit') : done ? (isQuit ? t('habitCard.a11y.avoided') : t('habitCard.a11y.done')) : skipped ? t('habitCard.a11y.skipped') : t('habitCard.a11y.notDone')}${streak >= 2 ? t('habitCard.a11y.streak', { count: streak }) : ''}`}
        accessibilityHint={t('habitCard.a11y.hint')}
      >
        {/* The icon sits in a neutral 40 px well; the accent lives only in the check (CHK-4/5). */}
        <View style={[styles.well, { backgroundColor: theme.well }]}>
          <HabitIcon habit={habit} size={22} imageStyle={styles.iconImage} textStyle={styles.icon} />
        </View>

        <View style={styles.info}>
          {/* Full `text` contrast in every state: done is carried by the check and tint (CHK-3). */}
          <AppText variant="bodyStrong" style={{ color: theme.text, lineHeight: lh(BODY_LINE) }} numberOfLines={1}>
            {habit.name}
          </AppText>
          {/* Always rendered (schedule fallback). Counter and timer cards have a narrow info
              column beside 3 or 4 controls, so their sub-line may wrap to a second line rather
              than cut the streak off (code review m2). */}
          <Text style={[styles.sub, { color: theme.textSecondary, lineHeight: lh(type.footnote.lineHeight) }]} numberOfLines={isVolume ? 2 : 1}>{subLine}</Text>
        </View>

        {isVolume ? (
          <View style={styles.counter}>
            {/* − is the only way to subtract for volume habits */}
            {isTimed && (
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
            )}
            {/* At 0 the − is disabled: IconButton's disabled variant (a disabledContainer hairline
                and an onDisabled glyph, lighter than the +), still focusable; a tap plays
                `refused`, a long hold opens the options. */}
            <IconButton
              size={COUNTER_BTN}
              icon="remove"
              iconSize={20}
              style={[styles.counterBtn, { borderColor: theme.controlBorder }]}
              onPress={() => onDecrement(step)}
              {...holdForOptions}
              onDisabledLongPress={handleLongPress}
              disabled={count <= 0}
              accessibilityLabel={(step > 1 ? t('habitCard.a11y.removeMany', { count: step, unit: unitLabel(habit) }) : t('habitCard.a11y.removeOne', { unit: unitLabel(habit) })).trim()}
            />

            {/* The count is text (4.5:1): it stays `text` on the done tint; the filled + carries done. */}
            <Text style={[styles.counterNum, { color: overLimit ? theme.dangerText : theme.text, lineHeight: lh(type.numericSmall.lineHeight) }]} numberOfLines={1}>{count}</Text>

            <IconButton
              size={COUNTER_BTN}
              icon="add"
              iconSize={20}
              color={done && !isLimit ? accent.onFill : isLimit ? theme.textSecondary : accent.fill}
              style={[styles.counterBtn, done && !isLimit ? { borderColor: accent.fill, backgroundColor: accent.fill } : { borderColor: isLimit ? theme.controlBorder : accent.ring, backgroundColor: 'transparent' }]}
              onPress={() => onIncrement(step)}
              {...holdForOptions}
              accessibilityLabel={(step > 1 ? t('habitCard.a11y.addMany', { count: step, unit: unitLabel(habit) }) : t('habitCard.a11y.addOne', { unit: unitLabel(habit) })).trim()}
            />
          </View>
        ) : (
          /* Daily and quit: a visual-only check in the fixed 48 dp trailing slot; the whole card
             handles the tap. One done form for every type: the accent disc with the SVG ✓
             (CHK-1; quit no longer draws 🛡). A skipped card's ring goes neutral. */
          <View style={styles.slot}>
            <View
              testID="habit-check"
              style={[
                styles.checkbox,
                { borderColor: done ? accent.fill : skipped ? theme.controlBorder : accent.ring },
                done && { backgroundColor: accent.fill },
              ]}
            >
              {done ? <CheckMark color={accent.onFill} /> : null}
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

// Anatomy (D-00 frame): 16 | 40 well | 12 | info | 48 trailing slot | 4. The well, the info
// column and the slot keep the same x on every card; the 32 check is centred in the slot (12
// from the edge) and the counter cluster ends there too (12).
const WELL = 40;
// bodyStrong's line height on this platform (iOS 22, Android and web 24; typography bodyFor).
const BODY_LINE = bodyFor(Platform.OS).bodyStrong.lineHeight;

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
  checkbox: {
    width: size.checkCircle, height: size.checkCircle, borderRadius: radius.pill,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
  // Ends 12 from the card edge (4 padding + 8), the same right edge as the check disc (D-00).
  counter: { flexDirection: 'row', alignItems: 'center', gap: COUNTER_GAP, marginRight: space.xs },
  counterBtn: { borderWidth: 1.5 },
  counterNum: { ...type.numericSmall, minWidth: 20, textAlign: 'center' },
});
