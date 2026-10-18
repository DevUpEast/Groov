// Streak milestones (7/30/100/365): which ones to record and which one to celebrate.
// Pure, so the rule is testable without the provider (M2 design gate, must-fix M3-1).
//
// - Every milestone the streak has reached that is not in `recorded` is recorded.
// - Only a rise caused by a check-off on today celebrates: `armed` (AppContext sets it on a
//   today action), a known previous streak (`prevStreak` is null on the first evaluation
//   after load), and a streak that went up across the milestone. The highest one crossed
//   is celebrated.
// - Everything else records silently: the first computation after load or a cloud pull
//   (returning users, fresh installs with history, the mockup demo), a pull or widget
//   check-off that raises the streak, a backdated past-day edit, a date change.
export function planMilestones({ streak, prevStreak = null, recorded = [], armed = false, milestones, today }) {
  const have = new Set((recorded || []).map(m => m.id));
  const reached = milestones.filter(m => streak >= m.days && !have.has(`streak-${m.days}`));
  const added = reached.map(m => ({ id: `streak-${m.days}`, days: m.days, date: today }));
  const rose = armed && prevStreak != null && streak > prevStreak;
  const crossed = rose ? reached.filter(m => m.days > prevStreak) : [];
  return { added, celebrate: crossed.length > 0 ? crossed[crossed.length - 1] : null };
}
