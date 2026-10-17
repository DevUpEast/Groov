import { daysBetween } from './dates';

// Whole days elapsed since the challenge started (0 on the start day).
export function daysSinceStart(challenge, today) {
  if (!challenge?.startDate) return 0;
  return Math.max(0, daysBetween(challenge.startDate, today));
}

// 1-based day number shown to the user, clamped to the challenge length.
export function currentChallengeDay(challenge, today) {
  return Math.min(challenge.days, daysSinceStart(challenge, today) + 1);
}

// True once the challenge window has fully elapsed (today is after its last day).
export function isChallengeExpired(challenge, today) {
  return daysSinceStart(challenge, today) >= challenge.days;
}

// Habits a challenge watches today: its linked habits (or all of them) that are
// actually scheduled today, so a weekday-only habit never blocks a weekend claim.
export function getRelevantHabits(challenge, dueHabits) {
  const ids = challenge.linkedHabitIds || [];
  return ids.length > 0 ? dueHabits.filter(h => ids.includes(h.id)) : dueHabits;
}

// Which challenges an action claims today (S-02). `challenges` are the effective
// (<= today) challenges; `activeIds` limits them to ones still in the active list;
// `isSatisfied(habit)` must judge the counts *after* the action. Returns the ids
// whose day is claimed and, among them, the ids this claim completes.
export function planChallengeClaims({ challenges, activeIds, dueHabits, today, isSatisfied }) {
  const claimedIds = [];
  const completingIds = [];
  (challenges || []).forEach(ch => {
    if (activeIds && !activeIds.includes(ch.id)) return;
    if (ch.completedDays.includes(today)) return;
    if (isChallengeExpired(ch, today)) return;
    const relevant = getRelevantHabits(ch, dueHabits);
    if (relevant.length === 0) return;
    if (!relevant.every(h => isSatisfied(h))) return;
    claimedIds.push(ch.id);
    if (ch.completedDays.length + 1 >= ch.days) completingIds.push(ch.id);
  });
  return { claimedIds, completingIds };
}

// How a claim is applied. A single check-off completes at once (trophy now);
// "Mark the rest done" only marks the day and queues the completion until its undo
// window closes.
export function routeClaims({ claimedIds, completingIds }, deferCompletion) {
  if (deferCompletion) return { markIds: [...claimedIds], completeNowIds: [], queueIds: [...completingIds] };
  return {
    markIds: claimedIds.filter(id => !completingIds.includes(id)),
    completeNowIds: [...completingIds],
    queueIds: [],
  };
}

// A linked habit was un-marked, decremented below its goal or skipped inside the
// window: drop the queued completions that watch it. Returns the remaining queue and
// the cancelled challenge ids (whose day the caller un-marks).
export function cancelQueuedForHabit(queue, habitId, challenges, dueHabits) {
  const cancelledIds = [];
  const rest = (queue || []).filter(item => {
    const ch = (challenges || []).find(c => c.id === item.challengeId);
    const watches = !ch || getRelevantHabits(ch, dueHabits).some(h => h.id === habitId);
    if (watches) cancelledIds.push(item.challengeId);
    return !watches;
  });
  return { queue: rest, cancelledIds };
}

// The app went to the background: the Mark-the-rest undo window ends there (its toast
// hides, which flushes the queue), so Undo can never appear after the completion ran.
// Other toasts stay. Used as a setToast updater.
export function endMarkRestWindow(toast) {
  return toast?.kind === 'markRest' ? null : toast;
}

// The window closed: complete the queued challenges that are still active (not
// archived by the expiry effect or completed elsewhere) and still have every day.
export function planFlush(queue, currentChallenges) {
  const ids = [];
  (queue || []).forEach(({ challengeId }) => {
    if (ids.includes(challengeId)) return;
    const ch = (currentChallenges || []).find(c => c.id === challengeId);
    if (!ch) return;
    if (ch.completedDays.length < ch.days) return;
    ids.push(challengeId);
  });
  return ids;
}
