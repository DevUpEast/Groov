import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
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
import NoteModal from '../components/NoteModal';
import MoodCheckIn from '../components/MoodCheckIn';
import { isGoalMet, usesCounter } from '../utils/habits';
import { successNotification, mediumImpact } from '../utils/haptics';
import { playChime, playSuccessChime, playChallengeChime, playHornFanfare } from '../utils/sounds';
import { fetchDailyNudge } from '../services/aiCoaching';
import { localDateKey, parseDateKey } from '../utils/dates';
import { maybeRequestReview } from '../services/review';
import { currentChallengeDay, isChallengeExpired } from '../utils/challenges';
import { t, getLocale, useLocale } from '../i18n';

// Today list sections. Habits without a time of day go under "Anytime", which is
// omitted (plain list) when no habit has a time set at all.
const TIME_SECTIONS = ['morning', 'afternoon', 'evening', 'anytime'];

function SproutIcon({ size = 24 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      {/* Stem — drawn first so leaves sit on top */}
      <Rect x="9.25" y="3" width="1.5" height="16" rx="0.75" fill="#F5C518" />
      {/* Left leaf — branches off the left side of the stem, curves up-left to a point */}
      <Path d="M 10 13 C 5 12 1 8 3 5 C 5 3 9 5 10 9 Z" fill="#F5C518" />
      {/* Right leaf — mirror image, branches right and curves up-right */}
      <Path d="M 10 13 C 15 12 19 8 17 5 C 15 3 11 5 10 9 Z" fill="#F5C518" />
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

function hapticFillSequence(hapticsEnabled) {
  if (!hapticsEnabled) return;
  successNotification();
}

// Habits a challenge watches today: its linked habits (or all of them) that are
// actually scheduled today, so a weekday-only habit never blocks a weekend claim.
function getRelevantHabits(challenge, dueHabits) {
  const ids = challenge.linkedHabitIds || [];
  return ids.length > 0 ? dueHabits.filter(h => ids.includes(h.id)) : dueHabits;
}

export default function TodayScreen() {
  const {
    habits, dueHabits, challenges, effectiveChallenges, completions, getCompletedCount, isAllDone,
    incrementHabit, decrementHabit, isHabitSatisfied,
    isChallengeHabitsDone, settings, theme, markChallengeDay, unmarkChallengeDay,
    getHabitCount, dateOffset, todayStr, accountCreatedAt, displayName, devMode,
    completeChallengeImmediately, selectAllHabitsToday, resetAllHabitsToday,
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
      if (settings.soundEnabled) playHornFanfare();
      if (settings.hapticsEnabled) successNotification();
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

  // Shared logic for auto-claiming/completing challenges after habits are done.
  // Returns { anyClaimed, anyComplete } so callers can trigger sounds/trophies.
  const autoClaimChallenges = useCallback((justCompletedHabitId, assumeAllDone = false) => {
    const today = todayStr();
    let anyClaimed = false;
    let anyComplete = false;

    // Use effectiveChallenges so completedDays are filtered to <= today.
    // The raw challenges array keeps future-dated entries when the dev-tool date offset is
    // rewound, which would inflate the completion count and trigger early completion.
    // Skip any "reverted" challenge that lives in pastChallenges rather than challenges.
    effectiveChallenges.forEach(ch => {
      if (!challenges.some(c => c.id === ch.id)) return;
      if (ch.completedDays.includes(today)) return;
      if (isChallengeExpired(ch, today)) return;

      const relevant = getRelevantHabits(ch, dueHabits);
      if (relevant.length === 0) return;

      const allRelevantDone = assumeAllDone || relevant.every(h => {
        if (justCompletedHabitId && h.id === justCompletedHabitId) return true;
        return isHabitSatisfied(h);
      });

      if (!allRelevantDone) return;

      const newDaysList = [...ch.completedDays, today];
      if (newDaysList.length >= ch.days) {
        completeChallengeImmediately(ch.id);
        anyComplete = true;
      } else {
        markChallengeDay(ch.id);
      }
      anyClaimed = true;
    });

    return { anyClaimed, anyComplete };
  }, [effectiveChallenges, challenges, dueHabits, isHabitSatisfied, markChallengeDay, completeChallengeImmediately, todayStr]);

  const handleIncrement = useCallback(async (habit, amount = 1) => {
    const before = getHabitCount(habit.id);
    const justCompleted = incrementHabit(habit.id, amount);
    if (justCompleted === false && !usesCounter(habit) && before >= 1) return; // already checked
    const over = habit.type === 'atMost' && before + amount > habit.volumeGoal;
    setToast({ habit, amount, message: justCompleted ? (habit.type === 'quit' ? t('today.toast.avoided', { name: habit.name }) : t('today.toast.done', { name: habit.name })) : over ? t('today.toast.overLimit', { name: habit.name }) : t('today.toast.plus', { name: habit.name, amount }) });
    if (settings.hapticsEnabled) await mediumImpact();
    if (settings.soundEnabled) (justCompleted ? playSuccessChime : playChime)();

    if (justCompleted) {
      // Compute synchronously: this habit just hit its goal; check every other habit
      // against the pre-increment completions (they haven't changed).
      const willAllBeDone = dueHabits.every(h => {
        if (h.id === habit.id) return true;
        return isHabitSatisfied(h);
      });

      const { anyClaimed, anyComplete } = autoClaimChallenges(habit.id);
      if (settings.soundEnabled && anyClaimed) {
        // Let the habit chime finish before the challenge sound starts.
        setTimeout(anyComplete ? playHornFanfare : playChallengeChime, 320);
      }
      if (anyComplete) setTimeout(() => setTrophyCelebrating(true), 100);

      if (willAllBeDone && !allDoneCelebrated.current) {
        allDoneCelebrated.current = true;
        hapticFillSequence(settings.hapticsEnabled);
        setCelebrating(true);
      }
    }
  }, [dueHabits, isHabitSatisfied, todayStr, autoClaimChallenges, incrementHabit, settings, getHabitCount]);

  const handleDecrement = useCallback(async (habit, amount = 1) => {
    const today = todayStr();
    const countBefore = getHabitCount(habit.id);
    const habitWasDone = isGoalMet(habit, countBefore);
    const habitStillDone = isGoalMet(habit, Math.max(0, countBefore - (amount || 1)));

    decrementHabit(habit.id, amount || 1);
    allDoneCelebrated.current = false;

    // Only unmark challenge days when this habit transitions from done → not done
    if (habitWasDone && !habitStillDone) {
      effectiveChallenges.forEach(ch => {
        if (!challenges.some(c => c.id === ch.id)) return;
        if (!ch.completedDays.includes(today)) return;
        const relevant = getRelevantHabits(ch, dueHabits);
        if (relevant.some(h => h.id === habit.id)) {
          unmarkChallengeDay(ch.id);
        }
      });
    }
  }, [decrementHabit, effectiveChallenges, challenges, dueHabits, getHabitCount, unmarkChallengeDay, todayStr]);

  const handleSelectAll = useCallback(async () => {
    const today = todayStr();

    if (allDone) {
      // Unselect all
      resetAllHabitsToday();
      allDoneCelebrated.current = false;
      effectiveChallenges.forEach(ch => {
        if (!challenges.some(c => c.id === ch.id)) return;
        if (ch.completedDays.includes(today)) unmarkChallengeDay(ch.id);
      });
    } else {
      selectAllHabitsToday();
      if (settings.soundEnabled) playSuccessChime();
      // assumeAllDone=true because selectAllHabitsToday hasn't flushed to state yet
      const { anyClaimed, anyComplete } = autoClaimChallenges(null, true);
      if (settings.soundEnabled && anyClaimed) {
        setTimeout(anyComplete ? playHornFanfare : playChallengeChime, 320);
      }

      if (!allDoneCelebrated.current) {
        allDoneCelebrated.current = true;
        hapticFillSequence(settings.hapticsEnabled);
        setCelebrating(true);
      }
      if (anyComplete) {
        setTimeout(() => setTrophyCelebrating(true), 500);
      }
    }
  }, [
    allDone, effectiveChallenges, challenges, todayStr,
    autoClaimChallenges, selectAllHabitsToday, resetAllHabitsToday,
    unmarkChallengeDay, settings,
  ]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safe, { backgroundColor: theme.primary }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: theme.bg }}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.primary }]}>
          <View style={styles.greetingRow}>
            <Text style={styles.greeting}>
              {displayName ? t('today.greeting.withName', { greeting: getGreeting(dateOffset), name: displayName }) : getGreeting(dateOffset)}
            </Text>
            <SproutIcon size={26} />
          </View>
          <Text style={styles.date}>{getDateString(dateOffset)}</Text>

          <View style={styles.ringRow} accessible={true} accessibilityLabel={t('today.ring.a11y', { completed, total })}>
            <ProgressRing
              progress={progress}
              size={110}
              strokeWidth={10}
              color="#fff"
              bg="rgba(255,255,255,0.25)"
              label={`${completed}/${total}`}
              sublabel={t('today.ring.habits')}
              sublabelColor="rgba(255,255,255,0.85)"
            />
            <View style={styles.ringLabels}>
              <Text style={styles.ringTitle}>
                {allDone ? t('today.ring.allDone') : t('today.ring.remaining', { count: total - completed })}
              </Text>
              <Text style={styles.ringSubtitle}>
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
            <View style={[styles.nudgeCard, { backgroundColor: theme.primaryLight, borderColor: theme.primary }]}>
              <Text style={styles.nudgeEmoji}>✨</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.nudgeLabel, { color: theme.primary }]}>{t('today.coach')}</Text>
                {nudgeLoading ? (
                  <ActivityIndicator size="small" color={theme.primary} style={{ marginTop: 4 }} />
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
                <TouchableOpacity
                  style={[styles.addHabitBtn, { backgroundColor: theme.primary }]}
                  onPress={async () => {
                    if (settings.hapticsEnabled) await mediumImpact();
                    setRequestedTab(3);
                  }}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={t('today.empty.addA11y')}
                >
                  <Ionicons name="add" size={28} color="#fff" />
                </TouchableOpacity>
              </EmptyCard>
              {effectiveChallenges.length === 0 && (
                <TouchableOpacity
                  style={[styles.challengeEmptyRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={async () => {
                    if (settings.hapticsEnabled) await mediumImpact();
                    setRequestedTab(2);
                  }}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={t('today.noChallenges.a11y')}
                >
                  <Text style={styles.challengeEmptyIcon}>🏆</Text>
                  <View style={styles.challengeEmptyText}>
                    <Text style={[styles.challengeEmptyTitle, { color: theme.text }]}>{t('today.noChallenges.title')}</Text>
                    <Text style={[styles.challengeEmptyBody, { color: theme.textMuted }]}>{t('today.noChallenges.body')}</Text>
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
                <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>{t('today.sectionHabits')}</Text>
                <TouchableOpacity
                  onPress={handleSelectAll}
                  style={[styles.selectAllBtn, { borderColor: allDone ? theme.primary : theme.border }]}
                  accessibilityRole="button"
                  accessibilityLabel={allDone ? t('today.unmarkAllA11y') : t('today.markAllA11y')}
                >
                  <Text style={[styles.selectAllBtnText, { color: allDone ? theme.primary : theme.textMuted }]}>
                    {allDone ? t('today.unmarkAll') : t('today.markAll')}
                  </Text>
                </TouchableOpacity>
              </View>
              {grouped ? grouped.map(section => (
                <View key={section.key}>
                  <Text style={[styles.timeLabel, { color: theme.textMuted }]}>{t(`today.sections.${section.key}`)}</Text>
                  {section.habits.map(habit => (
                    <HabitCard
                      key={habit.id}
                      habit={habit}
                      onIncrement={(a) => handleIncrement(habit, a)}
                      onDecrement={(a) => handleDecrement(habit, a)}
                      onNote={openNote}
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
                />
              ))}
            </>
          )}

          {habits.length > 0 && (
            <MoodCheckIn value={moods[today] ?? null} onChange={(v) => setMood(today, v)} theme={theme} haptics={settings.hapticsEnabled} />
          )}

          {/* Active Challenges */}
          {effectiveChallenges.filter(ch => !isChallengeExpired(ch, today)).length > 0 && (
            <View style={styles.challengesSection}>
              <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>{t('today.activeChallenges')}</Text>
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
                          <Text style={[styles.challengeMiniSub, { color: theme.textMuted }]}>
                            {t('today.challenge.sub', { day: currentDay, days: ch.days, count: completedCount })}
                          </Text>
                        </View>
                        {todayDone
                          ? <Text style={[styles.challengeMiniStatus, { color: theme.success }]}>{t('today.challenge.done')}</Text>
                          : <Text style={[styles.challengeMiniStatus, { color: theme.textMuted }]}>{t('today.challenge.pending')}</Text>
                        }
                      </View>
                      <View style={[styles.challengeMiniProgressBg, { backgroundColor: theme.progressBarBg }]}>
                        <View style={[styles.challengeMiniProgressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: theme.primary }]} />
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
        onUndo={() => { const h = toast?.habit; const a = toast?.amount || 1; setToast(null); if (h) handleDecrement(h, a); }}
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
        primaryColor={theme.primary}
        emoji={milestoneShown?.emoji ?? '🎉'}
        title={milestoneShown ? t('today.milestone.title', { days: milestoneShown.days }) : t('today.congrats')}
        subtitle={milestoneShown ? t('today.milestone.subtitle', { label: milestoneShown.label }) : t('today.allTasks')}
      />

      <TrophyCelebration
        visible={trophyCelebrating}
        onDone={() => { setTrophyCelebrating(false); setTimeout(() => maybeRequestReview('challenge-complete'), 800); }}
        settings={settings}
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  greetingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  greeting: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  date: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2, marginBottom: 20 },
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  ringLabels: { flex: 1 },
  ringTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  ringSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 4, lineHeight: 18 },
  content: { padding: 20 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase',
  },
  selectAllBtn: {
    borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
  },
  selectAllBtnText: { fontSize: 12, fontWeight: '700' },
  timeLabel: { fontSize: 12, fontWeight: '700', marginTop: 6, marginBottom: 8 },
  nudgeCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 16,
  },
  nudgeEmoji: { fontSize: 18, marginTop: 1 },
  nudgeLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  nudgeText: { fontSize: 13, lineHeight: 20 },
  empty: {
    borderWidth: 2, borderStyle: 'dashed', borderRadius: 16,
    padding: 36, alignItems: 'center', marginTop: 24,
  },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  addHabitBtn: {
    alignSelf: 'stretch',
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
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
