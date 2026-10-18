// C-06a: the check-off timeline as data (plan §4.1, §4.2, §4.3).
const { planBeats, mergeBeats, ladderIndex, KINDS, GROUPS, MOMENT_MS } = require('../beats');
const { beat, duration } = require('../../theme/motion');

const at = (plan, name) => plan.items.filter(i => (i.event || i.beat) === name).map(i => i.at);
const feedbackItems = (plan) => plan.items.filter(i => i.channel === 'feedback').map(i => [i.event, i.at]);
const visuals = (plan) => plan.items.filter(i => i.channel === 'visual');

describe('planBeats: the §4.1 offsets', () => {
  it('a check that claims a challenge day and completes the day uses every beat', () => {
    const plan = planBeats({ kind: KINDS.check, habitId: 'w', tone: { n: 3 }, claimedIds: ['c1'], dayComplete: true, habitStreak: true });
    expect(at(plan, 'habit.done')).toEqual([0]);
    expect(at(plan, 'confirm')).toEqual([0]);
    expect(at(plan, 'progress')).toEqual([125]);
    expect(at(plan, 'challenge.claimed')).toEqual([250]);
    expect(at(plan, 'linkedReward')).toEqual([250]);
    expect(at(plan, 'habitStreak')).toEqual([375]);
    expect(at(plan, 'creditDeparts')).toEqual([500]);
    expect(at(plan, 'day.complete')).toEqual([750]);
    expect(at(plan, 'resolution')).toEqual([750]);
    expect(at(plan, 'streakTick')).toEqual([875]);
    // The same numbers as the motion tokens, not literals of their own.
    expect([beat.b16, beat.b8, beat.bDot8, beat.b4, beat.b4b8, beat.b4b8b16]).toEqual([125, 250, 375, 500, 750, 875]);
    // Every start sits on the 16th grid (b32 is only the spacing inside a motif).
    plan.items.forEach(i => expect(i.at % 125).toBe(0));
    expect(plan.items.find(i => i.event === 'habit.done').opts).toEqual({ tone: { n: 3 } });
    expect(plan.items.find(i => i.event === 'challenge.claimed').challengeIds).toEqual(['c1']);
  });

  it('a plain check: confirm and progress only, the challenge motif only with a claim', () => {
    const plan = planBeats({ kind: KINDS.check, habitId: 'r', tone: { n: 1 } });
    expect(feedbackItems(plan)).toEqual([['habit.done', 0]]);
    expect(visuals(plan).map(v => [v.beat, v.at])).toEqual([['confirm', 0], ['progress', 125]]);
  });

  it('a counter step below the goal: the tick and tone at 0, the ring does not move', () => {
    const plan = planBeats({ kind: KINDS.step, habitId: 'w', tone: { step: 3, goal: 8 } });
    expect(feedbackItems(plan)).toEqual([['counter.step', 0]]);
    expect(at(plan, 'progress')).toEqual([]);
    expect(visuals(plan).map(v => [v.beat, v.at, v.duration])).toEqual([['count', 0, 150]]);
  });

  it('a −1 that keeps the habit done: a silent tick', () => {
    const plan = planBeats({ kind: KINDS.stepDown, habitId: 'w' });
    expect(feedbackItems(plan)).toEqual([['counter.step', 0]]);
    expect(plan.items[0].opts).toEqual({ sound: false });
    expect(plan.cancel.habitId).toBe(null);
  });

  it('Mark the rest: one markRest at 0 (its chord rides on it at 750), the motif at 250, no day.complete haptic', () => {
    const plan = planBeats({ kind: KINDS.markRest, claimedIds: ['c1'], dayComplete: true });
    expect(feedbackItems(plan)).toEqual([['markRest', 0], ['challenge.claimed', 250]]);
    expect(at(plan, 'creditDeparts')).toEqual([500]);
    expect(at(plan, 'resolution')).toEqual([750]);
  });

  it('an unknown kind plans nothing', () => {
    expect(planBeats({ kind: 'nope' }).items).toEqual([]);
  });
});

describe('planBeats: reduced motion (§4.3)', () => {
  it('every visual beat lasts 150 ms, the credit flight is dropped, the beats keep their place', () => {
    const full = planBeats({ kind: KINDS.check, habitId: 'w', claimedIds: ['c1'], dayComplete: true, habitStreak: true });
    const reduced = planBeats({ kind: KINDS.check, habitId: 'w', claimedIds: ['c1'], dayComplete: true, habitStreak: true, reduced: true });
    expect(visuals(full).map(v => v.duration)).toEqual([duration.state, duration.value, duration.state, duration.state, beat.b8, duration.state, duration.state]);
    visuals(reduced).forEach(v => expect([v.beat, v.duration]).toEqual([v.beat, 150]));
    expect(at(reduced, 'creditDeparts')).toEqual([]);
    expect(at(reduced, 'resolution')).toEqual([750]); // the gold ring still lands at 750, by a fade
    // Haptics and sound are unchanged.
    expect(feedbackItems(reduced)).toEqual(feedbackItems(full));
  });

  it('un-check and Mark the rest follow it too', () => {
    for (const kind of [KINDS.uncheck, KINDS.markRest, KINDS.step]) {
      visuals(planBeats({ kind, habitId: 'w', dayComplete: true, reduced: true })).forEach(v => expect(v.duration).toBe(150));
    }
  });
});

describe('mergeBeats: cancellation (§4.1 un-check)', () => {
  const pend = (plan, tapAt) => plan.items.map(i => ({ ...i, tapAt }));

  it('an un-check takes back that habit\'s pending beats, its motif and any pending resolution', () => {
    const check = pend(planBeats({ kind: KINDS.check, habitId: 'w', claimedIds: ['c1'], dayComplete: true }), 0);
    const un = planBeats({ kind: KINDS.uncheck, habitId: 'w', unclaimedIds: ['c1'] });
    const { cancel, keep } = mergeBeats(check, un, 300);
    const names = cancel.map(p => p.event || p.beat);
    expect(names).toEqual(expect.arrayContaining(['challenge.claimed', 'day.complete', 'creditDeparts', 'resolution', 'streakTick', 'progress']));
    expect(keep).toEqual([]);
  });

  it('un-checking another habit keeps this habit\'s beats but still drops the resolution', () => {
    const check = pend(planBeats({ kind: KINDS.check, habitId: 'w', claimedIds: ['c1'], dayComplete: true, habitStreak: true }), 0);
    const un = planBeats({ kind: KINDS.uncheck, habitId: 'r', unclaimedIds: [] });
    const { cancel, keep } = mergeBeats(check, un, 100);
    expect(cancel.map(p => p.event || p.beat).sort()).toEqual(['creditDeparts', 'day.complete', 'progress', 'resolution', 'streakTick']);
    expect(keep.map(p => p.event || p.beat)).toEqual(expect.arrayContaining(['habit.done', 'confirm', 'challenge.claimed', 'linkedReward', 'habitStreak']));
  });

  it('un-checking a linked habit cancels the motif another habit started for the same challenge', () => {
    const check = pend(planBeats({ kind: KINDS.check, habitId: 'w', claimedIds: ['c1'] }), 0);
    const { cancel } = mergeBeats(check, planBeats({ kind: KINDS.uncheck, habitId: 'r', unclaimedIds: ['c1'] }), 100);
    expect(cancel.map(p => p.event || p.beat)).toEqual(expect.arrayContaining(['challenge.claimed', 'linkedReward']));
  });

  it('Undo of Mark the rest takes everything back', () => {
    const mr = pend(planBeats({ kind: KINDS.markRest, claimedIds: ['c1'], dayComplete: true }), 0);
    const { cancel, keep } = mergeBeats(mr, planBeats({ kind: KINDS.undoMarkRest }), 400);
    expect(keep).toEqual([]);
    expect(cancel.length).toBe(mr.length);
  });

  it('a −1 that keeps the habit done cancels nothing pending', () => {
    const check = pend(planBeats({ kind: KINDS.check, habitId: 'w', dayComplete: true }), 0);
    const { cancel } = mergeBeats(check, planBeats({ kind: KINDS.stepDown, habitId: 'w' }), 100);
    expect(cancel).toEqual([]);
  });

  it('entries older than the moment are dropped, not cancelled', () => {
    const check = pend(planBeats({ kind: KINDS.check, habitId: 'w', dayComplete: true }), 0);
    const { cancel, keep } = mergeBeats(check, planBeats({ kind: KINDS.uncheck, habitId: 'w' }), MOMENT_MS);
    expect(cancel).toEqual([]);
    expect(keep).toEqual([]);
  });
});

describe('mergeBeats: coalescing rapid taps (§4.2)', () => {
  const pend = (plan, tapAt) => plan.items.map(i => ({ ...i, tapAt }));

  it('the header tween retargets once: a newer progress beat replaces the pending one', () => {
    const a = pend(planBeats({ kind: KINDS.check, habitId: 'a' }), 0);
    const b = planBeats({ kind: KINDS.check, habitId: 'b' });
    const { cancel, keep } = mergeBeats(a, b, 60);
    expect(cancel.map(p => p.beat)).toEqual(['progress']);
    // Per-card beats stay independent.
    expect(keep.map(p => p.event || p.beat)).toEqual(['habit.done', 'confirm']);
  });

  it('two claims in one window play one motif, timed from the latest tap', () => {
    const a = pend(planBeats({ kind: KINDS.check, habitId: 'a', claimedIds: ['c1'] }), 0);
    const b = planBeats({ kind: KINDS.check, habitId: 'b', claimedIds: ['c2'] });
    const { cancel, items } = mergeBeats(a, b, 100);
    expect(cancel.filter(p => p.group === GROUPS.challenge).map(p => p.event || p.beat).sort()).toEqual(['challenge.claimed', 'linkedReward']);
    // The one motif left stands for both challenges: un-claiming c1 later still cancels it.
    expect(items.find(i => i.event === 'challenge.claimed').challengeIds.sort()).toEqual(['c1', 'c2']);
    const pending = items.map(i => ({ ...i, tapAt: 100 }));
    const undo = mergeBeats(pending, planBeats({ kind: KINDS.uncheck, habitId: 'a', unclaimedIds: ['c1'] }), 200);
    expect(undo.cancel.map(p => p.event || p.beat)).toEqual(expect.arrayContaining(['challenge.claimed', 'linkedReward']));
  });

  it('ten rapid steps on one counter leave one pending set, never a queue', () => {
    let pending = [];
    for (let i = 0; i < 10; i++) {
      const plan = planBeats({ kind: KINDS.step, habitId: 'w', tone: { step: i + 1, goal: 8 } });
      const { keep } = mergeBeats(pending, plan, i * 200);
      pending = [...keep, ...pend(plan, i * 200)];
    }
    expect(pending.map(p => p.key).sort()).toEqual(['feedback:counter.step:w', 'visual:count:w']);
  });
});

describe('ladderIndex (§2.11 H(n), F-04b carry n1)', () => {
  const habits = [
    { id: 'r', type: 'daily' },
    { id: 'm', type: 'daily', schedule: { type: 'perWeek', target: 2 } },
    { id: 's', type: 'atMost', volumeGoal: 2 },
    { id: 'w', type: 'volume', volumeGoal: 8 },
  ];

  it('counts only habits checked today with the goal met', () => {
    expect(ladderIndex(habits, { r: 1 })).toBe(1);
    expect(ladderIndex(habits, { r: 1, w: 3 })).toBe(1); // a counter under its goal
    expect(ladderIndex(habits, { r: 1, w: 8 })).toBe(2);
  });

  it('an untouched (or used) at-most limit and a perWeek habit not checked today do not shift the note', () => {
    expect(ladderIndex(habits, { r: 1 })).toBe(1);
    expect(ladderIndex(habits, { r: 1, s: 1 })).toBe(1);
    expect(ladderIndex(habits, { r: 1, m: 1 })).toBe(2); // checked today: it counts
  });
});
