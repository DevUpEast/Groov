import { useCallback, useEffect, useMemo, useRef } from 'react';
import feedback from '../services/feedback';
import { useReducedMotion } from '../utils/a11y';
import { planBeats, mergeBeats } from '../utils/beats';
import { expectBeat, emitBeat, cancelBeat } from '../utils/beatBus';
import { beat } from '../theme/motion';

// Runs the check-off moment (plan §4.1 / §4.2, C-06a). TodayScreen calls `run(action)` in the
// same tick as the data change (data → claim → beats, never awaited). The pure planner
// (src/utils/beats.js) decides the beats; this hook:
// - plays each feedback item through feedback.play with an explicit delay counted from the tap
//   (`at: tapAt`), so a busy JS thread shows up as drift in the Feedback log instead of moving
//   the beat's reference point;
// - hands each visual beat to the beat bus (src/utils/beatBus.js: HabitCard and TodayHeader
//   animate on it, C-06b) and to `onBeat(item)` when it is due; the item carries `tapAt`;
// - cancels and coalesces pending beats (an un-check takes back that habit's beats and any
//   pending resolution);
// - cancels everything still pending on unmount.
// See schedule(): a visual beat fires this long after the feedback of the same beat.
export const VISUAL_AFTER_FEEDBACK_MS = 2;

export default function useCheckoffMoment({ onBeat } = {}) {
  const reduced = useReducedMotion();
  const pending = useRef([]);
  const onBeatRef = useRef(onBeat);
  onBeatRef.current = onBeat;

  const schedule = useCallback((item, tapAt, afterFeedback = false) => {
    if (item.channel === 'feedback') {
      return feedback.play(item.event, { ...(item.opts || {}), delay: item.at, at: tapAt });
    }
    const visual = { ...item, tapAt };
    const fire = () => {
      try { emitBeat(visual); } catch { /* a visual never breaks the moment */ }
      try { onBeatRef.current?.(visual); } catch { /* a visual never breaks the moment */ }
    };
    // A visual due with a feedback event (the resolution and the day.complete haptic + chord
    // at +750) fires just after it: equal deadlines run in no set order on Android, and the
    // visual's work (the gold sweep's first frame, RingBurst, the ring pulse) must not delay
    // the haptic (C-07 review M2).
    const wait = tapAt + item.at - Date.now() + (afterFeedback ? VISUAL_AFTER_FEEDBACK_MS : 0);
    if (wait <= 0) { fire(); return { cancel() {} }; }
    expectBeat(visual);
    const timer = setTimeout(fire, wait);
    return { cancel() { clearTimeout(timer); cancelBeat(visual); } };
  }, []);

  const run = useCallback((action) => {
    const tapAt = typeof action?.tapAt === 'number' ? action.tapAt : Date.now();
    const plan = planBeats({ ...action, reduced });
    const { cancel, keep, items } = mergeBeats(pending.current, plan, Date.now());
    // The new beats first, then the cancels: a component waiting on a coalesced beat (the ring
    // retargeting) finds its replacement pending and keeps waiting instead of jumping.
    // Feedback deadlines of this plan (an event's own beat, and Mark the rest's chord, which
    // rides on its markRest event at +750).
    const fbAt = new Set();
    items.forEach((i) => { if (i.channel === 'feedback') { fbAt.add(i.at); if (i.event === 'markRest') fbAt.add(beat.b4b8); } });
    const added = items.map((item) => ({
      ...item, tapAt, handle: schedule(item, tapAt, item.channel === 'visual' && item.at > 0 && fbAt.has(item.at)),
    }));
    cancel.forEach((p) => { try { p.handle.cancel(); } catch {} });
    pending.current = [...keep, ...added];
    return plan;
  }, [reduced, schedule]);

  const cancelAll = useCallback(() => {
    pending.current.forEach((p) => { try { p.handle.cancel(); } catch {} });
    pending.current = [];
  }, []);

  useEffect(() => cancelAll, [cancelAll]);

  return useMemo(() => ({ run, cancelAll }), [run, cancelAll]);
}
