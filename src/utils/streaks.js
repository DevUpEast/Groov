import { addDays } from './dates';

// Count consecutive "done" days ending at `startKey`, walking backwards one calendar
// day at a time. `isDoneOnDate(key)` decides whether a given local date key counts.
export function countBackStreak(startKey, isDoneOnDate) {
  let streak = 0;
  let key = startKey;
  while (isDoneOnDate(key)) {
    streak++;
    key = addDays(key, -1);
  }
  return streak;
}
