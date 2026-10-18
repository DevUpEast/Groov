// Streak milestones: which ones to record and which one to celebrate. Pure, so the rule is
// testable without the provider (M2 design gate, must-fix M3-1; C-08).
//
// Two kinds share one list (`milestones`, each `{ days, small? }`):
// - the big ones (7/30/100/365) get the full-screen milestone screen and the trophy case;
// - the small beats (1 = "Day 1", 3, 14; `small: true`) are a line in the Today strip and never
//   appear in the trophy case.
//
// - Every milestone the streak has reached that is not in `recorded` is recorded.
// - Only a rise caused by a user action on today celebrates: `armed` (AppContext arms it on a
//   today check-off, un-check, Mark the rest, a skip of today, and a notification or deep-link
//   Done that arrives while the app is in the foreground), a known previous streak
//   (`prevStreak` is null on the first evaluation after load), and a streak that went up across
//   the milestone. The highest one crossed is celebrated.
// - Everything else records silently: the first computation after load or a cloud pull
//   (returning users, fresh installs with history, the mockup demo), a pull or widget check-off
//   that raises the streak, a backdated past-day edit, a date change.
// - No retroactive small beats (plan C-08 CEL-4): on the first evaluation after load, a small
//   beat at or below the best streak ever (`bestStreak()`, called only when such a beat is still
//   unrecorded) is recorded with `silent: true`, so someone whose best run was 20 days never
//   hears "3 days in a row" or "Day 1" when they start again. Big milestones keep the current
//   streak rule, so the trophy case only lists what the streak in hand has reached.
export function planMilestones({ streak, prevStreak = null, recorded = [], armed = false, milestones, today, bestStreak = null }) {
  const have = new Set((recorded || []).map(m => m.id));
  const open = milestones.filter(m => !have.has(milestoneId(m)));
  const first = prevStreak == null;
  let best = streak;
  if (first && typeof bestStreak === 'function' && open.some(m => m.small && m.days > streak)) {
    best = Math.max(streak, bestStreak() || 0);
  }
  const reached = open.filter(m => streak >= m.days || (first && m.small && best >= m.days));
  const rose = armed && !first && streak > prevStreak;
  const crossed = rose ? reached.filter(m => m.days > prevStreak && streak >= m.days) : [];
  const top = crossed.length > 0 ? crossed.reduce((a, b) => (b.days > a.days ? b : a)) : null;
  const added = reached.map((m) => {
    const entry = { id: milestoneId(m), days: m.days, date: today };
    if (m.small) entry.small = true;
    if (m !== top) entry.silent = true;
    return entry;
  });
  return { added, celebrate: top };
}

export const milestoneId = (m) => `streak-${m.days}`;

/**
 * The arm for planMilestones (fix/no-retroactive-milestones, the stale-run guard). A today
 * action arms it with the state it started from; the milestone effect consumes it on its first
 * run that sees a newer state (completions or today's skips), so a run still on the old state
 * cannot use it up, and a later pull never finds it armed.
 */
export function createMilestoneArm() {
  let before = null;
  let info = null;
  return {
    // `meta` rides along to the run that consumes the arm (`{ deferred: true }`: a
    // notification Done from the background, celebrated on the next foreground).
    arm(state, meta = null) { before = state; info = meta; },
    // The arm's meta, or true, (and disarmed) when `state` differs from the armed one in any
    // tracked key; false otherwise.
    consume(state) {
      if (!before) return false;
      const changed = Object.keys(before).some(k => before[k] !== state[k]);
      if (!changed) return false;
      const out = info || true;
      before = null;
      info = null;
      return out;
    },
    get armed() { return !!before; },
  };
}
