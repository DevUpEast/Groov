// Mood check-in (#32): one optional 1-5 rating per day, kept separately from
// completions. Insights are simple averages, no AI.

import { t } from '../i18n';

const MOOD_DEFS = [
  { value: 1, emoji: '😞', key: 'rough' },
  { value: 2, emoji: '😕', key: 'meh' },
  { value: 3, emoji: '😐', key: 'okay' },
  { value: 4, emoji: '🙂', key: 'good' },
  { value: 5, emoji: '😄', key: 'great' },
];

// Labels are translated on read so a locale change applies without a reload.
export const MOODS = MOOD_DEFS.map(d => ({
  value: d.value, emoji: d.emoji,
  get label() { return t(`mood.${d.key}`); },
}));

export const MIN_SAMPLES = 3;

export function moodEmoji(value) {
  return MOODS.find(m => m.value === value)?.emoji ?? '·';
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

// Overall mood stats over the days that have a rating.
//   { count, average, perfectAvg, otherAvg, perfectCount, otherCount }
// `isPerfect(key)` says whether every scheduled habit was done that day.
export function moodSummary(moods, isPerfect) {
  const entries = Object.entries(moods || {}).filter(([, v]) => v >= 1 && v <= 5);
  const perfect = [], other = [];
  for (const [key, v] of entries) (isPerfect(key) ? perfect : other).push(v);
  return {
    count: entries.length,
    average: round1(avg(entries.map(([, v]) => v))),
    perfectAvg: round1(avg(perfect)), perfectCount: perfect.length,
    otherAvg: round1(avg(other)), otherCount: other.length,
  };
}

// Per-habit mood difference: average mood on days the habit was done minus days it
// was not (only days with a rating, only habits with enough samples on both sides).
// Returns [{ habitId, name, icon, doneAvg, missedAvg, delta, doneCount, missedCount }]
// sorted by |delta| descending.
export function habitMoodCorrelations(moods, habits, isDoneOn, { minSamples = MIN_SAMPLES } = {}) {
  const days = Object.entries(moods || {}).filter(([, v]) => v >= 1 && v <= 5);
  const out = [];
  for (const h of habits || []) {
    const done = [], missed = [];
    for (const [key, v] of days) (isDoneOn(h, key) ? done : missed).push(v);
    if (done.length < minSamples || missed.length < minSamples) continue;
    const d = avg(done), m = avg(missed);
    out.push({ habitId: h.id, name: h.name, icon: h.icon, doneAvg: round1(d), missedAvg: round1(m), delta: round1(d - m), doneCount: done.length, missedCount: missed.length });
  }
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

// Human sentence for the strongest correlation, or null when nothing is significant.
export function describeCorrelation(c) {
  if (!c || Math.abs(c.delta) < 0.3) return null;
  return t(c.delta > 0 ? 'mood.correlationBetter' : 'mood.correlationWorse', { name: c.name, done: c.doneAvg, missed: c.missedAvg });
}
