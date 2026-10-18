import { useCallback, useEffect, useRef, useState } from 'react';
import { beat } from '../theme/motion';
import { MOMENT_MS } from '../utils/beats';
import { findBeat } from '../utils/beatBus';

/**
 * The order of Today's full-screen celebrations (plan §4.1 row 9; C-07, review M1 / m2).
 *
 * - The trophy opens on the beat grid: `openTrophyAt(tapAt, at)` (+500 after a check-off that
 *   completed a challenge, +1500 when the same check also completed the day).
 * - A streak milestone (`pendingMilestone`, set by AppContext once the day is complete) waits
 *   for the end of the check-off moment (the latest resolution beat + MOMENT_MS), or a beat
 *   after the credit would have landed (+875) outside a moment.
 * - The trophy owns the sequence: while its timer is armed or it is up, the milestone waits;
 *   when the trophy's timer fires it clears any milestone timer that shares its deadline (RN
 *   delivers expired timers in one batch, so both used to open together at +1500), and the
 *   milestone follows once the trophy has closed (`trophyDone`, the close-callback chain).
 * - `active`: Today is the visible tab. The milestone screen lives inside the Today slot, so it
 *   waits for Today to be shown instead of playing off screen.
 *
 * `onMilestone(milestone)` shows it (TodayScreen: screen state + the milestone feedback).
 */
export default function useCelebrationQueue({ pendingMilestone, clearPendingMilestone, active = true, onMilestone }) {
  const [trophyCelebrating, setTrophyCelebrating] = useState(false);
  const trophyTimer = useRef(null);
  const milestoneTimer = useRef(null);
  const afterTrophy = useRef(false);
  const onMilestoneRef = useRef(onMilestone);
  onMilestoneRef.current = onMilestone;
  const clearRef = useRef(clearPendingMilestone);
  clearRef.current = clearPendingMilestone;

  const openTrophyAt = useCallback((tapAt, at) => {
    clearTimeout(trophyTimer.current);
    trophyTimer.current = setTimeout(() => {
      trophyTimer.current = null;
      clearTimeout(milestoneTimer.current);
      milestoneTimer.current = null;
      setTrophyCelebrating(true);
    }, Math.max(0, tapAt + at - Date.now()));
  }, []);

  const trophyDone = useCallback(() => {
    afterTrophy.current = true;
    setTrophyCelebrating(false);
  }, []);

  useEffect(() => {
    // The trophy first: its timer firing (trophyCelebrating) and closing re-run this effect.
    if (!pendingMilestone || trophyCelebrating || trophyTimer.current || !active) return undefined;
    const hit = findBeat({ beat: 'resolution' });
    const wait = hit ? Math.max(0, hit.item.tapAt + MOMENT_MS - Date.now()) : (afterTrophy.current ? 0 : beat.b4b8b16);
    afterTrophy.current = false;
    const milestone = pendingMilestone;
    milestoneTimer.current = setTimeout(() => {
      milestoneTimer.current = null;
      if (trophyTimer.current) return; // a trophy was armed meanwhile: it goes first
      onMilestoneRef.current?.(milestone);
      clearRef.current?.();
    }, wait);
    return () => { clearTimeout(milestoneTimer.current); milestoneTimer.current = null; };
  }, [pendingMilestone, trophyCelebrating, active]);

  useEffect(() => () => { clearTimeout(trophyTimer.current); clearTimeout(milestoneTimer.current); }, []);

  return { trophyCelebrating, setTrophyCelebrating, openTrophyAt, trophyDone };
}
