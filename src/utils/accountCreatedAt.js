// The account's first day (YYYY-MM-DD, local). Perfect Days, the heat map, the bar
// chart and the habit detail grid hide everything before it, and makeDayRules
// (utils/dayStatus.js) falls back to it when no habit has a createdAt.
//
// It is the earliest of:
//   - `stored`: the value already on the device (null after an account switch),
//   - the earliest date with a logged completion (a positive count),
//   - the earliest habit createdAt,
// never later than `today` and never in the future. With no evidence at all it is
// `today`. Because it only ever takes a minimum, applying it again with more data
// (a delta pull) can lower the value to real history but never raise it.
import { isDateKey, localDateKey } from './dates';

// A date key as is; a timestamp becomes its LOCAL calendar day (never the UTC slice).
const dayOf = (value) => {
  if (typeof value !== 'string') return null;
  if (isDateKey(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : localDateKey(d);
};

export function earliestCompletionDate(completions) {
  let min = null;
  for (const [key, day] of Object.entries(completions || {})) {
    if (!isDateKey(key)) continue;
    const logged = day && Object.values(day).some(n => n > 0);
    if (logged && (min === null || key < min)) min = key;
  }
  return min;
}

export function deriveAccountCreatedAt({ stored = null, completions = null, habits = null, today = localDateKey() } = {}) {
  const candidates = [
    dayOf(stored),
    earliestCompletionDate(completions),
    ...(habits || []).map(h => dayOf(h?.createdAt)),
  ].filter(k => isDateKey(k) && k <= today);
  return candidates.length ? candidates.sort()[0] : today;
}
