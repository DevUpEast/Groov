import { isGoalMet, justMetGoal, countStep, describeGoal, describeProgress, CHALLENGE_TEMPLATES } from '../habits';

describe('isGoalMet by type', () => {
  it('daily / quit need one check', () => {
    expect(isGoalMet({ type: 'daily', volumeGoal: 1 }, 0)).toBe(false);
    expect(isGoalMet({ type: 'daily', volumeGoal: 1 }, 1)).toBe(true);
    expect(isGoalMet({ type: 'quit', volumeGoal: 1 }, 1)).toBe(true);
    expect(isGoalMet({ type: 'quit', volumeGoal: 1 }, undefined)).toBe(false);
  });
  it('volume / timed reach a target and may exceed it', () => {
    expect(isGoalMet({ type: 'volume', volumeGoal: 8 }, 7)).toBe(false);
    expect(isGoalMet({ type: 'volume', volumeGoal: 8 }, 9)).toBe(true);
    expect(isGoalMet({ type: 'timed', volumeGoal: 30 }, 30)).toBe(true);
    expect(countStep({ type: 'timed' })).toBe(5);
    expect(countStep({ type: 'volume' })).toBe(1);
  });
  it('atMost stays under a limit, untouched days count', () => {
    expect(isGoalMet({ type: 'atMost', volumeGoal: 2 }, 0)).toBe(true);
    expect(isGoalMet({ type: 'atMost', volumeGoal: 2 }, 2)).toBe(true);
    expect(isGoalMet({ type: 'atMost', volumeGoal: 2 }, 3)).toBe(false);
  });
  it('legacy habits without a type behave like daily', () => {
    expect(isGoalMet({ volumeGoal: 1 }, 1)).toBe(true);
  });
  it('justMetGoal only fires on the crossing increment', () => {
    const v = { type: 'volume', volumeGoal: 3 };
    expect(justMetGoal(v, 2, 3)).toBe(true);
    expect(justMetGoal(v, 3, 4)).toBe(false);
  });
});

describe('labels and templates', () => {
  it('describes goals and progress', () => {
    expect(describeGoal({ type: 'timed', volumeGoal: 20 })).toBe('20 min / day');
    expect(describeGoal({ type: 'atMost', volumeGoal: 2, unit: 'coffees' })).toBe('≤ 2 coffees / day');
    expect(describeProgress({ type: 'atMost', volumeGoal: 2, unit: 'coffees' }, 3)).toBe('3/2 coffees · over limit');
    expect(describeProgress({ type: 'quit' }, 1)).toBe('Avoided today');
    expect(describeProgress({ type: 'daily' }, 1)).toBeNull();
  });
  it('ships the standard challenge lengths', () => {
    expect(CHALLENGE_TEMPLATES.map(t => t.days)).toEqual([7, 21, 30, 66, 100]);
  });
});
