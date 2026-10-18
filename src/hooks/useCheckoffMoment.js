import { useCallback, useEffect, useMemo, useRef } from 'react';
import feedback from '../services/feedback';
import { useReducedMotion } from '../utils/a11y';
import { planBeats, mergeBeats } from '../utils/beats';
import { expectBeat, emitBeat, cancelBeat } from '../utils/beatBus';

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
export default function useCheckoffMoment({ onBeat } = {}) {
  const reduced = useReducedMotion();
  const pending = useRef([]);
  const onBeatRef = useRef(onBeat);
  onBeatRef.current = onBeat;

  const schedule = useCallback((item, tapAt) => {
    if (item.channel === 'feedback') {
      return feedback.play(item.event, { ...(item.opts || {}), delay: item.at, at: tapAt });
    }
    const visual = { ...item, tapAt };
    const fire = () => {
      try { emitBeat(visual); } catch { /* a visual never breaks the moment */ }
      try { onBeatRef.current?.(visual); } catch { /* a visual never breaks the moment */ }
    };
    const wait = tapAt + item.at - Date.now();
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
    const added = items.map((item) => ({ ...item, tapAt, handle: schedule(item, tapAt) }));
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
