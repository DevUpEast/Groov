import React, { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, AppState, Animated,
  Platform, StatusBar, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SafeAreaView from '../components/SafeAreaView';
import { useApp, STREAK_MILESTONES, SMALL_MILESTONES } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import HabitCard from '../components/HabitCard';
import EmptyCard from '../components/EmptyCard';
import TodayHeader, { TodayStickyBar, dayLine } from '../components/TodayHeader';
import SectionLabel from '../components/ui/SectionLabel';
import CreditFlight from '../components/CreditFlight';
import RingBurst from '../components/RingBurst';
import CompletionCelebration from '../components/CompletionCelebration';
import TrophyCelebration from '../components/TrophyCelebration';
import ChallengeRewardModal from '../components/ChallengeRewardModal';
import ShareCards from '../components/ShareCards';
import UndoToast from '../components/UndoToast';
import Button from '../components/ui/Button';
import PressableScale from '../components/ui/PressableScale';
import Dialog from '../components/ui/Dialog';
import { radius, size, space } from '../theme/tokens';
import { timing, duration, beat as beats, celebration } from '../theme/motion';
import NoteModal from '../components/NoteModal';
import HabitDetailSheet from '../components/HabitDetailSheet';
import { routeLeavesTab } from '../utils/links';
import MoodCheckIn from '../components/MoodCheckIn';
import { isGoalMet, usesCounter, countAfterIncrement, markRestLeavesOutCounters } from '../utils/habits';
import feedback, { EVENTS, logMark } from '../services/feedback';
import { frameLogOn } from '../hooks/useTween';
import { fetchDailyNudge } from '../services/aiCoaching';
import { localDateKey, parseDateKey, addDays } from '../utils/dates';
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
import { announce } from '../utils/a11y';
import useCheckoffMoment from '../hooks/useCheckoffMoment';
import { KINDS as BEAT, ladderIndex, MOMENT_MS } from '../utils/beats';
import { useTabActive } from '../utils/tabScope';
import useCelebrationQueue from '../hooks/useCelebrationQueue';
import { useDevFlag } from '../utils/devFlags';
import { useDeviceSettings } from '../utils/deviceSettings';
import { type as typeScale } from '../theme/typography';
import { shouldShowLongPressHint, hintSeen } from '../utils/hints';

// Today list sections. Habits without a time of day go under "Anytime", which is
// omitted (plain list) when no habit has a time set at all.
const TIME_SECTIONS = ['morning', 'afternoon', 'evening', 'anytime'];
// Ionicons for the time-of-day group labels (no emoji in section headers).
const SECTION_ICONS = { morning: 'sunny-outline', afternoon: 'partly-sunny-outline', evening: 'moon-outline', anytime: 'time-outline' };
const STICKY_H = 48;
// Sample coach text for the web mockup's `?nudge=1` (review shots only; real nudges come from
// the generate-nudge edge function).
const MOCKUP_NUDGE = 'You hit your water goal on 5 of the last 7 days. Try stacking Meditate right after Move this morning: one cue, two habits.';
// Sample challenges for the web mockup's `?challenges=<n>` (review shots of 1, 2 and 3+ chips;
// nothing is stored). Real active challenges come first; samples fill up to n.
const MOCKUP_CHALLENGES = [
  { id: 'mock-reset', name: '7-Day Reset', day: 4, days: 7, done: true },
  { id: 'mock-builder', name: '21-Day Habit Builder', day: 9, days: 21, done: false },
  { id: 'mock-30', name: '30-Day Challenge', day: 15, days: 30, done: false },
];
function padMockupChallenges(live, n) {
  return [...live, ...MOCKUP_CHALLENGES].slice(0, Math.max(0, n));
}
// A little air under the Android status bar; iOS (and the mockup) start right under it (D-00).
const HEADER_TOP = Platform.OS === 'android' ? space.xs : 0;

// What a screen reader hears when today's count of `habit` becomes `count` (the HabitCard
// strings, for paths that do not go through the card: the detail sheet's today cell).
export function todayAnnouncement(habit, count) {
  const name = habit.name;
  if (usesCounter(habit)) {
    return t(habit.type === 'atMost' ? 'habitCard.announce.countMax' : 'habitCard.announce.count', { name, count, goal: habit.volumeGoal });
  }
  if (count <= 0) return t('habitCard.announce.unchecked', { name });
  return habit.type === 'quit' ? t('habitCard.announce.avoided', { name }) : t('habitCard.announce.done', { name });
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
    themeName, allHabits, getOverallStreak, habitsOnDay, isSnapshotHabitDone, isExcused, isDayFrozen,
    getStreakForHabit, setHint,
  } = useApp();
  useLocale();
  const device = useDeviceSettings();
  // C-06a: the check-off timeline (plan §4.1 / §4.2). `choreography` is the device-local dev
  // flag (Settings → Dev tools); off restores the pre-C-06a feedback calls and the per-check
  // toast.
  const choreography = useDevFlag('choreography');

  // The full-screen celebration is only for streak milestones; a perfect day resolves at the
  // ring (credit flight + RingBurst, C-07).
  const [milestoneShown, setMilestoneShown] = useState(null);

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
  // C-08 CEL-7: Share on the milestone screen opens the streak card here, once it has closed.
  const [shareOpen, setShareOpen] = useState(false);
  const [shareMounted, setShareMounted] = useState(false);
  if (shareOpen && !shareMounted) setShareMounted(true);
  // Lock the pager swipe while the sheet is up, like the Habits screen does.
  useEffect(() => { setModalOpen(!!detailHabitId || shareOpen); }, [detailHabitId, shareOpen]); // eslint-disable-line react-hooks/exhaustive-deps
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

  // C-07: the day-complete moment needs no Today render. CreditFlight (the credit, +500 ->
  // +750) and RingBurst (+750 -> +1500) run on the beat bus; the burst is played directly only
  // with the choreography flag off (at the tap, where the old confetti was).
  const burstRef = useRef(null);
  const moment = useCheckoffMoment();
  // C-07 perf probe (frameLog dev flag, or __DEV__): how long a tap's render takes, from the
  // handler to the commit of the whole tree (every tab renders in the same commit).
  const perfTap = useRef(null);
  useLayoutEffect(() => {
    if (perfTap.current == null) return;
    const at = perfTap.current;
    perfTap.current = null;
    if (frameLogOn()) logMark('commit', at);
  });
  const [fullCelebration, setFullCelebration] = useState(false);
  // The trophy and the streak milestone, in order on the beat grid (C-07; useCelebrationQueue):
  // the trophy at +500 (+1500 when the check also completed the day, +125 with the flag off),
  // the milestone at the end of the moment, after the trophy, and only while Today is shown.
  const milestoneRing = useRef('ring');
  const tabActive = useTabActive();
  // C-08: a small beat (Day 1, 3 or 14 days in a row) is a line in the strip (and the sticky
  // bar), held for celebration.smallBeatHold; it adds no sound or haptic of its own, the
  // day.complete chord that just played is its sound (plan §2.10). A big milestone is the
  // full screen with the fanfare.
  const [beatBanner, setBeatBanner] = useState(null);
  const bannerTimer = useRef(null);
  const showBeat = useCallback((milestone, { hold = false } = {}) => {
    const text = milestone.text;
    clearTimeout(bannerTimer.current);
    setBeatBanner({ key: `${milestone.days}-${Date.now()}`, icon: milestone.icon, text });
    announce(text);
    if (!hold) bannerTimer.current = setTimeout(() => setBeatBanner(null), celebration.smallBeatHold);
  }, []);
  useEffect(() => () => clearTimeout(bannerTimer.current), []);
  const showMilestone = useCallback((milestone) => {
    if (milestone.small) { showBeat(milestone); return; }
    // The milestone circle grows from the ring that is showing (the sticky one when scrolled).
    milestoneRing.current = stuckRef.current ? 'ringSticky' : 'ring';
    setMilestoneShown(milestone);
    setFullCelebration(true);
    feedback.play(EVENTS.milestone);
  }, [showBeat]); // eslint-disable-line react-hooks/exhaustive-deps
  const { trophyCelebrating, setTrophyCelebrating, openTrophyAt, trophyDone } = useCelebrationQueue({
    pendingMilestone, clearPendingMilestone, active: tabActive, onMilestone: showMilestone,
  });
  // The web mockup's `?celebrate=<days>` shows that milestone (held) for review stills.
  const mockCelebrate = mockupParams.celebrate;
  useEffect(() => {
    if (mockCelebrate == null) return;
    const m = [...SMALL_MILESTONES, ...STREAK_MILESTONES].find(x => x.days === mockCelebrate);
    if (!m) return;
    if (m.small) showBeat(m, { hold: true });
    else { setMilestoneShown(m); setFullCelebration(true); }
  }, [mockCelebrate, showBeat]);
  const [rewardModalVisible, setRewardModalVisible] = useState(false);
  const [rewardsToShow, setRewardsToShow] = useState([]);
  const rewardModalShown = useRef(false);
  const allDoneCelebrated = useRef(false);
  // Choreography off only: feedback still pending from the last check-off (day.complete at
  // +750, challenge.claimed at +250). An un-check cancels them (§4.1). With choreography on,
  // useCheckoffMoment keeps this bookkeeping (per habit, plus the resolution).
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
  // A small beat leaves with the day it celebrated: an un-check takes it down at once.
  useEffect(() => {
    if (headerState === 'progress' && beatBanner && mockCelebrate == null) {
      clearTimeout(bannerTimer.current);
      setBeatBanner(null);
    }
  }, [headerState]); // eslint-disable-line react-hooks/exhaustive-deps
  const liveStreak = habits.length > 0 ? getOverallStreak() : 0;
  // C-05 chips. "Frozen": a freeze covered yesterday, so the streak stands on it today.
  // Freezes are spent on the missed day itself (reconcileFreezes looks back from day -1), so
  // today is never frozen.
  const liveFrozen = liveStreak > 0 && isDayFrozen(addDays(today, -1));
  // The web mockup's `?streak=<n>` / `?streak=frozen` shows a chip state for review shots.
  const mockStreak = mockupParams.streak;
  const streak = mockStreak ? mockStreak.count : liveStreak;
  const frozen = mockStreak ? mockStreak.frozen : liveFrozen;
  // Active challenges, in order, as chips: "name · day N" with today's claim.
  const challengeChips = React.useMemo(() => {
    const live = effectiveChallenges
      .filter(ch => challenges.some(c => c.id === ch.id) && !isChallengeExpired(ch, today))
      .map(ch => ({ id: ch.id, name: ch.name, day: currentChallengeDay(ch, today), days: ch.days, done: ch.completedDays.includes(today) }));
    // `?challenges=<n>` pads the list with sample challenges (review shots only).
    return mockupParams.challenges != null ? padMockupChallenges(live, mockupParams.challenges) : live;
  }, [effectiveChallenges, challenges, today]);
  const [streakRuleOpen, setStreakRuleOpen] = useState(false);
  const openStreakRule = useCallback(() => setStreakRuleOpen(true), []);
  const openChallenges = useCallback(() => setRequestedTab(2), [setRequestedTab]);
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
  // Where the credit flies (C-07): the strip ring, or the sticky-bar ring once the strip has
  // scrolled under the bar (then the bar also hides any card beneath it).
  const creditTargets = useCallback(() => (stuckRef.current
    ? { ring: 'ringSticky', edge: 'sticky', cover: 'sticky' }
    : { ring: 'ring', edge: 'strip' }), []);
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
        <SectionLabel label={t('today.coach')} theme={theme} color={theme.link} first style={styles.nudgeLabel} />
        {nudgeLoading && !shownNudge ? (
          <ActivityIndicator size="small" color={theme.link} style={{ marginTop: space.xxs }} />
        ) : (
          <Text style={[styles.nudgeText, { color: theme.text }]}>{shownNudge}</Text>
        )}
      </View>
    </View>
  ) : null;

  // C-03 (BTN-5): the one-time tip above the first card, from the 2nd app open until "Got it"
  // (or until a card's options have been opened). The mockup shows it only with ?hint=longPress,
  // so review shots stay deterministic.
  const showLongPressHint = mockupParams.active
    ? mockupParams.hint === 'longPress' && !hintSeen(settings, 'longPress') && dueHabits.length > 0
    : shouldShowLongPressHint({ settings, appOpens: device.appOpens, cardCount: dueHabits.length });
  const longPressHint = showLongPressHint ? (
    <View
      testID="hint-longpress"
      style={[styles.hintCard, { backgroundColor: theme.brandSurface, borderColor: theme.border }]}
    >
      <Ionicons name="hand-left-outline" size={18} color={theme.link} style={styles.hintIcon} />
      <Text
        style={[styles.hintText, { color: theme.text }]}
        accessibilityLabel={t('today.hint.longPressA11y')}
      >
        {t('today.hint.longPress')}
      </Text>
      <Button
        variant="tertiary"
        size="sm"
        label={t('common.gotIt')}
        onPress={() => setHint('longPress')}
        style={styles.hintBtn}
      />
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
    const tapAt = Date.now();
    perfTap.current = tapAt;
    const before = getHabitCount(habit.id);
    const after = { ...getTodayCompletions(), [habit.id]: countAfterIncrement(habit, before, amount) };
    const justCompleted = incrementHabit(habit.id, amount);
    if (justCompleted === false && !usesCounter(habit) && before >= 1) return; // already checked
    // §4.1 r2: no snackbar for a single check; HabitCard announces it and Undo = tap again.
    if (!choreography) {
      const over = habit.type === 'atMost' && before + amount > habit.volumeGoal;
      setToast({ id: tapAt, habit, amount, message: justCompleted ? (habit.type === 'quit' ? t('today.toast.avoided', { name: habit.name }) : t('today.toast.done', { name: habit.name })) : over ? t('today.toast.overLimit', { name: habit.name }) : t('today.toast.plus', { name: habit.name, amount }) });
    }
    // The note climbs the §2.11 ladder: a counter by its step toward the goal, a daily habit by
    // how many habits are checked today (an untouched limit or a perWeek habit met earlier in
    // the week does not move it). An atMost limit gets a flat tick, and no sound on the tap
    // that breaks it.
    const tone = usesCounter(habit)
      ? { step: after[habit.id], goal: habit.volumeGoal, atMost: habit.type === 'atMost' }
      : { n: ladderIndex(dueHabits, after) };
    // Same frame as the visual change, never awaited (HAP-4).
    if (!choreography) feedback.play(justCompleted ? EVENTS.habitDone : EVENTS.counterStep, { tone });

    let claimed = [];
    let dayComplete = false;
    // Judge everything against the counts after this action.
    const willAllBeDone = dueHabits.every(h => isHabitSatisfiedWith(h, after));
    // A step can also break a complete day (an "at most" limit gone over): the pending
    // resolution (gold ring, chord) is taken back and the day can be celebrated again
    // (C-06b round 1 B1).
    const breaksDay = !justCompleted && !willAllBeDone;
    if (breaksDay) { allDoneCelebrated.current = false; burstRef.current?.stop(); }
    if (justCompleted) {

      // A single check-off completes a challenge immediately, with its trophy.
      const { claimedIds, completedNowIds } = autoClaimChallenges(after);
      const anyComplete = completedNowIds.length > 0;
      // challenge.claimed lands on its beat (+250 ms, with the chip); a completed challenge
      // gets the trophy screen, which plays its own feedback.
      if (!anyComplete) claimed = claimedIds;
      if (!choreography && claimed.length > 0) keepPending(feedback.play(EVENTS.challengeClaimed));
      if (anyComplete) {
        const completesDay = willAllBeDone && !allDoneCelebrated.current;
        openTrophyAt(tapAt, !choreography ? beats.b16 : completesDay ? MOMENT_MS : beats.b4);
      }

      if (willAllBeDone && !allDoneCelebrated.current) {
        allDoneCelebrated.current = true;
        dayComplete = true;
        if (!choreography) {
          keepPending(feedback.play(EVENTS.dayComplete));
          burstRef.current?.play();
        }
      }
    }
    if (choreography) {
      // data -> claim -> beats, in this tick; the beats are timed from the tap.
      moment.run({
        kind: justCompleted ? BEAT.check : BEAT.step,
        habitId: habit.id,
        tone,
        claimedIds: claimed,
        dayComplete,
        breaksDay,
        // Today was not done before this tap, so the habit's streak becomes the old one + 1.
        habitStreak: !!justCompleted && getStreakForHabit(habit.id) >= 1,
        tapAt,
      });
    }
  }, [dueHabits, isHabitSatisfiedWith, autoClaimChallenges, incrementHabit, getHabitCount, getTodayCompletions, choreography, moment, getStreakForHabit, openTrophyAt]);

  // `undo`: the toast Undo, which always reads as an un-check.
  const handleDecrement = useCallback((habit, amount = 1, { undo = false } = {}) => {
    const tapAt = Date.now();
    perfTap.current = tapAt;
    const today = todayStr();
    const countBefore = getHabitCount(habit.id);
    const habitWasDone = isGoalMet(habit, countBefore);
    const habitStillDone = isGoalMet(habit, Math.max(0, countBefore - (amount || 1)));
    const unchecks = undo || (habitWasDone && !habitStillDone);

    decrementHabit(habit.id, amount || 1);
    if (!choreography) {
      if (unchecks) {
        cancelPendingFeedback();
        feedback.play(EVENTS.habitUndone);
      } else {
        // A −1 that leaves the habit's done state alone: the tick only, never the rising step chime.
        feedback.play(EVENTS.counterStep, { sound: false });
      }
    }
    allDoneCelebrated.current = false;
    const unclaimed = [];

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
          unclaimed.push(ch.id);
        }
      });
    }
    // An un-check takes back this habit's pending beats, any pending resolution and the motif
    // of each challenge it un-claimed (§4.1); a −1 that keeps the habit done is a tick only.
    if (choreography) moment.run({ kind: unchecks ? BEAT.uncheck : BEAT.stepDown, habitId: habit.id, unclaimedIds: unclaimed, tapAt });
    // A tap during the burst still lands (the layer takes no touches); an un-check ends the
    // burst with the day it celebrated.
    if (unchecks) burstRef.current?.stop();
  }, [decrementHabit, effectiveChallenges, challenges, dueHabits, getHabitCount, unmarkChallengeDay, todayStr, cancelQueuedFor, choreography, moment]);

  // Today's cell in the detail sheet (code review M1): set today's count through the same
  // handlers as a card, so challenge claims / un-claims, the Mark-the-rest queue, the toast,
  // celebrations and feedback all run. "Set 20 (done)" on a timed habit is the manual way to
  // log a session done away from the in-app timer.
  const setTodayFromSheet = useCallback((habit, target) => {
    const delta = target - getHabitCount(habit.id);
    if (delta > 0) handleIncrement(habit, delta);
    else if (delta < 0) handleDecrement(habit, -delta);
    // No toast for a single check (C-06a): the screen reader hears the change instead.
    if (delta !== 0) announce(todayAnnouncement(habit, target));
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
    perfTap.current = id;
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
    if (!choreography) {
      keepPending(feedback.play(EVENTS.markRest));
      if (claimedIds.length > 0) keepPending(feedback.play(EVENTS.challengeClaimed));
    }
    // Celebrate only when the day is truly complete: counters may still be open.
    const allNow = dueHabits.length > 0 && dueHabits.every(h => isHabitSatisfiedWith(h, plan.next));
    const dayComplete = allNow && !allDoneCelebrated.current;
    if (dayComplete) {
      allDoneCelebrated.current = true;
      if (!choreography) burstRef.current?.play();
    }
    // One credit for the batch (C-07, §4.1): it leaves the bottom-most card Mark the rest
    // changed that is on screen (the button sits under the last card, where the thumb is), else
    // the strip edge. The ids go in list order; CreditFlight picks at +500.
    const order = grouped ? grouped.flatMap(sec => sec.habits) : dueHabits;
    const creditFrom = order.filter(h => plan.changedIds.includes(h.id)).map(h => h.id);
    if (choreography) moment.run({ kind: BEAT.markRest, claimedIds, dayComplete, creditFrom, tapAt: id });
  }, [markRestDone, autoClaimChallenges, dueHabits, grouped, isHabitSatisfiedWith, todayStr, choreography, moment]);

  // Undo for Mark the rest, on the day the action ran (tst.dayKey): drop its queued
  // completions, revert the habits it marked that are still at 1, and un-mark exactly
  // the challenge days it claimed.
  const undoMarkRest = useCallback((tst) => {
    queueRef.current = queueRef.current.filter(i => i.token !== tst.id);
    if (choreography) moment.run({ kind: BEAT.undoMarkRest });
    else {
      cancelPendingFeedback();
      feedback.play(EVENTS.habitUndone);
    }
    burstRef.current?.stop();
    restoreHabitCounts(tst.before, tst.changedIds, tst.dayKey);
    tst.claimedIds.forEach(id => unmarkChallengeDay(id, tst.dayKey));
    allDoneCelebrated.current = false;
  }, [restoreHabitCounts, unmarkChallengeDay, choreography, moment]);

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
            frozen={frozen}
            challenges={challengeChips}
            onStreakPress={openStreakRule}
            onChallengePress={openChallenges}
            banner={beatBanner}
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
              {longPressHint}
              {grouped ? grouped.map((section, i) => (
                <View key={section.key}>
                  <SectionLabel icon={SECTION_ICONS[section.key]} label={t(`today.sections.${section.key}`)} theme={theme} style={i > 0 ? styles.groupAfterCards : compactRing && styles.sectionCompact} />
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
          frozen={frozen}
          onPress={scrollToTop}
          banner={beatBanner}
          a11yLabel={headerState ? (headerState === 'progress' ? t('today.ring.a11y', { completed, total }) : dayLine({ state: headerState, completed, total, streak })) : undefined}
        />
      </Animated.View>

      {/* The day-complete moment (C-07): the credit flies card -> ring, then the burst. Both
          clip to the Today body (inside the safe area) and never take a touch. */}
      <CreditFlight theme={theme} targets={creditTargets} />
      <RingBurst ref={burstRef} theme={theme} targets={creditTargets} />
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

      {/* The streak rule (S-08), from the streak chip. */}
      <Dialog
        visible={streakRuleOpen}
        onClose={() => setStreakRuleOpen(false)}
        title={t('progress.streakRule.title')}
        body={t('progress.streakRule.body')}
        actions={[{ key: 'close', label: t('common.close'), onPress: () => setStreakRuleOpen(false) }]}
      />

      <HabitDetailSheet habit={detailHabit} onClose={closeDetail} onEdit={editFromDetail} onSetToday={setTodayFromSheet} />

      <NoteModal
        target={noteTarget}
        theme={theme}
        onClose={() => setNoteTarget(null)}
        onSave={(text) => { setNote(noteTarget.habitId, noteTarget.key, text); setNoteTarget(null); }}
      />

      <CompletionCelebration
        visible={fullCelebration}
        milestone={milestoneShown}
        originKey={milestoneRing.current}
        hold={mockCelebrate != null}
        onDone={() => {
          setFullCelebration(false);
          // A milestone is a signature moment: the one time we may ask for a rating.
          if (milestoneShown) setTimeout(() => maybeRequestReview(`milestone-${milestoneShown.days}`), 800);
          setMilestoneShown(null);
        }}
        onShare={() => {
          setFullCelebration(false);
          setMilestoneShown(null);
          setShareOpen(true);
        }}
      />
      {/* Mounted from the first Share on (its cards compute a year of day summaries, which the
          check-off path must not pay for). */}
      {shareMounted ? <ShareCards visible={shareOpen} onClose={() => setShareOpen(false)} initialKind="streak" /> : null}

      <TrophyCelebration
        visible={trophyCelebrating}
        onDone={() => { trophyDone(); setTimeout(() => maybeRequestReview('challenge-complete'), 800); }}
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
  scroll: { paddingBottom: space.xl },
  body: { flex: 1 },
  header: { paddingHorizontal: space.gutter, paddingTop: HEADER_TOP },
  content: { paddingHorizontal: space.gutter },
  plainList: { marginTop: space.md },
  // Short windows (SE): the first group label sits 16 under the header instead of 24, so the
  // fourth card stays above the tab bar.
  sectionCompact: { marginTop: space.sectionCompact },
  // A later group label sits under a card, whose own marginBottom (xs) already spaces it, so
  // card bottom to label is lg (24) between groups (§2.6, D-00; M2 gate M3-5), on every height.
  groupAfterCards: { marginTop: space.lg - space.xs },
  stickyLayer: { position: 'absolute', top: 0, left: 0, right: 0, height: STICKY_H },
  restCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: space.sm,
    borderWidth: 1, borderRadius: radius.card, padding: space.md, marginTop: space.lg,
  },
  restText: { flex: 1 },
  restTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  restBody: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  markRestBtn: { alignSelf: 'center', minHeight: 48, borderRadius: radius.control, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.md, marginTop: space.xxs },
  markRestText: { fontSize: 15, fontWeight: '700' },
  markRestNote: { fontSize: 13, marginTop: 2, textAlign: 'center' },
  nudgeCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderWidth: 1, borderRadius: radius.card, padding: 14, marginTop: space.md,
  },
  nudgeIcon: { marginTop: 1 },
  // C-03 tip: brandSurface like the other informational cards; "Got it" sits beside the text
  // so the card stays short (the SE fold).
  hintCard: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    borderWidth: 1, borderRadius: radius.card, paddingLeft: space.md, paddingRight: space.xxs,
    paddingVertical: space.sm, marginTop: space.md,
  },
  hintIcon: { alignSelf: 'flex-start' },
  hintText: { ...typeScale.footnote, flex: 1 },
  hintBtn: { paddingHorizontal: space.sm },
  nudgeLabel: { marginBottom: space.xxs },
  nudgeText: { fontSize: 13, lineHeight: 20 },
  empty: {
    borderWidth: 2, borderStyle: 'dashed', borderRadius: radius.card,
    padding: 36, alignItems: 'center', marginTop: space.lg,
  },
  emptyEmoji: { fontSize: 40, marginBottom: space.sm },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: space.xs },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  // Button (block, primary) gives the fill, radius and 48 min height; this adds the lift.
  addHabitBtn: {
    marginTop: space.xs,
    minHeight: 56,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  challengeEmptyRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    borderRadius: radius.card, borderWidth: 1, padding: space.md, marginTop: 20,
  },
  challengeEmptyIcon: { fontSize: 28 },
  challengeEmptyText: { flex: 1 },
  challengeEmptyTitle: { fontSize: 15, fontWeight: '700' },
  challengeEmptyBody: { fontSize: 12, marginTop: 2 },
});
