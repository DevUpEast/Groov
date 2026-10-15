import { buildTodayModel } from '../widgetData';

jest.mock('../../utils/storage', () => ({ loadData: jest.fn(), saveData: jest.fn() }));

describe('buildTodayModel', () => {
  const habits = [
    { id: 'a', name: 'Water', type: 'volume', volumeGoal: 8, sortOrder: 1 },
    { id: 'b', name: 'Read', type: 'daily', volumeGoal: 1, sortOrder: 0 },
    { id: 'c', name: 'Gym', type: 'daily', volumeGoal: 1, schedule: { type: 'weekdays', days: [1] }, sortOrder: 2 },
    { id: 'd', name: 'Old', type: 'daily', archived: true },
  ];
  it('lists only active habits scheduled today, in order, with done flags', () => {
    // 2026-10-14 is a Wednesday, so Gym (Mondays) is off.
    const m = buildTodayModel(habits, { '2026-10-14': { a: 8 } }, { theme: 'dark' }, '2026-10-14');
    expect(m.rows.map(r => r.id)).toEqual(['b', 'a']);
    expect(m.rows[1]).toMatchObject({ count: 8, goal: 8, done: true });
    expect(m.rows[0].done).toBe(false);
    expect(m.done).toBe(1);
    expect(m.total).toBe(2);
    expect(m.theme).toBe('dark');
  });
  it('handles an empty day', () => {
    const m = buildTodayModel([], {}, {}, '2026-10-14');
    expect(m.rows).toEqual([]);
    expect(m.total).toBe(0);
  });
});

import { rowsForHeight } from '../widgetData';
describe('rowsForHeight', () => {
  it('scales with the widget height and clamps', () => {
    expect(rowsForHeight(110)).toBe(1);
    expect(rowsForHeight(210)).toBe(4);
    expect(rowsForHeight(400)).toBe(8);
    expect(rowsForHeight(undefined)).toBe(1);
  });
});
