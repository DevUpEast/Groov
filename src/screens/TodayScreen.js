import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, AppState,
} from 'react-native';
import SafeAreaView from '../components/SafeAreaView';
import Svg, { Path, Rect } from 'react-native-svg';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import HabitCard from '../components/HabitCard';
import EmptyCard from '../components/EmptyCard';
import ProgressRing from '../components/ProgressRing';
import CelebrationOverlay from '../components/CelebrationOverlay';
import CompletionCelebration from '../components/CompletionCelebration';
import TrophyCelebration from '../components/TrophyCelebration';
import ChallengeRewardModal from '../components/ChallengeRewardModal';
import UndoToast from '../components/UndoToast';
import Button from '../components/ui/Button';
import PressableScale from '../components/ui/PressableScale';
import { radius } from '../theme/tokens';
import NoteModal from '../components/NoteModal';
import MoodCheckIn from '../components/MoodCheckIn';
import { isGoalMet, usesCounter, countAfterIncrement, markRestLeavesOutCounters } from '../utils/habits';
import feedback, { EVENTS } from '../services/feedback';
import { fetchDailyNudge } from '../services/aiCoaching';
import { localDateKey, parseDateKey } from '../utils/dates';
import { maybeRequestReview } from '../services/review';
import {
  currentChallengeDay, isChallengeExpired, getRelevantHabits,
  planChallengeClaims, routeClaims, cancelQueuedForHabit, planFlush, endMarkRestWindow,
} from '../utils/challenges';
import { t, getLocale, useLocale } from '../i18n';

// Today list sections. Habits without a time of day go under "Anytime", which is
// omitted (plain list) when no habit has a time set at all.
const TIME_SECTIONS = ['morning', 'afternoon', 'evening', 'anytime'];

function SproutIcon({ size = 24, color }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      {/* Stem — drawn first so leaves sit on top */}
      <Rect x="9.25" y="3" width="1.5" height="16" rx="0.75" fill={color} />
      {/* Left leaf — branches off the left side of the stem, curves up-left to a point */}
      <Path d="M 10 13 C 5 12 1 8 3 5 C 5 3 9 5 10 9 Z" fill={color} />
      {/* Right leaf — mirror image, branches right and curves up-right */}
      <Path d="M 10 13 C 15 12 19 8 17 5 C 15 3 11 5 10 9 Z" fill={color} />
    </Svg>
  );
}

function getGreeting(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const h = d.getHours();
  if (h < 12) return t('today.greeting.morning');
  if (h < 17) return t('today.greeting.afternoon');
  return t('today.greeting.evening');
}

function getDateString(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString(getLocale(), { weekday: 'long', month: 'long', day: 'numeric' });
}

// How long the "Mark the rest done" toast (and its Undo) stays up. A challenge that
// Mark the rest would complete waits for this window before it is archived.
const MARK_REST_UNDO_MS = 8000;

export default function TodayScreen() {
  const {
    habits, dueHabits, challenges, effectiveChallenges, completions, getCompletedCount, isAllDone,
    incrementHabit, decrementHabit, isHabitSatisfied,
    isChallengeHabitsDone, settings, theme, markChallengeDay, unmarkChallengeDay,
    getHabitCount, dateOffset, todayStr, accountCreatedAt, displayName, devMode,
    completeChallengeImmediately, markRestDone, planMarkRest, restoreHabitCounts,
    isHabitSatisfiedWith, getTodayCompletions,
    pendingChallengeRewards, clearPendingChallengeRewards,
    setRequestedTab, getNote, setNote,
    pendingMilestone, clearPendingMilestone,
    moods, setMood,
  } = useApp();
  useLocale();

  // Big celebration only for streak milestones; a perfect day gets a light cheer.
  const [milestoneShown, setMilestoneShown] = useState(null);
  useEffect(() => {
    if (!pendingMilestone) return;
    const t = setTimeout(() => {
      setMilestoneShown(pendingMilestone);
      setFullCelebration(true);
      feedback.play(EVENTS.milestone);
      clearPendingMilestone();
    }, 900);
    return () => clearTimeout(t);
  }, [pendingMilestone]); // eslint-disable-line react-hooks/exhaustive-deps

  const [toast, setToast] = useState(null);
  const [noteTarget, setNoteTarget] = useState(null);

  const openNote = useCallback((habit, key) => {
    setNoteTarget({
      habitId: habit.id, habitName: habit.name, key,
      note: getNote(habit.id, key),
      dateLabel: parseDateKey(key).toLocaleDateString(getLocale(), { weekday: 'short', month: 'short', day: 'numeric' }),
    });
  }, [getNote]);

  const grouped = React.useMemo(() => {
    const anyTimed = dueHabits.some(h => h.timeOfDay && h.timeOfDay !== 'anytime');
    if (!anyTimed) return null;
    return TIME_SECTIONS
      .map(key => ({ key, habits: dueHabits.filter(h => (h.timeOfDay || 'anytime') === key) }))
      .filter(s => s.habits.length > 0);
  }, [dueHabits]);
  const { user } = useAuth();

  const [celebrating, setCelebrating] = useState(false);
  const [fullCelebration, setFullCelebration] = useState(false);
  const [trophyCelebrating, setTrophyCelebrating] = useState(false);
  const [rewardModalVisible, setRewardModalVisible] = useState(false);
  const [rewardsToShow, setRewardsToShow] = useState([]);
  const rewardModalShown = useRef(false);
  const allDoneCelebrated = useRef(false);
  // Feedback still pending from the last check-off (day.complete at +750, challenge.claimed at
  // +250). An un-check cancels them (§4.1): a day that is no longer complete gets no Success.
  const pendingFeedback = useRef([]);
  const cancelPendingFeedback = () => { pendingFeedback.current.forEach(h => h.cancel()); pendingFeedback.current = []; };
  // Only the latest few matter (they expire within ~1 s); keep the list bounded.
  const keepPending = (h) => { pendingFeedback.current = [...pendingFeedback.current.slice(-3), h]; };

  const [nudgeMessage, setNudgeMessage] = useState(null);
  const [nudgeLoading, setNudgeLoading] = useState(false);
  const nudgeFetched = useRef(false);

  // Reset the "already celebrated today" flag whenever the date rolls over
  const today = todayStr();
  useEffect(() => {
    allDoneCelebrated.current = false;
  }, [today]);

  // Show challenge reward popup once per session when pending rewards exist.
  // Delayed 600ms so AppContext's load-time archiving effect can finish first.
  useEffect(() => {
    if (rewardModalShown.current) return;
    if (pendingChallengeRewards.length === 0) return;
    rewardModalShown.current = true;
    const t = setTimeout(() => {
      setRewardsToShow([...pendingChallengeRewards]);
      setRewardModalVisible(true);
    }, 600);
    return () => clearTimeout(t);
  }, [pendingChallengeRewards]); // eslint-disable-line react-hooks/exhaustive-deps

  // Number of complete days that have passed since account creation (0 on day 1).
  // Only whole days before today count — today's data is still in flux.
  const accountAgeDays = accountCreatedAt
    ? Math.round((Date.parse(today) - Date.parse(accountCreatedAt)) / 86400000)
    : 0;
  const canShowNudge = accountAgeDays >= 1;

  // In dev mode the AI coach follows the simulated date offset; otherwise it always
  // gets the real local date.
  const coachToday = devMode ? today : localDateKey();

  // Fetch daily nudge once when habits are available, but only from day 2 onwards
  // so the coach always works from at least one full day of completed history.
  // Requires an authenticated session — skip silently if not logged in.
  useEffect(() => {
    if (!user || habits.length === 0 || nudgeFetched.current || !canShowNudge) return;
    nudgeFetched.current = true;
    setNudgeLoading(true);
    fetchDailyNudge(accountCreatedAt, displayName, coachToday)
      .then((data) => { if (data?.message) setNudgeMessage(data.message); })
      .catch(() => {})
      .finally(() => setNudgeLoading(false));
  }, [user, habits.length, canShowNudge]); // eslint-disable-line react-hooks/exhaustive-deps

  // The smart evening check-in is scheduled from AppContext (real date, not the dev offset).
  const allDone = isAllDone();

  const completed = getCompletedCount();
  const total = dueHabits.length;
  const progress = total > 0 ? completed / total : 0;

  // Completions queued by "Mark the rest done": { challengeId, claimedAt, token }.
  // They run when that action's toast hides (or the app backgrounds / the screen
  // unmounts), so Undo can still take the claim back before anything is archived.
  const queueRef = useRef([]);
  // Latest state for the deferred flush, which may run from a stale closure
  // (AppState listener, unmount cleanup).
  const latest = useRef({});
  latest.current = { challenges, effectiveChallenges, completeChallengeImmediately };

  // Claim (and complete) challenges after an action. `countsOverride` is today's
  // map *after* the action, so the decision never waits for React to apply it.
  // With `defer`, a completing claim only marks the day and is queued under `token`
  // with the day it was claimed on. Returns { claimedIds, completingIds, completedNowIds }.
  const autoClaimChallenges = useCallback((countsOverride, { defer = false, token = null } = {}) => {
    const today = todayStr();
    // Use effectiveChallenges so completedDays are filtered to <= today (the raw list
    // keeps future-dated entries when the dev date offset is rewound); activeIds skips
    // any "reverted" challenge that now lives in pastChallenges.
    const plan = planChallengeClaims({
      challenges: effectiveChallenges,
      activeIds: challenges.map(c => c.id),
      dueHabits,
      today,
      isSatisfied: countsOverride ? (h) => isHabitSatisfiedWith(h, countsOverride) : isHabitSatisfied,
    });
    const { markIds, completeNowIds, queueIds } = routeClaims(plan, defer);
    markIds.forEach(id => markChallengeDay(id));
    completeNowIds.forEach(id => completeChallengeImmediately(id));
    queueIds.forEach(id => queueRef.current.push({ challengeId: id, claimedAt: Date.now(), token, dayKey: today }));
    return { ...plan, completedNowIds: completeNowIds };
  }, [effectiveChallenges, challenges, dueHabits, isHabitSatisfied, isHabitSatisfiedWith, markChallengeDay, completeChallengeImmediately, todayStr]);

  // Run the queued completions (all of them, or only those of one toast), re-reading
  // current state: a challenge that is gone (archived by the expiry effect, completed
  // on another device) or no longer has every day is skipped. Trophy after the flush.
  const flushQueued = useCallback((token) => {
    const due = token === undefined ? queueRef.current : queueRef.current.filter(i => i.token === token);
    if (due.length === 0) return;
    queueRef.current = queueRef.current.filter(i => !due.includes(i));
    const { challenges: active, effectiveChallenges: eff, completeChallengeImmediately: complete } = latest.current;
    const ids = planFlush(due, eff.filter(ch => active.some(c => c.id === ch.id)));
    ids.forEach(id => complete(id, due.find(i => i.challengeId === id)?.dayKey));
    // The trophy screen plays its own feedback (haptic + fanfare) when it appears.
    if (ids.length > 0) setTrophyCelebrating(true);
  }, []);

  useEffect(() => {
    // Backgrounding ends the undo window: hiding the Mark-the-rest toast flushes its
    // token (prevToast effect below); flushQueued() covers anything else still queued.
    // The cleanup runs only when AppProvider remounts (sign-out, account switch): Today
    // never unmounts inside the pager.
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'background') return;
      setToast(endMarkRestWindow);
      flushQueued();
    });
    return () => { sub.remove(); flushQueued(); };
  }, [flushQueued]);

  // The Mark-the-rest toast hid (timeout, or replaced by another toast): its window closed.
  const prevToast = useRef(null);
  useEffect(() => {
    const prev = prevToast.current;
    prevToast.current = toast;
    if (prev && prev !== toast && prev.kind === 'markRest') flushQueued(prev.id);
  }, [toast, flushQueued]);

  // A linked habit was un-marked or skipped inside the window: its queued completion is
  // cancelled. With `unmark`, the cancelled challenges' day is un-marked here too.
  const cancelQueuedFor = useCallback((habitId, unmark) => {
    if (queueRef.current.length === 0) return;
    const { queue, cancelledIds } = cancelQueuedForHabit(queueRef.current, habitId, challenges, dueHabits);
    queueRef.current = queue;
    if (unmark) cancelledIds.forEach(id => { if (challenges.some(c => c.id === id)) unmarkChallengeDay(id); });
  }, [challenges, dueHabits, unmarkChallengeDay]);

  const handleIncrement = useCallback((habit, amount = 1) => {
    const before = getHabitCount(habit.id);
    const after = { ...getTodayCompletions(), [habit.id]: countAfterIncrement(habit, before, amount) };
    const justCompleted = incrementHabit(habit.id, amount);
    if (justCompleted === false && !usesCounter(habit) && before >= 1) return; // already checked
    const over = habit.type === 'atMost' && before + amount > habit.volumeGoal;
    setToast({ id: Date.now(), habit, amount, message: justCompleted ? (habit.type === 'quit' ? t('today.toast.avoided', { name: habit.name }) : t('today.toast.done', { name: habit.name })) : over ? t('today.toast.overLimit', { name: habit.name }) : t('today.toast.plus', { name: habit.name, amount }) });
    // Same frame as the visual change, never awaited (HAP-4). The note climbs the §2.11 ladder:
    // a counter by its step toward the goal, a daily habit by how many are done today. An
    // atMost limit gets a flat tick, and no sound on the tap that breaks it.
    const tone = usesCounter(habit)
      ? { step: after[habit.id], goal: habit.volumeGoal, atMost: habit.type === 'atMost' }
      : { n: dueHabits.filter(h => isHabitSatisfiedWith(h, after)).length };
    feedback.play(justCompleted ? EVENTS.habitDone : EVENTS.counterStep, { tone });

    if (justCompleted) {
      // Judge everything against the counts after this check-off.
      const willAllBeDone = dueHabits.every(h => isHabitSatisfiedWith(h, after));

      // A single check-off completes a challenge immediately, with its trophy.
      const { claimedIds, completedNowIds } = autoClaimChallenges(after);
      const anyComplete = completedNowIds.length > 0;
      // challenge.claimed lands on its beat (+250 ms); a completed challenge gets the trophy
      // screen, which plays its own feedback.
      if (claimedIds.length > 0 && !anyComplete) keepPending(feedback.play(EVENTS.challengeClaimed));
      if (anyComplete) setTimeout(() => setTrophyCelebrating(true), 100);

      if (willAllBeDone && !allDoneCelebrated.current) {
        allDoneCelebrated.current = true;
        keepPending(feedback.play(EVENTS.dayComplete));
        setCelebrating(true);
      }
    }
  }, [dueHabits, isHabitSatisfiedWith, autoClaimChallenges, incrementHabit, getHabitCount, getTodayCompletions]);

  // `undo`: the toast Undo, which always reads as an un-check.
  const handleDecrement = useCallback((habit, amount = 1, { undo = false } = {}) => {
    const today = todayStr();
    const countBefore = getHabitCount(habit.id);
    const habitWasDone = isGoalMet(habit, countBefore);
    const habitStillDone = isGoalMet(habit, Math.max(0, countBefore - (amount || 1)));

    decrementHabit(habit.id, amount || 1);
    if (undo || (habitWasDone && !habitStillDone)) {
      cancelPendingFeedback();
      feedback.play(EVENTS.habitUndone);
    } else {
      // A −1 that leaves the habit's done state alone: the tick only, never the rising step chime.
      feedback.play(EVENTS.counterStep, { sound: false });
    }
    allDoneCelebrated.current = false;

    // Only unmark challenge days when this habit transitions from done → not done
    if (habitWasDone && !habitStillDone) {
      // Any queued Mark-the-rest completion watching this habit is cancelled; its day
      // is un-marked by the loop below.
      cancelQueuedFor(habit.id, false);
      effectiveChallenges.forEach(ch => {
        if (!challenges.some(c => c.id === ch.id)) return;
        if (!ch.completedDays.includes(today)) return;
        const relevant = getRelevantHabits(ch, dueHabits);
        if (relevant.some(h => h.id === habit.id)) {
          unmarkChallengeDay(ch.id);
        }
      });
    }
  }, [decrementHabit, effectiveChallenges, challenges, dueHabits, getHabitCount, unmarkChallengeDay, todayStr, cancelQueuedFor]);

  // Skipping (or un-skipping) a linked habit inside the window cancels the queued
  // completion and un-marks that challenge's day.
  const handleSkipToggle = useCallback((habit) => {
    cancelQueuedFor(habit.id, true);
  }, [cancelQueuedFor]);

  // Untouched daily/quit habits the button would mark ("Mark the rest done (N)").
  const markRestCount = planMarkRest().changedIds.length;
  const markRestPartial = markRestCount > 0
    && markRestLeavesOutCounters(dueHabits, settings.skips?.[today] || [], isHabitSatisfied);

  const handleMarkRest = useCallback(() => {
    const id = Date.now();
    const dayKey = todayStr();
    const plan = markRestDone();
    if (plan.changedIds.length === 0) return;
    // Completion is deferred until the undo window closes (S-02).
    const { claimedIds } = autoClaimChallenges(plan.next, { defer: true, token: id });
    setToast({
      id, kind: 'markRest', dayKey, before: plan.before, changedIds: plan.changedIds, claimedIds, duration: MARK_REST_UNDO_MS,
      message: t('today.toast.markedRest', { count: plan.changedIds.length }),
    });
    // One markRest haptic (now) and one chord (at 750) for the whole batch; no separate
    // day.complete haptic. Undo cancels a chord that has not played yet.
    keepPending(feedback.play(EVENTS.markRest));
    if (claimedIds.length > 0) keepPending(feedback.play(EVENTS.challengeClaimed));
    // Celebrate only when the day is truly complete: counters may still be open.
    const allNow = dueHabits.length > 0 && dueHabits.every(h => isHabitSatisfiedWith(h, plan.next));
    if (allNow && !allDoneCelebrated.current) {
      allDoneCelebrated.current = true;
      setCelebrating(true);
    }
  }, [markRestDone, autoClaimChallenges, dueHabits, isHabitSatisfiedWith, todayStr]);

  // Undo for Mark the rest, on the day the action ran (tst.dayKey): drop its queued
  // completions, revert the habits it marked that are still at 1, and un-mark exactly
  // the challenge days it claimed.
  const undoMarkRest = useCallback((tst) => {
    queueRef.current = queueRef.current.filter(i => i.token !== tst.id);
    cancelPendingFeedback();
    feedback.play(EVENTS.habitUndone);
    restoreHabitCounts(tst.before, tst.changedIds, tst.dayKey);
    tst.claimedIds.forEach(id => unmarkChallengeDay(id, tst.dayKey));
    allDoneCelebrated.current = false;
  }, [restoreHabitCounts, unmarkChallengeDay]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safe, { backgroundColor: theme.action }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: theme.bg }}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.action, shadowColor: theme.shadow }]}>
          <View style={styles.greetingRow}>
            <Text style={[styles.greeting, { color: theme.onAction }]}>
              {displayName ? t('today.greeting.withName', { greeting: getGreeting(dateOffset), name: displayName }) : getGreeting(dateOffset)}
            </Text>
            <SproutIcon size={26} color={theme.sprout} />
          </View>
          <Text style={[styles.date, { color: theme.onActionSecondary }]}>{getDateString(dateOffset)}</Text>

          <View style={styles.ringRow} accessible={true} accessibilityLabel={t('today.ring.a11y', { completed, total })}>
            <ProgressRing
              progress={progress}
              size={110}
              strokeWidth={10}
              color={theme.onAction}
              bg={theme.actionTrack}
              label={`${completed}/${total}`}
              sublabel={t('today.ring.habits')}
              sublabelColor={theme.onActionSecondary}
            />
            <View style={styles.ringLabels}>
              <Text style={[styles.ringTitle, { color: theme.onAction }]}>
                {allDone ? t('today.ring.allDone') : t('today.ring.remaining', { count: total - completed })}
              </Text>
              <Text style={[styles.ringSubtitle, { color: theme.onActionSecondary }]}>
                {allDone
                  ? t('today.ring.amazing')
                  : t('today.ring.keepGoing', { percent: Math.round(progress * 100) })}
              </Text>
            </View>
          </View>
        </View>

        {/* Habits */}
        <View style={styles.content}>
          {/* AI Coach Nudge — hidden on day 1; coach needs prior-day data */}
          {canShowNudge && (nudgeLoading || nudgeMessage) && (
            <View style={[styles.nudgeCard, { backgroundColor: theme.brandSurface, borderColor: theme.border }]}>
              <Text style={styles.nudgeEmoji}>✨</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.nudgeLabel, { color: theme.link }]}>{t('today.coach')}</Text>
                {nudgeLoading ? (
                  <ActivityIndicator size="small" color={theme.link} style={{ marginTop: 4 }} />
                ) : (
                  <Text style={[styles.nudgeText, { color: theme.text }]}>{nudgeMessage}</Text>
                )}
              </View>
            </View>
          )}

          {habits.length === 0 ? (
            <>
              <EmptyCard
                emoji="🌱"
                title={t('today.empty.title')}
                body={t('today.empty.body')}
                theme={theme}
                style={{ backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }}
              >
                <Button
                  block
                  icon="add"
                  style={[styles.addHabitBtn, { shadowColor: theme.shadow }]}
                  onPress={() => setRequestedTab(3)}
                  accessibilityLabel={t('today.empty.addA11y')}
                />
              </EmptyCard>
              {effectiveChallenges.length === 0 && (
                <TouchableOpacity
                  style={[styles.challengeEmptyRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => setRequestedTab(2)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={t('today.noChallenges.a11y')}
                >
                  <Text style={styles.challengeEmptyIcon}>🏆</Text>
                  <View style={styles.challengeEmptyText}>
                    <Text style={[styles.challengeEmptyTitle, { color: theme.text }]}>{t('today.noChallenges.title')}</Text>
                    <Text style={[styles.challengeEmptyBody, { color: theme.textSecondary }]}>{t('today.noChallenges.body')}</Text>
                  </View>
                </TouchableOpacity>
              )}
            </>
          ) : dueHabits.length === 0 ? (
            <EmptyCard
              emoji="🛋️"
              title={t('today.restDay.title')}
              body={t('today.restDay.body')}
              theme={theme}
              style={{ backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, marginTop: 0 }}
            />
          ) : (
            <>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>{t('today.sectionHabits')}</Text>
              </View>
              {grouped ? grouped.map(section => (
                <View key={section.key}>
                  <Text style={[styles.timeLabel, { color: theme.textSecondary }]}>{t(`today.sections.${section.key}`)}</Text>
                  {section.habits.map(habit => (
                    <HabitCard
                      key={habit.id}
                      habit={habit}
                      onIncrement={(a) => handleIncrement(habit, a)}
                      onDecrement={(a) => handleDecrement(habit, a)}
                      onNote={openNote}
                      onSkipToggle={handleSkipToggle}
                    />
                  ))}
                </View>
              )) : dueHabits.map(habit => (
                <HabitCard
                  key={habit.id}
                  habit={habit}
                  onIncrement={(a) => handleIncrement(habit, a)}
                  onDecrement={(a) => handleDecrement(habit, a)}
                  onNote={openNote}
                  onSkipToggle={handleSkipToggle}
                />
              ))}
              {markRestCount > 0 && (
                <PressableScale
                  onPress={handleMarkRest}
                  style={styles.markRestBtn}
                  accessibilityRole="button"
                >
                  <Text style={[styles.markRestText, { color: theme.link }]}>
                    {t('today.markRest', { count: markRestCount })}
                  </Text>
                  {/* Counters, timers and limits are never bulk-marked, so say why the count is lower than "N remaining". It sits inside the button, so screen readers read it with the label. */}
                  {markRestPartial && (
                    <Text style={[styles.markRestNote, { color: theme.textSecondary }]}>{t('today.markRestNote')}</Text>
                  )}
                </PressableScale>
              )}
            </>
          )}

          {habits.length > 0 && (
            <MoodCheckIn value={moods[today] ?? null} onChange={(v) => setMood(today, v)} theme={theme} />
          )}

          {/* Active Challenges */}
          {effectiveChallenges.filter(ch => !isChallengeExpired(ch, today)).length > 0 && (
            <View style={styles.challengesSection}>
              <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>{t('today.activeChallenges')}</Text>
              {effectiveChallenges
                .filter(ch => !isChallengeExpired(ch, today))
                .map(ch => {
                  const completedCount = ch.completedDays.length;
                  const todayDone = ch.completedDays.includes(today);
                  const progress = ch.days > 0 ? completedCount / ch.days : 0;
                  const currentDay = currentChallengeDay(ch, today);
                  return (
                    <View
                      key={ch.id}
                      style={[styles.challengeMini, { backgroundColor: theme.surface, borderColor: theme.border }]}
                      accessible={true}
                      accessibilityLabel={t(todayDone ? 'today.challenge.a11yDone' : 'today.challenge.a11yPending', { name: ch.name, day: currentDay, days: ch.days })}
                    >
                      <View style={styles.challengeMiniRow}>
                        <Text style={styles.challengeMiniIcon}>{ch.icon || '🏆'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.challengeMiniName, { color: theme.text }]} numberOfLines={1}>{ch.name}</Text>
                          <Text style={[styles.challengeMiniSub, { color: theme.textSecondary }]}>
                            {t('today.challenge.sub', { day: currentDay, days: ch.days, count: completedCount })}
                          </Text>
                        </View>
                        {todayDone
                          ? <Text style={[styles.challengeMiniStatus, { color: theme.success }]}>{t('today.challenge.done')}</Text>
                          : <Text style={[styles.challengeMiniStatus, { color: theme.textSecondary }]}>{t('today.challenge.pending')}</Text>
                        }
                      </View>
                      <View style={[styles.challengeMiniProgressBg, { backgroundColor: theme.track }]}>
                        <View style={[styles.challengeMiniProgressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: theme.meter }]} />
                      </View>
                    </View>
                  );
                })}
            </View>
          )}
        </View>
      </ScrollView>

      <UndoToast
        toast={toast}
        theme={theme}
        onHide={() => setToast(null)}
        onUndo={() => {
          const tst = toast;
          if (tst?.kind === 'markRest') { undoMarkRest(tst); setToast(null); return; }
          const h = tst?.habit; const a = tst?.amount || 1; setToast(null); if (h) handleDecrement(h, a, { undo: true });
        }}
      />

      <NoteModal
        target={noteTarget}
        theme={theme}
        onClose={() => setNoteTarget(null)}
        onSave={(text) => { setNote(noteTarget.habitId, noteTarget.key, text); setNoteTarget(null); }}
      />

      <CelebrationOverlay
        visible={celebrating}
        onDone={() => setCelebrating(false)}
      />

      <CompletionCelebration
        visible={fullCelebration}
        onDone={() => {
          setFullCelebration(false);
          // A milestone is a signature moment: the one time we may ask for a rating.
          if (milestoneShown) setTimeout(() => maybeRequestReview(`milestone-${milestoneShown.days}`), 800);
          setMilestoneShown(null);
        }}
        primaryColor={theme.action}
        emoji={milestoneShown?.emoji ?? '🎉'}
        title={milestoneShown ? t('today.milestone.title', { days: milestoneShown.days }) : t('today.congrats')}
        subtitle={milestoneShown ? t('today.milestone.subtitle', { label: milestoneShown.label }) : t('today.allTasks')}
      />

      <TrophyCelebration
        visible={trophyCelebrating}
        onDone={() => { setTrophyCelebrating(false); setTimeout(() => maybeRequestReview('challenge-complete'), 800); }}
        theme={theme}
      />

      {rewardModalVisible && (
        <ChallengeRewardModal
          challenges={rewardsToShow}
          onDismiss={() => {
            setRewardModalVisible(false);
            clearPendingChallengeRewards();
          }}
          theme={theme}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingBottom: 32 },
  header: {
    padding: 24,
    paddingTop: 16,
    paddingBottom: 32,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  greetingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  greeting: { fontSize: 22, fontWeight: 'bold' },
  date: { fontSize: 13, marginTop: 2, marginBottom: 20 },
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  ringLabels: { flex: 1 },
  ringTitle: { fontSize: 18, fontWeight: 'bold' },
  ringSubtitle: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  content: { padding: 20 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase',
  },
  markRestBtn: { alignSelf: 'center', minHeight: 48, borderRadius: radius.control, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, marginTop: 4 },
  markRestText: { fontSize: 15, fontWeight: '700' },
  markRestNote: { fontSize: 13, marginTop: 2, textAlign: 'center' },
  timeLabel: { fontSize: 12, fontWeight: '700', marginTop: 6, marginBottom: 8 },
  nudgeCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 16,
  },
  nudgeEmoji: { fontSize: 18, marginTop: 1 },
  nudgeLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  nudgeText: { fontSize: 13, lineHeight: 20 },
  empty: {
    borderWidth: 2, borderStyle: 'dashed', borderRadius: 16,
    padding: 36, alignItems: 'center', marginTop: 24,
  },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  // Button (block, primary) gives the fill, radius and 48 min height; this adds the lift.
  addHabitBtn: {
    marginTop: 8,
    minHeight: 56,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  challengeEmptyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 16, borderWidth: 1, padding: 16, marginTop: 20,
  },
  challengeEmptyIcon: { fontSize: 28 },
  challengeEmptyText: { flex: 1 },
  challengeEmptyTitle: { fontSize: 15, fontWeight: '700' },
  challengeEmptyBody: { fontSize: 12, marginTop: 2 },
  challengesSection: { marginTop: 24 },
  challengeMini: {
    borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 8,
  },
  challengeMiniRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  challengeMiniIcon: { fontSize: 24 },
  challengeMiniName: { fontSize: 14, fontWeight: '700' },
  challengeMiniSub: { fontSize: 12, marginTop: 1 },
  challengeMiniStatus: { fontSize: 13, fontWeight: '600' },
  challengeMiniProgressBg: { height: 5, borderRadius: 3, overflow: 'hidden' },
  challengeMiniProgressFill: { height: 5, borderRadius: 3 },
});
