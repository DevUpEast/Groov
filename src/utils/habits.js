// Habit types (#38) and the single rule for "did this habit meet its goal on a day".
//
//   daily   one check a day                 done when count >= 1
//   volume  N units a day (can exceed)      done when count >= volumeGoal
//   timed   N minutes a day (can exceed)    done when count >= volumeGoal (minutes)
//   quit    avoid something                 done when the user marks the day avoided (count >= 1)
//   atMost  stay at or under a limit        done when count <= volumeGoal (an untouched day counts)

import { t } from '../i18n';

// Labels and hints are translated at call time so a locale change applies.
const HABIT_TYPE_DEFS = [
  { value: 'daily', emoji: '✓' },
  { value: 'volume', emoji: '🔢' },
  { value: 'timed', emoji: '⏱️' },
  { value: 'quit', emoji: '🚫' },
  { value: 'atMost', emoji: '📉' },
];

export function getHabitTypes() {
  return HABIT_TYPE_DEFS.map(d => ({ ...d, label: t(`habitTypes.${d.value}.label`), hint: t(`habitTypes.${d.value}.hint`) }));
}

// Static view for callers that only need values/emoji; labels reflect the locale at
// the time of the call.
export const HABIT_TYPES = HABIT_TYPE_DEFS.map(d => ({
  ...d,
  get label() { return t(`habitTypes.${d.value}.label`); },
  get hint() { return t(`habitTypes.${d.value}.hint`); },
}));

export function isGoalMet(habit, count) {
  const c = count || 0;
  switch (habit?.type) {
    case 'atMost': return c <= (habit.volumeGoal ?? 0);
    case 'volume':
    case 'timed': return c >= (habit.volumeGoal ?? 1);
    case 'quit':
    case 'daily':
    default: return c >= 1;
  }
}

// Does an increment from `before` to `after` cross the goal line?
export function justMetGoal(habit, before, after) {
  return !isGoalMet(habit, before) && isGoalMet(habit, after);
}

// Step for +/- buttons (minutes for timed habits).
export function countStep(habit) {
  return habit?.type === 'timed' ? 5 : 1;
}

export function usesCounter(habit) {
  return habit?.type === 'volume' || habit?.type === 'timed' || habit?.type === 'atMost';
}

export function unitLabel(habit) {
  if (habit?.type === 'timed') return t('goal.minutes');
  return habit?.unit || '';
}

// Short goal text for lists and sheets.
export function describeGoal(habit) {
  const u = unitLabel(habit);
  switch (habit?.type) {
    case 'volume': return t('goal.volume', { goal: habit.volumeGoal, unit: u || t('goal.times') });
    case 'timed': return t('goal.timed', { goal: habit.volumeGoal });
    case 'quit': return t('goal.quit');
    case 'atMost': return t('goal.atMost', { goal: habit.volumeGoal, unit: u || t('goal.times') });
    default: return t('goal.daily');
  }
}

// Progress text on the Today card.
export function describeProgress(habit, count) {
  const u = unitLabel(habit);
  switch (habit?.type) {
    case 'volume': return u ? t('progressText.volume', { count, goal: habit.volumeGoal, unit: u }) : t('progressText.volumeNoUnit', { count, goal: habit.volumeGoal });
    case 'timed': return t('progressText.timed', { count, goal: habit.volumeGoal });
    case 'atMost':
      if (count > habit.volumeGoal) return u ? t('progressText.atMostOver', { count, goal: habit.volumeGoal, unit: u }) : t('progressText.atMostOverNoUnit', { count, goal: habit.volumeGoal });
      return u ? t('progressText.atMost', { count, goal: habit.volumeGoal, unit: u }) : t('progressText.atMostNoUnit', { count, goal: habit.volumeGoal });
    case 'quit': return count >= 1 ? t('progressText.quit') : null;
    default: return null;
  }
}

// Challenge templates (#38): quick presets for the challenge form. Names and
// descriptions are translated when read so a locale change applies.
const CHALLENGE_TEMPLATE_DEFS = [
  { key: '7', i18nKey: 'reset7', days: 7, icon: '🔥' },
  { key: '21', i18nKey: 'builder21', days: 21, icon: '🌱' },
  { key: '30', i18nKey: 'challenge30', days: 30, icon: '🎯' },
  { key: '66', i18nKey: 'automatic66', days: 66, icon: '🧠' },
  { key: '100', i18nKey: 'streak100', days: 100, icon: '💎' },
];

export function getChallengeTemplates() {
  return CHALLENGE_TEMPLATE_DEFS.map(d => ({
    key: d.key, days: d.days, icon: d.icon,
    name: t(`templates.${d.i18nKey}.name`),
    shortName: t(`templates.${d.i18nKey}.short`),
    description: t(`templates.${d.i18nKey}.description`),
  }));
}

export const CHALLENGE_TEMPLATES = CHALLENGE_TEMPLATE_DEFS.map(d => ({
  key: d.key, days: d.days, icon: d.icon,
  get name() { return t(`templates.${d.i18nKey}.name`); },
  get shortName() { return t(`templates.${d.i18nKey}.short`); },
  get description() { return t(`templates.${d.i18nKey}.description`); },
}));

// Starter habits offered during onboarding (also used by the web mockup's demo seed).
// Names and units are translated on read so the picker follows the active locale;
// the stored habit keeps the name as created.
const STARTER_HABIT_DEFS = [
  { key: 'water', icon: '💧', type: 'volume', volumeGoal: 8, unitKey: 'unitGlasses', timeOfDay: 'anytime', color: '#3B82F6' },
  { key: 'move', icon: '🏃', type: 'daily', volumeGoal: 1, timeOfDay: 'morning', color: '#F97316' },
  { key: 'read', icon: '📚', type: 'daily', volumeGoal: 1, timeOfDay: 'evening', color: '#A855F7' },
  { key: 'meditate', icon: '🧘', type: 'daily', volumeGoal: 1, timeOfDay: 'morning', color: '#14B8A6' },
  { key: 'walk', icon: '🚶', type: 'daily', volumeGoal: 1, timeOfDay: 'afternoon', color: '#22C55E' },
  { key: 'sleep', icon: '😴', type: 'daily', volumeGoal: 1, timeOfDay: 'evening', color: '#6366F1' },
  { key: 'journal', icon: '✍️', type: 'daily', volumeGoal: 1, timeOfDay: 'evening', color: '#EC4899' },
  { key: 'stretch', icon: '🤸', type: 'daily', volumeGoal: 1, timeOfDay: 'morning', color: '#EAB308' },
];

export function getStarterHabits() {
  return STARTER_HABIT_DEFS.map(({ unitKey, ...d }) => ({
    ...d,
    name: t(`onboarding.starter.${d.key}`),
    ...(unitKey ? { unit: t(`onboarding.starter.${unitKey}`) } : {}),
  }));
}

export const STARTER_HABITS = STARTER_HABIT_DEFS.map(({ unitKey, ...d }) => ({
  ...d,
  get name() { return t(`onboarding.starter.${d.key}`); },
  ...(unitKey ? { get unit() { return t(`onboarding.starter.${unitKey}`); } } : {}),
}));

// Count after an increment: daily/quit habits cap at 1, counters add `amount`
// (at least 1). Shared by AppContext.incrementHabit and TodayScreen's post-action map.
export function countAfterIncrement(habit, current, amount = 1) {
  const capped = habit?.type === 'daily' || habit?.type === 'quit' || !habit?.type;
  return capped ? 1 : (current || 0) + Math.max(1, Math.round(amount));
}

// "Mark the rest done" (S-02): set only untouched (count 0), non-skipped daily/quit
// habits to 1. Counters (volume/timed) and atMost limits are never touched, and a
// habit that already counts as satisfied today (a perWeek target met) is left alone.
// Returns the new map for today and the ids it changed.
export function applyMarkRest(todayCounts, dueHabits, skipsToday = [], isSatisfied = null) {
  const next = { ...(todayCounts || {}) };
  const changedIds = [];
  (dueHabits || []).forEach(h => {
    const type = h.type || 'daily';
    if (type !== 'daily' && type !== 'quit') return;
    if ((next[h.id] || 0) !== 0) return;
    if ((skipsToday || []).includes(h.id)) return;
    if (isSatisfied && isSatisfied(h)) return;
    next[h.id] = 1;
    changedIds.push(h.id);
  });
  return { next, changedIds };
}

// True when "Mark the rest done" leaves out an unfinished habit due today because of its
// type: a counter (volume), a timer (timed) or a limit (atMost). Skipped habits do not
// count, since they are left out for a different reason. Drives the Today caption that
// explains why the button's count is lower than "N remaining".
export function markRestLeavesOutCounters(dueHabits, skipsToday = [], isSatisfied = null) {
  return (dueHabits || []).some(h => {
    const type = h.type || 'daily';
    if (type !== 'volume' && type !== 'timed' && type !== 'atMost') return false;
    if ((skipsToday || []).includes(h.id)) return false;
    return !(isSatisfied && isSatisfied(h));
  });
}

// Undo for "Mark the rest done" on day `key`: only the ids the action changed that are
// still at 1 go back to their `before` value (removed when they had no entry), so edits
// made inside the undo window (a decrement, another habit) survive. `before` may be
// undefined when the day had no entries; the day is then removed again if nothing else
// is left. Returns the new completions and the rows to sync (reverted ids, 0 when they
// had no entry, since sync has no per-row delete).
export function revertMarkRest(completions, key, before, changedIds) {
  const day = { ...((completions || {})[key] || {}) };
  const syncMap = {};
  (changedIds || []).forEach(id => {
    if (day[id] !== 1) return;
    if (before && Object.prototype.hasOwnProperty.call(before, id)) day[id] = before[id];
    else delete day[id];
    syncMap[id] = (before && before[id]) || 0;
  });
  const out = { ...(completions || {}) };
  if (before === undefined && Object.keys(day).length === 0) delete out[key];
  else out[key] = day;
  return { completions: out, syncMap };
}
