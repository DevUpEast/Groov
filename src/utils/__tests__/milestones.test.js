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
