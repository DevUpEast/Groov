import { moodSummary, habitMoodCorrelations, describeCorrelation, moodEmoji } from '../mood';

const moods = {
  '2026-10-01': 5, '2026-10-02': 4, '2026-10-03': 2, '2026-10-04': 5,
  '2026-10-05': 1, '2026-10-06': 4, '2026-10-07': 2, '2026-10-08': 9, // 9 is junk
};

describe('moodSummary', () => {
  it('averages valid ratings and splits by perfect days', () => {
    const perfect = new Set(['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-06']);
    const s = moodSummary(moods, k => perfect.has(k));
    expect(s.count).toBe(7);
    expect(s.average).toBe(3.3);
    expect(s.perfectAvg).toBe(4.5);
    expect(s.perfectCount).toBe(4);
    expect(s.otherAvg).toBe(1.7);
    expect(s.otherCount).toBe(3);
  });
  it('handles no data', () => {
    expect(moodSummary({}, () => false)).toEqual({ count: 0, average: null, perfectAvg: null, perfectCount: 0, otherAvg: null, otherCount: 0 });
  });
});

describe('habitMoodCorrelations', () => {
  const habits = [{ id: 'run', name: 'Run', icon: '🏃' }, { id: 'rare', name: 'Rare', icon: '✨' }];
  const doneRun = new Set(['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-06']);
  const isDoneOn = (h, k) => (h.id === 'run' ? doneRun.has(k) : k === '2026-10-01');

  it('reports the delta for habits with enough samples on both sides', () => {
    const out = habitMoodCorrelations(moods, habits, isDoneOn);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ habitId: 'run', doneAvg: 4.5, missedAvg: 1.7, delta: 2.8, doneCount: 4, missedCount: 3 });
    expect(describeCorrelation(out[0])).toBe('You tend to feel better on days you do Run (4.5 vs 1.7 out of 5).');
  });
  it('ignores tiny deltas', () => {
    expect(describeCorrelation({ delta: 0.1 })).toBeNull();
    expect(describeCorrelation(null)).toBeNull();
  });
  it('maps emoji', () => {
    expect(moodEmoji(5)).toBe('😄');
    expect(moodEmoji(undefined)).toBe('·');
  });
});
