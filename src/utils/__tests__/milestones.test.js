import { planMilestones } from '../milestones';

const M = [7, 30, 100, 365].map(days => ({ days }));
const plan = (o) => planMilestones({ milestones: M, today: '2026-10-18', ...o });

test('first evaluation records every milestone passed, celebrates none', () => {
  const r = plan({ streak: 120, prevStreak: null, armed: true });
  expect(r.added.map(a => a.id)).toEqual(['streak-7', 'streak-30', 'streak-100']);
  expect(r.celebrate).toBeNull();
});

test('an armed rise across 7 celebrates 7', () => {
  const r = plan({ streak: 7, prevStreak: 6, armed: true });
  expect(r.added).toEqual([{ id: 'streak-7', days: 7, date: '2026-10-18' }]);
  expect(r.celebrate.days).toBe(7);
});

test('an unarmed rise (pull, past-day edit) records silently', () => {
  const r = plan({ streak: 31, prevStreak: 6, armed: false });
  expect(r.added.map(a => a.id)).toEqual(['streak-7', 'streak-30']);
  expect(r.celebrate).toBeNull();
});

test('an armed rise celebrates only milestones above the previous streak, the highest one', () => {
  expect(plan({ streak: 30, prevStreak: 6, armed: true }).celebrate.days).toBe(30);
  // 7 unrecorded but already passed before the action: recorded, not celebrated
  const r = plan({ streak: 12, prevStreak: 11, armed: true });
  expect(r.added.map(a => a.id)).toEqual(['streak-7']);
  expect(r.celebrate).toBeNull();
});

test('recorded milestones are never added or celebrated again', () => {
  const r = plan({ streak: 7, prevStreak: 6, armed: true, recorded: [{ id: 'streak-7' }] });
  expect(r).toEqual({ added: [], celebrate: null });
});

// ── C-08: small beats, the no-retroactive backfill, and the arm ─────────────────────────────
import { createMilestoneArm } from '../milestones';

const ALL = [{ days: 1, small: true }, { days: 3, small: true }, { days: 7 }, { days: 14, small: true }, { days: 30 }, { days: 100 }, { days: 365 }];
const planAll = (o) => planMilestones({ milestones: ALL, today: '2026-10-18', ...o });
const ids = (r) => r.added.map(a => a.id);

test('(a) the first evaluation of a 20-day streak marks 1, 3 and 14 silent; 21 fires none of them; 30 fires 30', () => {
  const load = planAll({ streak: 20, prevStreak: null, bestStreak: () => 20 });
  expect(ids(load)).toEqual(['streak-1', 'streak-3', 'streak-7', 'streak-14']);
  expect(load.added.filter(a => a.small).every(a => a.silent)).toBe(true);
  expect(load.celebrate).toBeNull();
  const recorded = load.added;
  expect(planAll({ streak: 21, prevStreak: 20, armed: true, recorded })).toEqual({ added: [], celebrate: null });
  const thirty = planAll({ streak: 30, prevStreak: 29, armed: true, recorded });
  expect(thirty.celebrate.days).toBe(30);
  expect(thirty.added).toEqual([{ id: 'streak-30', days: 30, date: '2026-10-18' }]);
});

test('small beats at or below the best streak are recorded silently on load, even with a short current streak', () => {
  const best = jest.fn(() => 20);
  const r = planAll({ streak: 2, prevStreak: null, bestStreak: best });
  expect(best).toHaveBeenCalledTimes(1);
  expect(ids(r)).toEqual(['streak-1', 'streak-3', 'streak-14']);
  // Big ones follow the current streak only: 7 waits for the streak in hand.
  expect(r.added.every(a => a.small && a.silent)).toBe(true);
});

test('the best streak is only computed when a small beat above the current streak is still open', () => {
  const best = jest.fn(() => 20);
  planAll({ streak: 2, prevStreak: 1, armed: true, bestStreak: best });
  planAll({ streak: 20, prevStreak: null, bestStreak: best });
  planAll({ streak: 2, prevStreak: null, bestStreak: best, recorded: [{ id: 'streak-1' }, { id: 'streak-3' }, { id: 'streak-14' }] });
  expect(best).not.toHaveBeenCalled();
});

test('Day 1: the first armed rise from 0 to 1 celebrates the small beat', () => {
  const r = planAll({ streak: 1, prevStreak: 0, armed: true, bestStreak: () => 0 });
  expect(r.celebrate).toMatchObject({ days: 1, small: true });
  expect(r.added).toEqual([{ id: 'streak-1', days: 1, date: '2026-10-18', small: true }]);
});

test('an armed rise across 3 celebrates the 3-day beat; across 14 the 14-day beat', () => {
  expect(planAll({ streak: 3, prevStreak: 2, armed: true, recorded: [{ id: 'streak-1' }] }).celebrate.days).toBe(3);
  const recorded = ['streak-1', 'streak-3', 'streak-7'].map(id => ({ id }));
  expect(planAll({ streak: 14, prevStreak: 13, armed: true, recorded }).celebrate).toMatchObject({ days: 14, small: true });
});

test('a fresh account loading with no history records nothing', () => {
  expect(planAll({ streak: 0, prevStreak: null, bestStreak: () => 0 })).toEqual({ added: [], celebrate: null });
});

describe('createMilestoneArm (the stale-run guard)', () => {
  const c0 = {}; const c1 = {}; const s0 = {}; const s1 = {};
  test('a run still on the armed state does not use the arm up', () => {
    const arm = createMilestoneArm();
    arm.arm({ completions: c0, skips: s0 });
    expect(arm.consume({ completions: c0, skips: s0 })).toBe(false);
    expect(arm.armed).toBe(true);
    expect(arm.consume({ completions: c1, skips: s0 })).toBe(true);
    expect(arm.armed).toBe(false);
    // A later pull finds it disarmed.
    expect(arm.consume({ completions: {}, skips: s0 })).toBe(false);
  });
  test('a change of today\'s skips consumes it too (Skip today, m2)', () => {
    const arm = createMilestoneArm();
    arm.arm({ completions: c0, skips: s0 });
    expect(arm.consume({ completions: c0, skips: s1 })).toBe(true);
  });
  test('never armed: never consumes', () => {
    expect(createMilestoneArm().consume({ completions: c1, skips: s1 })).toBe(false);
  });
});

test('createMilestoneArm hands the arm\'s meta to the run that consumes it (m5 deferred)', () => {
  const arm = createMilestoneArm();
  const c0 = {};
  arm.arm({ completions: c0 }, { deferred: true });
  expect(arm.consume({ completions: c0 })).toBe(false);
  expect(arm.consume({ completions: {} })).toEqual({ deferred: true });
  expect(arm.consume({ completions: {} })).toBe(false);
});
