// The Groov sound kit as data (plan §2.11). Pure: the app (src/utils/sounds.js, via
// src/services/feedback.js), the jest tests and scripts/render-sound-kit.mjs all read it.
// Feedback from Isaac's listening page becomes a parameter edit here; cached WAVs on the device
// are keyed by a hash of each definition, so an edit re-renders them automatically.
import { renderSound, mix, encodeWav, SAMPLE_RATE } from './synth.js';

export const NOTE = Object.freeze({
  C5: 523.25, D5: 587.33, E5: 659.26, G5: 783.99, A5: 880.0,
  C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, C7: 2093.0,
});

/** The one pitch ladder: C-major pentatonic, C5 … G6. */
export const LADDER = Object.freeze([
  NOTE.C5, NOTE.D5, NOTE.E5, NOTE.G5, NOTE.A5, NOTE.C6, NOTE.D6, NOTE.E6, NOTE.G6,
]);

/** Ladder index of the n-th habit done today: H(n) = L[min(n, 8) − 1]. */
export function habitDegree(n) {
  const k = Math.max(1, Math.min(8, Math.floor(Number(n) || 1)));
  return k - 1;
}

/**
 * Ladder index of counter step k of goal G: round((k − 1) × 5 / max(G − 1, 1)), spread over
 * C5 … C6 (degrees 0–5). Monotonic non-decreasing in k; k = G is degree 5 (C6), and the goal
 * step then adds degree 7 (E6) on top, so the goal is the highest note of the habit's ladder.
 */
export function counterDegree(k, G) {
  const goal = Math.max(1, Number(G) || 1);
  const step = Math.max(1, Math.min(goal, Number(k) || 1));
  if (step >= goal) return 5; // the goal is always C6 (also for G = 1, where the formula gives 0)
  return Math.round(((step - 1) * 5) / Math.max(goal - 1, 1));
}

export const GOAL_DEGREES = Object.freeze([5, 7]); // C6 then E6, 62 ms apart

const notes = (...list) => list.map(([freq, atMs]) => ({ freq, atMs }));

function buildDefs() {
  const defs = {};
  for (let n = 1; n <= 8; n++) {
    defs[`habit-${n}`] = { notes: notes([LADDER[habitDegree(n)], 0]), tau: 0.35, capMs: 450, levelDb: -18 };
  }
  for (let d = 0; d <= 5; d++) {
    defs[`counter-${d}`] = { notes: notes([LADDER[d], 0]), tau: 0.18, capMs: 250, levelDb: -22 };
  }
  defs.goal = { notes: notes([LADDER[GOAL_DEGREES[0]], 0], [LADDER[GOAL_DEGREES[1]], 62]), tau: 0.35, capMs: 450, levelDb: -18 };
  defs.over = { notes: notes([NOTE.E6, 0]), tau: 0.18, capMs: 250, levelDb: -26 };
  defs.undone = { notes: notes([NOTE.E5, 0], [NOTE.C5, 62]), tau: 0.15, capMs: 250, levelDb: -24 };
  // Plays at the challenge.claimed beat (+250), so the notes land at 250 / 312 / 375 ms.
  defs.challenge = { notes: notes([NOTE.G5, 0], [NOTE.C6, 62], [NOTE.E6, 125]), tau: 0.25, capMs: 600, levelDb: -20 };
  // Each voice is about −26 dBFS; the sum peaks at −18.
  defs.chord = { notes: notes([NOTE.C5, 0], [NOTE.E5, 0], [NOTE.G5, 0], [NOTE.C6, 0]), tau: 0.6, capMs: 900, levelDb: -18 };
  defs.fanfare = {
    notes: notes(
      [NOTE.C5, 0], [NOTE.E5, 125], [NOTE.G5, 250], [NOTE.C6, 375], [NOTE.E6, 500],
      [NOTE.C6, 625], [NOTE.E6, 625], [NOTE.G6, 625], [NOTE.C7, 625],
    ),
    tau: 0.5, capMs: 1200, levelDb: -18,
  };
  Object.values(defs).forEach(d => { Object.freeze(d.notes); Object.freeze(d); });
  return Object.freeze(defs);
}

/** Every sound the app can play, by id. */
export const SOUND_DEFS = buildDefs();

/**
 * Every feedback event (src/services/feedback.js EVENTS values) → its sound family, or null
 * for explicit silence. A test checks this covers every event.
 */
export const EVENT_SOUNDS = Object.freeze({
  'press': null,
  'habit.done': 'habit', // H(n), or the two-note goal step for a counter
  'counter.step': 'counter', // C(k, G), or E6 quietly past the goal
  'habit.undone': 'undone',
  'challenge.claimed': 'challenge',
  'day.complete': 'chord',
  'milestone': 'fanfare',
  'trophy': 'fanfare',
  'markRest': 'chord', // once, never N chimes
  'sound.preview': 'preview', // Settings → Sounds switched on: one H(1)
  'selection': null,
  'toggle.on': null,
  'toggle.off': null,
  'longPress': null,
  'refused': null,
  'error': null,
  'destructiveConfirm': null,
});

/**
 * The sound id for an event. ctx: { n } habits done today including this one (habit.done from a
 * daily tap), or { step, goal } for a counter (counter.step, and habit.done on the goal step).
 */
export function soundIdFor(event, ctx = {}) {
  const family = EVENT_SOUNDS[event];
  if (!family) return null;
  const hasGoal = ctx.goal != null && Number(ctx.goal) > 0;
  switch (family) {
    case 'habit':
      return hasGoal ? 'goal' : `habit-${habitDegree(ctx.n) + 1}`;
    case 'counter':
      if (hasGoal && Number(ctx.step) > Number(ctx.goal)) return 'over';
      return `counter-${hasGoal ? counterDegree(ctx.step, ctx.goal) : 0}`;
    case 'preview':
      return 'habit-1';
    default:
      return family;
  }
}

/** The 12 listening WAVs (plan F-04b (b)); the day sequence is written next to them. */
export const LISTENING_SET = Object.freeze([
  { file: '01-habit-done-1st.wav', id: 'habit-1', label: 'habit.done, 1st habit of the day (C5)' },
  { file: '02-habit-done-4th.wav', id: 'habit-4', label: 'habit.done, 4th habit (G5)' },
  { file: '03-habit-done-8th.wav', id: 'habit-8', label: 'habit.done, 8th habit and later (E6)' },
  { file: '04-counter-step-1-of-8.wav', id: `counter-${counterDegree(1, 8)}`, label: 'counter.step 1 of 8 (C5)' },
  { file: '05-counter-step-4-of-8.wav', id: `counter-${counterDegree(4, 8)}`, label: 'counter.step 4 of 8 (E5)' },
  { file: '06-counter-step-7-of-8.wav', id: `counter-${counterDegree(7, 8)}`, label: 'counter.step 7 of 8 (A5)' },
  { file: '07-counter-goal.wav', id: 'goal', label: 'habit.done on the counter goal step (C6 then E6)' },
  { file: '08-counter-past-goal.wav', id: 'over', label: 'counter.step past the goal (E6, quiet)' },
  { file: '09-habit-undone.wav', id: 'undone', label: 'habit.undone (E5 then C5)' },
  { file: '10-challenge-claimed.wav', id: 'challenge', label: 'challenge.claimed (G5 C6 E6)' },
  { file: '11-day-complete.wav', id: 'chord', label: 'day.complete and Mark the rest (C major chord)' },
  { file: '12-milestone.wav', id: 'fanfare', label: 'milestone and trophy (arpeggio, chord an octave up)' },
]);

export const DAY_FILE = '13-a-day.wav';

/** "A day in 10 seconds": 4 habits, a water counter to 8, then the resolution chord at +750. */
export function daySequence() {
  const seq = [];
  for (let n = 1; n <= 4; n++) seq.push({ id: soundIdFor('habit.done', { n }), atMs: (n - 1) * 1200 });
  const waterStart = 4800;
  for (let k = 1; k <= 7; k++) seq.push({ id: soundIdFor('counter.step', { step: k, goal: 8 }), atMs: waterStart + (k - 1) * 450 });
  const goalAt = waterStart + 7 * 450;
  seq.push({ id: soundIdFor('habit.done', { goal: 8 }), atMs: goalAt });
  seq.push({ id: soundIdFor('day.complete'), atMs: goalAt + 750 });
  return seq;
}

/** Render every listening file: [{ name, bytes }] (WAV bytes). Deterministic. */
export function renderKitFiles(sampleRate = SAMPLE_RATE) {
  const cache = {};
  const get = (id) => (cache[id] = cache[id] || renderSound(SOUND_DEFS[id], sampleRate));
  const files = LISTENING_SET.map(({ file, id }) => ({ name: file, bytes: encodeWav(get(id), sampleRate) }));
  const seq = daySequence();
  const last = seq[seq.length - 1];
  const total = last.atMs + SOUND_DEFS[last.id].capMs + 200;
  const day = mix(seq.map(s => ({ samples: get(s.id), atMs: s.atMs })), total, sampleRate);
  files.push({ name: DAY_FILE, bytes: encodeWav(day, sampleRate) });
  return files;
}
