import {
  planChallengeClaims, routeClaims, cancelQueuedForHabit, planFlush, getRelevantHabits,
} from '../challenges';
import { applyMarkRest, isGoalMet } from '../habits';

const TODAY = '2026-10-17';
const habits = [
  { id: 'move', type: 'daily', volumeGoal: 1 },
  { id: 'read', type: 'daily', volumeGoal: 1 },
  { id: 'water', type: 'volume', volumeGoal: 8 },
];
const satisfiedWith = (counts) => (h) => isGoalMet(h, counts[h.id]);

// A challenge that one more day completes, one that it does not, one that watches water.
const makeChallenges = () => [
  { id: 'last', days: 3, startDate: '2026-10-15', completedDays: ['2026-10-15', '2026-10-16'], linkedHabitIds: ['move', 'read'] },
  { id: 'long', days: 30, startDate: '2026-10-15', completedDays: ['2026-10-15'], linkedHabitIds: ['move'] },
  { id: 'hydrate', days: 7, startDate: '2026-10-15', completedDays: [], linkedHabitIds: ['water'] },
];

// Minimal model of TodayScreen + AppContext's challenge state.
function makeStore() {
  const s = { challenges: makeChallenges(), pastChallenges: [], queue: [], trophies: 0 };
  s.mark = (id) => { s.challenges = s.challenges.map(c => (c.id === id && !c.completedDays.includes(TODAY) ? { ...c, completedDays: [...c.completedDays, TODAY] } : c)); };
  s.unmark = (id) => { s.challenges = s.challenges.map(c => (c.id === id ? { ...c, completedDays: c.completedDays.filter(d => d !== TODAY) } : c)); };
  s.complete = (id) => {
    const ch = s.challenges.find(c => c.id === id);
    if (!ch) return;
    s.pastChallenges = [{ ...ch, archivedAt: TODAY }, ...s.pastChallenges];
    s.challenges = s.challenges.filter(c => c.id !== id);
  };
  s.claim = (counts, defer) => {
    const plan = planChallengeClaims({
      challenges: s.challenges, activeIds: s.challenges.map(c => c.id), dueHabits: habits, today: TODAY, isSatisfied: satisfiedWith(counts),
    });
    const { markIds, completeNowIds, queueIds } = routeClaims(plan, defer);
    markIds.forEach(s.mark);
    completeNowIds.forEach(s.complete);
    if (completeNowIds.length) s.trophies += 1;
    queueIds.forEach(id => s.queue.push({ challengeId: id, claimedAt: 0 }));
    return plan;
  };
  s.flush = () => {
    const ids = planFlush(s.queue, s.challenges);
    s.queue = [];
    ids.forEach(s.complete);
    if (ids.length) s.trophies += 1;
    return ids;
  };
  return s;
}

describe('planChallengeClaims', () => {
  it('judges the post-action counts and reports claimed and completing ids', () => {
    const plan = planChallengeClaims({
      challenges: makeChallenges(), dueHabits: habits, today: TODAY, isSatisfied: satisfiedWith({ move: 1, read: 1 }),
    });
    expect(plan).toEqual({ claimedIds: ['last', 'long'], completingIds: ['last'] });
  });

  it('(c) Mark the rest with one undone counter claims no day for a challenge linking it', () => {
    const { next } = applyMarkRest({ water: 3 }, habits, []);
    const plan = planChallengeClaims({
      challenges: makeChallenges(), dueHabits: habits, today: TODAY, isSatisfied: satisfiedWith(next),
    });
    expect(plan.claimedIds).not.toContain('hydrate');
    // A challenge linking every habit (no linkedHabitIds) is not claimed either.
    const all = { id: 'all', days: 10, startDate: '2026-10-15', completedDays: [], linkedHabitIds: [] };
    const plan2 = planChallengeClaims({ challenges: [all], dueHabits: habits, today: TODAY, isSatisfied: satisfiedWith(next) });
    expect(plan2.claimedIds).toEqual([]);
  });

  it('skips challenges already claimed today, expired, inactive or with nothing due', () => {
    const chs = [
      { id: 'claimed', days: 5, startDate: '2026-10-15', completedDays: [TODAY], linkedHabitIds: ['move'] },
      { id: 'expired', days: 2, startDate: '2026-10-10', completedDays: [], linkedHabitIds: ['move'] },
      { id: 'reverted', days: 5, startDate: '2026-10-15', completedDays: [], linkedHabitIds: ['move'] },
      { id: 'other', days: 5, startDate: '2026-10-15', completedDays: [], linkedHabitIds: ['gone'] },
    ];
    const plan = planChallengeClaims({
      challenges: chs, activeIds: ['claimed', 'expired', 'other'], dueHabits: habits, today: TODAY, isSatisfied: () => true,
    });
    expect(plan.claimedIds).toEqual([]);
  });
});

describe('(d) deferred completion for Mark the rest', () => {
  const marked = applyMarkRest({}, habits, []).next; // move + read, water untouched

  it('a completing claim is deferred: the day is marked, nothing is archived yet', () => {
    const s = makeStore();
    const plan = s.claim(marked, true);
    expect(plan.completingIds).toEqual(['last']);
    expect(s.pastChallenges).toEqual([]);
    expect(s.challenges.find(c => c.id === 'last').completedDays).toContain(TODAY);
    expect(s.queue.map(q => q.challengeId)).toEqual(['last']);
    expect(s.trophies).toBe(0);
  });

  it('Undo leaves pastChallenges unchanged and un-marks exactly the claimed days', () => {
    const s = makeStore();
    const { claimedIds } = s.claim(marked, true);
    // Undo: cancel the queue, un-mark exactly claimedIds.
    s.queue = [];
    claimedIds.forEach(s.unmark);
    s.flush(); // the toast hides afterwards
    expect(s.pastChallenges).toEqual([]);
    expect(s.challenges).toEqual(makeChallenges());
    expect(s.trophies).toBe(0);
  });

  it('the window closing completes it, with the trophy after the flush', () => {
    const s = makeStore();
    s.claim(marked, true);
    expect(s.flush()).toEqual(['last']);
    expect(s.pastChallenges.map(c => c.id)).toEqual(['last']);
    expect(s.challenges.some(c => c.id === 'last')).toBe(false);
    expect(s.trophies).toBe(1);
  });

  it('a single completing check-off completes immediately and shows the trophy', () => {
    const s = makeStore();
    s.challenges = s.challenges.map(c => (c.id === 'last' ? { ...c, linkedHabitIds: ['move'] } : c));
    s.claim({ move: 1 }, false);
    expect(s.pastChallenges.map(c => c.id)).toEqual(['last']);
    expect(s.queue).toEqual([]);
    expect(s.trophies).toBe(1);
  });

  it('un-checking a linked habit inside the window cancels the queued completion', () => {
    const s = makeStore();
    s.claim(marked, true);
    const { queue, cancelledIds } = cancelQueuedForHabit(s.queue, 'read', s.challenges, habits);
    expect(cancelledIds).toEqual(['last']);
    s.queue = queue;
    cancelledIds.forEach(s.unmark);
    expect(s.flush()).toEqual([]);
    expect(s.pastChallenges).toEqual([]);
    expect(s.challenges.find(c => c.id === 'last').completedDays).not.toContain(TODAY);
  });

  it('an un-check of a habit the queued challenge does not watch keeps it queued', () => {
    const s = makeStore();
    s.claim(marked, true);
    const { queue, cancelledIds } = cancelQueuedForHabit(s.queue, 'water', s.challenges, habits);
    expect(cancelledIds).toEqual([]);
    expect(queue).toEqual(s.queue);
  });

  it('a flush for an already-archived challenge is a no-op', () => {
    const s = makeStore();
    s.claim(marked, true);
    // The expiry effect (or another device) archived it inside the window.
    s.complete('last');
    const before = s.pastChallenges;
    expect(s.flush()).toEqual([]);
    expect(s.pastChallenges).toBe(before);
    expect(s.trophies).toBe(0);
  });

  it('a flush re-verifies the day count against current state', () => {
    const s = makeStore();
    s.claim(marked, true);
    s.unmark('last'); // e.g. un-marked by another path
    expect(s.flush()).toEqual([]);
    expect(s.pastChallenges).toEqual([]);
  });
});

describe('(e) a day claimed before the action stays claimed after Undo', () => {
  it('Undo only un-marks what this action claimed', () => {
    const s = makeStore();
    s.mark('long'); // claimed earlier today by a single check-off
    const { claimedIds } = s.claim(applyMarkRest({ move: 1 }, habits, []).next, true);
    expect(claimedIds).toEqual(['last']);
    s.queue = [];
    claimedIds.forEach(s.unmark);
    expect(s.challenges.find(c => c.id === 'long').completedDays).toContain(TODAY);
  });
});

describe('routeClaims / getRelevantHabits', () => {
  it('routes completing ids to the queue only when deferred', () => {
    const plan = { claimedIds: ['a', 'b'], completingIds: ['b'] };
    expect(routeClaims(plan, false)).toEqual({ markIds: ['a'], completeNowIds: ['b'], queueIds: [] });
    expect(routeClaims(plan, true)).toEqual({ markIds: ['a', 'b'], completeNowIds: [], queueIds: ['b'] });
  });
  it('uses all due habits when nothing is linked', () => {
    expect(getRelevantHabits({ linkedHabitIds: [] }, habits)).toBe(habits);
    expect(getRelevantHabits({ linkedHabitIds: ['read'] }, habits).map(h => h.id)).toEqual(['read']);
  });
});
