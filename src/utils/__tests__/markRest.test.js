import { applyMarkRest, restoreDayCounts, restoreSyncMap, countAfterIncrement, isGoalMet } from '../habits';

const TODAY = '2026-10-17';
const habits = [
  { id: 'move', type: 'daily', volumeGoal: 1 },
  { id: 'read', type: 'daily', volumeGoal: 1 },
  { id: 'legacy', volumeGoal: 1 }, // no type = daily
  { id: 'sugar', type: 'quit', volumeGoal: 1 },
  { id: 'water', type: 'volume', volumeGoal: 8 },
  { id: 'stretch', type: 'timed', volumeGoal: 20 },
  { id: 'coffee', type: 'atMost', volumeGoal: 2 },
];

describe('applyMarkRest', () => {
  it('sets only untouched daily/quit habits to 1', () => {
    const before = { move: 1, water: 3 };
    const { next, changedIds } = applyMarkRest(before, habits, []);
    expect(changedIds).toEqual(['read', 'legacy', 'sugar']);
    expect(next).toEqual({ move: 1, water: 3, read: 1, legacy: 1, sugar: 1 });
  });

  it('(b) never touches counters or atMost limits, even at 0', () => {
    const before = { water: 3, stretch: 0, coffee: 0 };
    const { next } = applyMarkRest(before, habits, []);
    expect(next.water).toBe(3);
    expect(next.stretch).toBe(0);
    expect(next.coffee).toBe(0);
    expect('coffee' in next).toBe(true);
  });

  it('skips habits skipped today and habits already satisfied (perWeek target met)', () => {
    const satisfied = (h) => h.id === 'read';
    const { changedIds } = applyMarkRest({}, habits, ['sugar'], satisfied);
    expect(changedIds).toEqual(['move', 'legacy']);
  });

  it('does not mutate its input and changes nothing when all are touched', () => {
    const before = { move: 1, read: 1, legacy: 1, sugar: 1 };
    const copy = { ...before };
    const { next, changedIds } = applyMarkRest(before, habits, []);
    expect(changedIds).toEqual([]);
    expect(next).toEqual(before);
    expect(before).toEqual(copy);
  });

  it('handles a day with no entries yet', () => {
    const { next, changedIds } = applyMarkRest(undefined, habits.slice(0, 2), []);
    expect(changedIds).toEqual(['move', 'read']);
    expect(next).toEqual({ move: 1, read: 1 });
  });
});

describe('(a) Mark the rest then Undo restores the exact day', () => {
  it('deep-equals the previous counts, including a partial volume habit', () => {
    const completions = { '2026-10-16': { move: 1 }, [TODAY]: { water: 3, move: 0, stretch: 5 } };
    const before = completions[TODAY];
    const { next } = applyMarkRest(before, habits, []);
    const after = { ...completions, [TODAY]: next };
    const undone = restoreDayCounts(after, TODAY, before);
    expect(undone[TODAY]).toEqual({ water: 3, move: 0, stretch: 5 });
    expect(undone).toEqual(completions);
  });

  it('removes the day again when it had no entries before', () => {
    const completions = { '2026-10-16': { move: 1 } };
    const { next } = applyMarkRest(completions[TODAY], habits, []);
    const undone = restoreDayCounts({ ...completions, [TODAY]: next }, TODAY, completions[TODAY]);
    expect(undone).toEqual(completions);
  });

  it('syncs ids the action added back as 0 and keeps the previous values', () => {
    expect(restoreSyncMap({ water: 3, move: 1, read: 1 }, { water: 3 })).toEqual({ water: 3, move: 0, read: 0 });
    expect(restoreSyncMap({ move: 1 }, undefined)).toEqual({ move: 0 });
  });
});

describe('countAfterIncrement', () => {
  it('caps daily/quit at 1 and adds to counters', () => {
    expect(countAfterIncrement({ type: 'daily' }, 0)).toBe(1);
    expect(countAfterIncrement({ type: 'quit' }, 1)).toBe(1);
    expect(countAfterIncrement({ type: 'volume' }, 3, 1)).toBe(4);
    expect(countAfterIncrement({ type: 'timed' }, 5, 5)).toBe(10);
    expect(isGoalMet({ type: 'volume', volumeGoal: 8 }, countAfterIncrement({ type: 'volume' }, 7))).toBe(true);
  });
});
