// Habit types (#38) and the single rule for "did this habit meet its goal on a day".
//
//   daily   one check a day                 done when count >= 1
//   volume  N units a day (can exceed)      done when count >= volumeGoal
//   timed   N minutes a day (can exceed)    done when count >= volumeGoal (minutes)
//   quit    avoid something                 done when the user marks the day avoided (count >= 1)
//   atMost  stay at or under a limit        done when count <= volumeGoal (an untouched day counts)

export const HABIT_TYPES = [
  { value: 'daily', label: 'Once a day', emoji: '✓', hint: 'Tick it off once' },
  { value: 'volume', label: 'Volume goal', emoji: '🔢', hint: 'Count up to a target' },
  { value: 'timed', label: 'Timed', emoji: '⏱️', hint: 'Minutes per day' },
  { value: 'quit', label: 'Quit habit', emoji: '🚫', hint: 'Stay clean each day' },
  { value: 'atMost', label: 'Limit', emoji: '📉', hint: 'Stay at or under a max' },
];

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
  if (habit?.type === 'timed') return 'min';
  return habit?.unit || '';
}

// Short goal text for lists and sheets.
export function describeGoal(habit) {
  const u = unitLabel(habit);
  switch (habit?.type) {
    case 'volume': return `${habit.volumeGoal} ${u || '×'} / day`;
    case 'timed': return `${habit.volumeGoal} min / day`;
    case 'quit': return 'Avoid daily';
    case 'atMost': return `≤ ${habit.volumeGoal} ${u || '×'} / day`;
    default: return 'Daily';
  }
}

// Progress text on the Today card.
export function describeProgress(habit, count) {
  const u = unitLabel(habit);
  switch (habit?.type) {
    case 'volume': return `${count}/${habit.volumeGoal} ${u || 'today'}`;
    case 'timed': return `${count}/${habit.volumeGoal} min`;
    case 'atMost': return count > habit.volumeGoal ? `${count}/${habit.volumeGoal} ${u} · over limit`.replace('  ', ' ') : `${count}/${habit.volumeGoal} ${u || 'max'}`.replace('  ', ' ');
    case 'quit': return count >= 1 ? 'Avoided today' : null;
    default: return null;
  }
}

// Challenge templates (#38): quick presets for the challenge form.
export const CHALLENGE_TEMPLATES = [
  { key: '7', name: '7-Day Reset', days: 7, icon: '🔥', description: 'One week of showing up every day. Small, fast, doable.' },
  { key: '21', name: '21-Day Habit Builder', days: 21, icon: '🌱', description: 'Three weeks to make it feel normal.' },
  { key: '30', name: '30-Day Challenge', days: 30, icon: '🎯', description: 'A full month. Miss a day, keep going.' },
  { key: '66', name: '66-Day Automatic', days: 66, icon: '🧠', description: 'The average time for a behaviour to become automatic.' },
  { key: '100', name: '100-Day Streak', days: 100, icon: '💎', description: 'The big one. Triple digits.' },
];

// Starter habits offered during onboarding (also used by the web mockup's demo seed).
export const STARTER_HABITS = [
  { key: 'water', name: 'Drink water', icon: '💧', type: 'volume', volumeGoal: 8, unit: 'glasses', timeOfDay: 'anytime', color: '#3B82F6' },
  { key: 'move', name: 'Move for 20 minutes', icon: '🏃', type: 'daily', volumeGoal: 1, timeOfDay: 'morning', color: '#F97316' },
  { key: 'read', name: 'Read 10 pages', icon: '📚', type: 'daily', volumeGoal: 1, timeOfDay: 'evening', color: '#A855F7' },
  { key: 'meditate', name: 'Meditate', icon: '🧘', type: 'daily', volumeGoal: 1, timeOfDay: 'morning', color: '#14B8A6' },
  { key: 'walk', name: 'Take a walk', icon: '🚶', type: 'daily', volumeGoal: 1, timeOfDay: 'afternoon', color: '#22C55E' },
  { key: 'sleep', name: 'In bed by 11', icon: '😴', type: 'daily', volumeGoal: 1, timeOfDay: 'evening', color: '#6366F1' },
  { key: 'journal', name: 'Journal', icon: '✍️', type: 'daily', volumeGoal: 1, timeOfDay: 'evening', color: '#EC4899' },
  { key: 'stretch', name: 'Stretch', icon: '🤸', type: 'daily', volumeGoal: 1, timeOfDay: 'morning', color: '#EAB308' },
];
