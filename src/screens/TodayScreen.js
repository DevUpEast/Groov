import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, AppState, Animated,
  Platform, StatusBar, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SafeAreaView from '../components/SafeAreaView';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import HabitCard from '../components/HabitCard';
import EmptyCard from '../components/EmptyCard';
import TodayHeader, { TodayStickyBar, dayLine } from '../components/TodayHeader';
import SectionLabel from '../components/ui/SectionLabel';
import CelebrationOverlay from '../components/CelebrationOverlay';
import CompletionCelebration from '../components/CompletionCelebration';
import TrophyCelebration from '../components/TrophyCelebration';
import ChallengeRewardModal from '../components/ChallengeRewardModal';
import UndoToast from '../components/UndoToast';
import Button from '../components/ui/Button';
import PressableScale from '../components/ui/PressableScale';
import { radius, size, space } from '../theme/tokens';
import { timing, duration } from '../theme/motion';
import NoteModal from '../components/NoteModal';
import HabitDetailSheet from '../components/HabitDetailSheet';
import { routeLeavesTab } from '../utils/links';
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
import { buildWeekBeats } from '../utils/weekBeats';
import { overallDayStatus } from '../utils/streaks';
import { earliestCreatedAt } from '../utils/dayStatus';
import { mockupParams } from '../utils/mockup';

// Today list sections. Habits without a time of day go under "Anytime", which is
// omitted (plain list) when no habit has a time set at all.
const TIME_SECTIONS = ['morning', 'afternoon', 'evening', 'anytime'];
// Ionicons for the time-of-day group labels (no emoji in section headers).
const SECTION_ICONS = { morning: 'sunny-outline', afternoon: 'partly-sunny-outline', evening: 'moon-outline', anytime: 'time-outline' };
const STICKY_H = 48;
// Sample coach text for the web mockup's `?nudge=1` (review shots only; real nudges come from
// the generate-nudge edge function).
const MOCKUP_NUDGE = 'You hit your water goal on 5 of the last 7 days. Try stacking Meditate right after Move this morning: one cue, two habits.';
// A little air under the Android status bar; iOS (and the mockup) start right under it (D-00).
const HEADER_TOP = Platform.OS === 'android' ? space.xs : 0;

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
  const locale = getLocale();
  // Japanese runs the date and weekday together ("10月18日日曜日"); D-00 sets them apart.
  if (/^ja(-|$)/i.test(locale)) {
    return `${d.toLocaleDateString(locale, { month: 'long', day: 'numeric' })} ${d.toLocaleDateString(locale, { weekday: 'long' })}`;
  }
  return d.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' });
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
    setRequestedTab, getNote, setNote, setModalOpen, openRoute, pendingRoute,
    pendingMilestone, clearPendingMilestone,
    moods, setMood,
    themeName, allHabits, getOverallStreak, habitsOnDay, isSnapshotHabitDone, isExcused,
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
  // C-02b (BTN-6): a counter's body tap opens its detail sheet here, over Today, from local
  // state: no pending route and no tab jump. Only the habit id is kept, so the sheet always
  // shows the live habit.
  const [detailHabitId, setDetailHabitId] = useState(null);
  const detailHabit = detailHabitId ? habits.find(h => h.id === detailHabitId) || null : null;
  const openDetail = useCallback((habit) => setDetailHabitId(habit.id), []);
  const closeDetail = useCallback(() => setDetailHabitId(null), []);
  // Edit lives in the Habits form: the sheet has closed (F-05 completion callback), then the
  // same route a deep link uses switches tab and opens the form.
  const editFromDetail = useCallback((habit) => openRoute({ tab: 3, habitId: habit.id, action: 'edit' }), [openRoute]);
  // Lock the pager swipe while the sheet is up, like the Habits screen does.
  useEffect(() => { setModalOpen(!!detailHabitId); }, [detailHabitId]); // eslint-disable-line react-hooks/exhaustive-deps
  // The habit vanished while its sheet was open (deleted elsewhere and pulled in, archived):
  // the sheet has unmounted, so clear its id and release the swipe lock (code review m1).
  useEffect(() => { if (detailHabitId && !detailHabit) setDetailHabitId(null); }, [detailHabitId, detailHabit]);
  // A deep link to another tab drops the sheet so it does not cover the target.
  useEffect(() => { if (routeLeavesTab(pendingRoute, 0)) setDetailHabitId(null); }, [pendingRoute]);

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

  // ── Header (C-04) ──
  // The strip counts like the streak (S-08): a habit skipped today is excused, so it leaves the
  // total unless it was done anyway. Every due habit skipped reads as a rest day. (Freezes only
  // ever cover past days, so today has none to count.)
  const skippedToday = settings.skips?.[today] || [];
  const headerDue = dueHabits.filter(h => !skippedToday.includes(h.id) || isHabitSatisfied(h));
  const completed = headerDue.filter(h => isHabitSatisfied(h)).length;
  const total = headerDue.length;
  // The strip's state: no strip before the first habit; a rest day when nothing is asked today.
  const headerState = habits.length === 0 ? null : total === 0 ? 'rest' : completed >= total ? 'complete' : 'progress';
  const streak = habits.length > 0 ? getOverallStreak() : 0;
  // The 7-day beat row, judged by the same day rules as the streak. Days before the first
  // habit (or the account) are left out.
  const beats = React.useMemo(() => {
    if (!headerState) return [];
    // The later of the account start and the first habit, unlike the streak walk's floor
    // (earliest habit, else the account): starter habits can carry a createdAt far before the
    // account existed (DEFAULT_HABITS), and those days would draw as a row of misses. A backup
    // restore with older habits shows the same short row; the heat map still draws those days.
    const floor = [accountCreatedAt, earliestCreatedAt(allHabits)].filter(Boolean).sort().pop() || null;
    return buildWeekBeats({
      today,
      floor,
      statusOf: (k) => overallDayStatus(k, today, habitsOnDay, isSnapshotHabitDone, isExcused),
      todayState: headerState === 'progress' ? 'open' : headerState,
    });
  }, [headerState, today, accountCreatedAt, allHabits, habitsOnDay, isSnapshotHabitDone, isExcused]);
  const { height: windowHeight } = useWindowDimensions();
  const compactRing = windowHeight < size.ringTodayCompactBelow;
  const greeting = getGreeting(dateOffset);

  // Sticky bar: shown once the strip has scrolled under it. `stripBottom` is the strip's
  // bottom edge in scroll-content coordinates.
  const scrollRef = useRef(null);
  const stripRef = useRef(null);
  const [stripBottom, setStripBottom] = useState(0);
  const [stuck, setStuck] = useState(false);
  const stuckRef = useRef(false);
  const stickyOpacity = useRef(new Animated.Value(0)).current;
  const onScroll = useCallback((e) => {
    const y = e.nativeEvent.contentOffset.y;
    const next = stripBottom > 0 && y > stripBottom - STICKY_H;
    if (next !== stuckRef.current) {
      stuckRef.current = next;
      setStuck(next);
      timing(stickyOpacity, { toValue: next ? 1 : 0, duration: duration.state }).start();
    }
  }, [stripBottom, stickyOpacity]);
  const onStripLayout = useCallback((e) => {
    const { y, height } = e.nativeEvent.layout;
    // The strip sits inside the header block, which starts at the top of the scroll content.
    setStripBottom(HEADER_TOP + y + height);
    // Header budget (plan C-04): the strip's bottom edge as a share of the window height.
    if (__DEV__ || mockupParams.active) {
      stripRef.current?.measureInWindow?.((wx, wy, ww, wh) => {
        // Android measures from below the status bar; the budget counts the status bar too.
        const bottom = Math.round(wy + wh + (Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0));
        const report = { stripBottom: bottom, windowHeight: Math.round(windowHeight), headerPct: Math.round((bottom / windowHeight) * 1000) / 10, compactRing };
        if (__DEV__) console.log('[C-04] header budget', JSON.stringify(report)); // eslint-disable-line no-console
        if (typeof window !== 'undefined' && mockupParams.active) window.__todayHeader = report;
      });
    }
  }, [windowHeight, compactRing]);
  // AI Coach nudge: hidden on day 1, the coach needs prior-day data.
  // The web mockup's `?nudge=1` shows a fixed sample so review shots can include the card.
  const shownNudge = mockupParams.nudge ? MOCKUP_NUDGE : nudgeMessage;
  const nudgeCard = (canShowNudge || mockupParams.nudge) && (nudgeLoading || shownNudge) ? (
    <View style={[styles.nudgeCard, { backgroundColor: theme.brandSurface, borderColor: theme.border }]}>
      <Ionicons name="sparkles-outline" size={18} color={theme.link} style={styles.nudgeIcon} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.nudgeLabel, { color: theme.link }]}>{t('today.coach')}</Text>
        {nudgeLoading && !shownNudge ? (
          <ActivityIndicator size="small" color={theme.link} style={{ marginTop: 4 }} />
        ) : (
          <Text style={[styles.nudgeText, { color: theme.text }]}>{shownNudge}</Text>
        )}
      </View>
    </View>
  ) : null;

  const scrollToTop = useCallback(() => scrollRef.current?.scrollTo?.({ y: 0, animated: true }), []);

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

  // Today's cell in the detail sheet (code review M1): set today's count through the same
  // handlers as a card, so challenge claims / un-claims, the Mark-the-rest queue, the toast,
  // celebrations and feedback all run. "Set 20 (done)" on a timed habit is the manual way to
  // log a session done away from the in-app timer.
  const setTodayFromSheet = useCallback((habit, target) => {
    const delta = target - getHabitCount(habit.id);
    if (delta > 0) handleIncrement(habit, delta);
    else if (delta < 0) handleDecrement(habit, -delta);
  }, [getHabitCount, handleIncrement, handleDecrement]);

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
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <View style={styles.body}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: theme.bg }}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {/* Header: date, greeting, brand strip (C-04) */}
        <View style={styles.header}>
          <TodayHeader
            theme={theme}
            isDark={themeName === 'dark'}
            date={getDateString(dateOffset)}
            greeting={greeting}
            name={displayName || null}
            state={headerState}
            completed={completed}
            total={total}
            streak={streak}
            beats={beats}
            compact={compactRing}
            onStripLayout={onStripLayout}
            stripRef={stripRef}
          />
        </View>

        {/* Habits */}
        <View style={styles.content}>
          {!compactRing && nudgeCard}

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
            <View style={[styles.restCard, { backgroundColor: theme.surface, borderColor: theme.border }]} accessible>
              <Ionicons name="moon-outline" size={22} color={theme.textSecondary} />
              <View style={styles.restText}>
                <Text style={[styles.restTitle, { color: theme.text }]}>{t('today.restDay.title')}</Text>
                <Text style={[styles.restBody, { color: theme.textSecondary }]}>{t('today.restDay.body')}</Text>
              </View>
            </View>
          ) : (
            <>
              {grouped ? grouped.map(section => (
                <View key={section.key}>
                  <SectionLabel icon={SECTION_ICONS[section.key]} label={t(`today.sections.${section.key}`)} theme={theme} style={compactRing && styles.sectionCompact} />
                  {section.habits.map(habit => (
                    <HabitCard
                      key={habit.id}
                      habit={habit}
                      onIncrement={(a) => handleIncrement(habit, a)}
                      onDecrement={(a) => handleDecrement(habit, a)}
                      onNote={openNote}
                      onSkipToggle={handleSkipToggle}
                      onOpenDetail={openDetail}
                    />
                  ))}
                </View>
              )) : <View style={styles.plainList}>{dueHabits.map(habit => (
                <HabitCard
                  key={habit.id}
                  habit={habit}
                  onIncrement={(a) => handleIncrement(habit, a)}
                  onDecrement={(a) => handleDecrement(habit, a)}
                  onNote={openNote}
                  onSkipToggle={handleSkipToggle}
                  onOpenDetail={openDetail}
                />
              ))}</View>}
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

          {/* Short windows (SE): the nudge goes under the list so the first cards stay above the tab bar. */}
          {compactRing && nudgeCard}

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

      {/* Collapsed header (DEP-5): fades in once the strip has scrolled under it. */}
      <Animated.View
        style={[styles.stickyLayer, { opacity: stickyOpacity, pointerEvents: stuck ? 'box-none' : 'none' }]}
        aria-hidden={!stuck}
        accessibilityElementsHidden={!stuck}
        importantForAccessibility={stuck ? 'auto' : 'no-hide-descendants'}
      >
        <TodayStickyBar
          theme={theme}
          state={headerState}
          completed={completed}
          total={total}
          greeting={greeting}
          streak={streak}
          onPress={scrollToTop}
          a11yLabel={headerState ? (headerState === 'progress' ? t('today.ring.a11y', { completed, total }) : dayLine({ state: headerState, completed, total, streak })) : undefined}
        />
      </Animated.View>
      </View>

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

      <HabitDetailSheet habit={detailHabit} onClose={closeDetail} onEdit={editFromDetail} onSetToday={setTodayFromSheet} />

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
  body: { flex: 1 },
  header: { paddingHorizontal: space.gutter, paddingTop: HEADER_TOP },
  content: { paddingHorizontal: space.gutter },
  plainList: { marginTop: space.md },
  // Short windows (SE): 16 between groups instead of 24, so a third time-of-day group still
  // leaves the fourth card above the tab bar.
  sectionCompact: { marginTop: space.sectionCompact },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase',
  },
  stickyLayer: { position: 'absolute', top: 0, left: 0, right: 0, height: STICKY_H },
  restCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: space.sm,
    borderWidth: 1, borderRadius: radius.card, padding: space.md, marginTop: space.lg,
  },
  restText: { flex: 1 },
  restTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  restBody: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  markRestBtn: { alignSelf: 'center', minHeight: 48, borderRadius: radius.control, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, marginTop: 4 },
  markRestText: { fontSize: 15, fontWeight: '700' },
  markRestNote: { fontSize: 13, marginTop: 2, textAlign: 'center' },
  nudgeCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderWidth: 1, borderRadius: 14, padding: 14, marginTop: space.md,
  },
  nudgeIcon: { marginTop: 1 },
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
