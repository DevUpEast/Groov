// The check-off moment as data (plan §4.1, §4.2, §4.3; C-06a). Pure: no timers, no React.
//
// `planBeats(action)` turns one Today action into the events of its moment, each on a beat of
// the 120 bpm grid (src/theme/motion.js `beat`): 0 confirm, 125 progress, 250 linked reward,
// 375 habit streak tick, 500 credit departs, 750 resolution, 875 streak tick. An item is either
// a `feedback` event (haptic + sound through src/services/feedback.js, played with an explicit
// delay) or a `visual` beat (what C-06b / C-07 animate, with the length it lasts).
//
// `mergeBeats(pending, plan, now)` is the §4.2 bookkeeping for rapid taps: what the new action
// cancels (an un-check drops that habit's pending beats and any pending resolution; Undo of
// Mark the rest drops everything) and what it coalesces (one header tween, one challenge motif,
// one resolution: a new item replaces a pending item with the same key). Per-card beats of
// different habits stay independent. src/hooks/useCheckoffMoment.js runs both.
import { beat, duration } from '../theme/motion';
import { isGoalMet } from './habits';

// Everything of one moment has played by then (the resolution burst ends at 1500, §4.1).
export const MOMENT_MS = 1500;

export const KINDS = Object.freeze({
  check: 'check', // a daily check, or the counter step / timer stop that meets the goal
  step: 'step', // a counter step below (or past) the goal
  stepDown: 'stepDown', // a −1 that leaves the habit's done state alone
  uncheck: 'uncheck', // un-check, a decrement out of done
  markRest: 'markRest', // "Mark the rest done"
  undoMarkRest: 'undoMarkRest', // its toast Undo
});

// Groups decide what an un-check cancels: the habit's own beats, the challenge motif of the
// challenges it un-claims, and the day's resolution.
export const GROUPS = Object.freeze({ habit: 'habit', header: 'header', challenge: 'challenge', resolution: 'resolution' });

/**
 * The habit-ladder index n of §2.11 (`H(n)`): how many of today's habits are *checked* today
 * with their goal met, given today's counts after the action. An untouched "at most" habit
 * (met by staying under its limit) and a perWeek habit already met this week do not move the
 * note (F-04b carry n1): only a check-off made today counts.
 */
export function ladderIndex(habits, counts) {
  return habits.filter((h) => {
    if (h.type === 'atMost') return false;
    const c = counts?.[h.id] || 0;
    return c > 0 && isGoalMet(h, c);
  }).length;
}

function visual(name, at, length, group, extra = {}) {
  return { channel: 'visual', beat: name, at, duration: length, group, ...extra };
}

function fb(event, at, group, extra = {}) {
  return { channel: 'feedback', event, at, group, ...extra };
}

/**
 * Plan one action's moment. `action`:
 * - `kind`: one of KINDS;
 * - `habitId`: the habit acted on (none for Mark the rest);
 * - `tone`: the §2.11 note context for habit.done / counter.step (`{ n }` or `{ step, goal }`);
 * - `claimedIds`: challenges whose day this action claimed (motif at b8, paired with the chip);
 * - `unclaimedIds`: challenges whose day an un-check took back (their pending motif is cancelled);
 * - `dayComplete`: this action completed the day (credit at b4, chord + Success at b4 + b8);
 * - `creditFrom`: the habit whose card the credit leaves from (default `habitId`; Mark the
 *   rest names its bottom-most changed card that is on screen, C-07);
 * - `habitStreak`: the habit's own streak grew to 2 or more (its sub-line pulses at bDot8);
 * - `breaksDay` (step / stepDown): the day is no longer complete after this action (an "at
 *   most" limit broken, C-06b round 1 B1): any pending resolution is taken back;
 * - `reduced`: reduced motion. Visual beats then last `duration.reduced` (150 ms) and the
 *   credit flight is dropped (§4.3: the gold ring fades in at 750); feedback is unchanged.
 *
 * Returns `{ kind, habitId, items, cancel }`. Each item has `at` (ms from the tap), `channel`,
 * `group`, `key` (for coalescing) and `event` + `opts` (feedback) or `beat` + `duration`
 * (visual). `cancel` says what the action takes back: `{ all, habitId, groups, challengeIds }`.
 */
export function planBeats(action = {}) {
  const {
    kind, habitId = null, tone, claimedIds = [], unclaimedIds = [],
    dayComplete = false, habitStreak = false, reduced = false, breaksDay = false, creditFrom = null,
  } = action;
  const len = (ms) => (reduced ? duration.reduced : ms);
  const items = [];
  const cancel = { all: false, habitId: null, groups: [], challengeIds: [] };
  const claim = claimedIds.length > 0;

  const linked = () => {
    if (!claim) return;
    items.push(fb('challenge.claimed', beat.b8, GROUPS.challenge, { challengeIds: claimedIds }));
    items.push(visual('linkedReward', beat.b8, len(duration.state), GROUPS.challenge, { challengeIds: claimedIds }));
  };
  const resolution = (withHaptic) => {
    if (!dayComplete) return;
    // The credit leaves the checked card (Mark the rest: the card it names, C-07).
    if (!reduced) items.push(visual('creditDeparts', beat.b4, beat.b8, GROUPS.resolution, { creditFrom: creditFrom ?? habitId }));
    if (withHaptic) items.push(fb('day.complete', beat.b4b8, GROUPS.resolution));
    items.push(visual('resolution', beat.b4b8, len(duration.state), GROUPS.resolution));
    items.push(visual('streakTick', beat.b4b8b16, len(duration.state), GROUPS.resolution));
  };

  switch (kind) {
    case KINDS.check:
      items.push(fb('habit.done', 0, GROUPS.habit, { opts: { tone } }));
      items.push(visual('confirm', 0, len(duration.state), GROUPS.habit));
      items.push(visual('progress', beat.b16, len(duration.value), GROUPS.header));
      linked();
      if (habitStreak) items.push(visual('habitStreak', beat.bDot8, len(duration.state), GROUPS.habit));
      resolution(true);
      break;
    case KINDS.step:
      // Below the goal the ring does not move (§4.1): the number rolls, nothing else.
      items.push(fb('counter.step', 0, GROUPS.habit, { opts: { tone } }));
      items.push(visual('count', 0, duration.reduced, GROUPS.habit));
      if (breaksDay) cancel.groups = [GROUPS.resolution];
      break;
    case KINDS.stepDown:
      items.push(fb('counter.step', 0, GROUPS.habit, { opts: { sound: false } }));
      items.push(visual('count', 0, duration.reduced, GROUPS.habit));
      if (breaksDay) cancel.groups = [GROUPS.resolution];
      break;
    case KINDS.uncheck:
      items.push(fb('habit.undone', 0, GROUPS.habit));
      items.push(visual('confirm', 0, duration.reduced, GROUPS.habit));
      items.push(visual('progress', beat.b16, len(duration.value), GROUPS.header));
      cancel.habitId = habitId;
      cancel.groups = [GROUPS.resolution];
      cancel.challengeIds = unclaimedIds;
      break;
    case KINDS.markRest:
      // One Success haptic now; its chord rides on the markRest event at b4 + b8 (feedback.js
      // soundAt), so there is no separate day.complete haptic (§2.10).
      items.push(fb('markRest', 0, GROUPS.resolution));
      items.push(visual('confirm', 0, len(duration.state), GROUPS.habit));
      items.push(visual('progress', beat.b16, len(duration.value), GROUPS.header));
      linked();
      resolution(false);
      break;
    case KINDS.undoMarkRest:
      items.push(fb('habit.undone', 0, GROUPS.habit));
      items.push(visual('progress', beat.b16, len(duration.value), GROUPS.header));
      cancel.all = true;
      break;
    default:
      return { kind, habitId, items: [], cancel };
  }

  const keyed = items.map((it) => ({
    ...it,
    habitId: it.group === GROUPS.habit ? habitId : (it.habitId ?? habitId),
    // Habit beats are per card; header, challenge and resolution beats are one per screen.
    key: `${it.channel}:${it.event || it.beat}${it.group === GROUPS.habit ? `:${habitId}` : ''}`,
  }));
  return { kind, habitId, items: keyed, cancel };
}

/**
 * §4.2: fold a new plan into the items still pending. `pending` entries are plan items plus
 * `tapAt` (when their action happened). Returns `{ cancel, keep }`: the pending entries to
 * cancel now, those that stay, and the plan's `items` to schedule (a coalesced motif carries
 * the challenge ids of the one it replaced). Entries older than MOMENT_MS are dropped (done).
 *
 * - `cancel.all` (Undo of Mark the rest) takes everything back.
 * - An un-check takes back every pending beat of its habit (whatever the group, so the motif
 *   and resolution it started), every pending resolution (the day is no longer complete, a
 *   credit in flight included) and the motif of each challenge it un-claimed.
 * - Coalescing: a pending item with the same key as a new one is replaced, so the header
 *   tween retargets once, two claims in one window play one motif, and a re-armed resolution
 *   plays once, timed from the latest tap.
 */
export function mergeBeats(pending = [], plan = { items: [], cancel: {} }, now = 0) {
  const live = pending.filter((p) => now - p.tapAt < MOMENT_MS);
  const c = plan.cancel || {};
  const newKeys = new Set((plan.items || []).map((i) => i.key));
  const unclaimed = new Set(c.challengeIds || []);
  const hit = (p) => {
    if (c.all) return true;
    if (c.habitId && p.habitId === c.habitId) return true;
    if ((c.groups || []).includes(p.group)) return true;
    if (p.challengeIds && p.challengeIds.some((id) => unclaimed.has(id))) return true;
    return newKeys.has(p.key);
  };
  const cancel = [];
  const keep = [];
  live.forEach((p) => (hit(p) ? cancel : keep).push(p));
  // A coalesced motif stands for every challenge it replaced, so a later un-check of any of
  // them still takes it back.
  const items = (plan.items || []).map((i) => {
    if (!i.challengeIds) return i;
    const ids = new Set(i.challengeIds);
    cancel.forEach((p) => { if (p.key === i.key && p.challengeIds) p.challengeIds.forEach((id) => ids.add(id)); });
    unclaimed.forEach((id) => ids.delete(id));
    return ids.size === i.challengeIds.length ? i : { ...i, challengeIds: [...ids] };
  });
  return { cancel, keep, items };
}
