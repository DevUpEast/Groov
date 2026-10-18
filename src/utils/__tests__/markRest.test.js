import { applyMarkRest, revertMarkRest, countAfterIncrement, isGoalMet } from '../habits';

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
  // Mark the rest + Undo, as AppContext runs them.
  const markThenUndo = (completions, edit = (c) => c) => {
    const before = completions[TODAY];
    const { next, changedIds } = applyMarkRest(before, habits, []);
    const marked = edit({ ...completions, [TODAY]: next });
    return revertMarkRest(marked, TODAY, before, changedIds);
  };

  it('deep-equals the previous counts when nothing else changed, including a partial volume habit', () => {
    const completions = { '2026-10-16': { move: 1 }, [TODAY]: { water: 3, move: 0, stretch: 5 } };
    const { completions: undone, syncMap } = markThenUndo(completions);
    expect(undone[TODAY]).toEqual({ water: 3, move: 0, stretch: 5 });
    expect(undone).toEqual(completions);
    // Only the habits the action marked are written back (0 where there was no entry).
    expect(syncMap).toEqual({ move: 0, read: 0, legacy: 0, sugar: 0 });
  });

  it('removes the day again when it had no entries before', () => {
    const completions = { '2026-10-16': { move: 1 } };
    expect(markThenUndo(completions).completions).toEqual(completions);
  });

  it('keeps an edit made inside the window: water decremented mid-window survives Undo', () => {
    const completions = { [TODAY]: { water: 3 } };
    const decrementWater = (c) => ({ ...c, [TODAY]: { ...c[TODAY], water: 2 } });
    const { completions: undone, syncMap } = markThenUndo(completions, decrementWater);
    expect(undone[TODAY]).toEqual({ water: 2 });
    expect('water' in syncMap).toBe(false);
  });

  it('leaves a marked habit the user already un-checked inside the window, and keeps the day if other entries exist', () => {
    const uncheckRead = (c) => ({ ...c, [TODAY]: { ...c[TODAY], read: 0, water: 1 } });
    const { completions: undone, syncMap } = markThenUndo({}, uncheckRead);
    expect(undone[TODAY]).toEqual({ read: 0, water: 1 });
    expect(syncMap).toEqual({ move: 0, legacy: 0, sugar: 0 });
  });

  it('reverts on the day the action ran, not today at Undo time (m2)', () => {
    const completions = { [TODAY]: { water: 3 } };
    const before = completions[TODAY];
    const { next, changedIds } = applyMarkRest(before, habits, []);
    // Midnight passed inside the window: a new day already has a check-off.
    const later = { [TODAY]: next, '2026-10-18': { move: 1 } };
    const { completions: undone } = revertMarkRest(later, TODAY, before, changedIds);
    expect(undone[TODAY]).toEqual({ water: 3 });
    expect(undone['2026-10-18']).toEqual({ move: 1 });
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

describe('markRestLeavesOutCounters (Today caption, M0-polish m2)', () => {
  const { markRestLeavesOutCounters } = require('../habits');
  const daily = { id: 'd', type: 'daily' };
  const water = { id: 'w', type: 'volume', volumeGoal: 8 };
  const stretch = { id: 's', type: 'timed', volumeGoal: 20 };
  const limit = { id: 'l', type: 'atMost', volumeGoal: 2 };
  const none = () => false;

  it('is true when an unfinished counter, timer or limit is due', () => {
    expect(markRestLeavesOutCounters([daily, water], [], none)).toBe(true);
    expect(markRestLeavesOutCounters([daily, stretch], [], none)).toBe(true);
    expect(markRestLeavesOutCounters([daily, limit], [], none)).toBe(true);
  });

  it('is false when only check-off habits are due, even if some are skipped', () => {
    expect(markRestLeavesOutCounters([daily, { id: 'd2', type: 'daily' }, { id: 'q', type: 'quit' }], ['d2'], none)).toBe(false);
    expect(markRestLeavesOutCounters([{ id: 'x' }], [], none)).toBe(false);
  });

  it('ignores finished or skipped counters', () => {
    expect(markRestLeavesOutCounters([daily, water], [], (h) => h.id === 'w')).toBe(false);
    expect(markRestLeavesOutCounters([daily, water], ['w'], none)).toBe(false);
  });
});
