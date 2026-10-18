// Pure helpers for the habit form (HabitsScreen): the edit form's initial state, the colour
// pick and the save payload. Kept out of the screen so the colour storage rule is testable.
//
// Colour rule (C-01, plan §2.3): `form.color` holds the habit's stored value untouched. The
// colour row shows the accent that value resolves to (display only), and only an explicit
// tap writes a new value: the picked accent's light-fill hex. A legacy colour such as
// #EAB308 therefore survives an edit of the name, and older app versions (which draw
// `habit.color` raw) keep seeing a valid 6-digit hex.
import { DEFAULT_SCHEDULE } from './schedule';
import { DEFAULT_ACCENT_HEX, accentIdFor, storedHexFor } from '../theme/accents';

export const BLANK_FORM = {
  name: '', icon: '⭐', type: 'daily', volumeGoal: 3, customIconUri: null, schedule: DEFAULT_SCHEDULE,
  color: DEFAULT_ACCENT_HEX, timeOfDay: 'anytime', unit: '', intention: '',
};

export function formFromHabit(habit) {
  return {
    name: habit.name, icon: habit.icon, type: habit.type, volumeGoal: habit.volumeGoal, customIconUri: habit.customIconUri ?? null,
    schedule: habit.schedule ?? DEFAULT_SCHEDULE, color: habit.color ?? null, timeOfDay: habit.timeOfDay ?? 'anytime', unit: habit.unit ?? '',
    intention: habit.intention ?? '',
  };
}

// The accent dot the colour row marks as selected.
export const selectedAccentId = (form) => accentIdFor(form.color);

// An explicit pick: store the accent's light-fill hex.
export const pickAccent = (form, id) => ({ ...form, color: storedHexFor(id) });

// A colour proposed by Magic Fill (suggest-habit). A stale deployment may still return a
// legacy hex, so it is normalised to a curated one; no colour keeps the current pick.
export const suggestedColor = (color, current) => (color ? storedHexFor(accentIdFor(color)) : current);

// The habit fields handleSave passes to addHabit / updateHabit. `color` is form.color as is.
export function habitFromForm(form) {
  return {
    ...form,
    name: form.name.trim(),
    unit: form.type === 'volume' || form.type === 'atMost' ? (form.unit || '').trim() || null : null,
    intention: (form.intention || '').trim() || null,
    volumeGoal: form.type === 'daily' || form.type === 'quit' ? 1
      : form.type === 'atMost' ? Math.max(0, Number(form.volumeGoal) || 0)
      : Math.max(1, Number(form.volumeGoal) || 1),
  };
}
