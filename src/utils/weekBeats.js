// The Today strip's 7-day beat row (C-04): one mark per day, oldest first, today last.
// Pure: AppContext's shared day rules feed `statusOf`, so a mark agrees with the streak.
import { addDays } from './dates';

// Past days: 'done' | 'rest' | 'missed' (overallDayStatus). Today: 'complete' (every
// scheduled habit done), 'rest' (nothing scheduled) or 'open' (still in play, never a miss).
// Days before `floor` (the first day any habit existed) are left out, so a new account
// shows only the days it has had.
export function buildWeekBeats({ today, days = 7, floor = null, statusOf, todayState }) {
  const beats = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = addDays(today, -i);
    if (floor && key < floor && key !== today) continue;
    if (key === today) beats.push({ key, status: todayState, today: true });
    else beats.push({ key, status: statusOf(key), today: false });
  }
  return beats;
}

// Counts for the row's accessibility label. Today counts as done only when complete and as
// rest only on a rest day; an open today is neither (and never a miss).
export function summarizeBeats(beats) {
  let done = 0, rest = 0, missed = 0;
  for (const b of beats) {
    if (b.status === 'done' || b.status === 'complete') done++;
    else if (b.status === 'rest') rest++;
    else if (b.status === 'missed') missed++;
  }
  return { days: beats.length, done, rest, missed };
}
