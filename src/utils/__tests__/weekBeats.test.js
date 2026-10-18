import { buildWeekBeats, summarizeBeats } from '../weekBeats';
import { overallDayStatus } from '../streaks';

const TODAY = '2026-10-15';

describe('buildWeekBeats', () => {
  it('gives 7 marks, oldest first, with today last and flagged', () => {
    const beats = buildWeekBeats({ today: TODAY, statusOf: () => 'done', todayState: 'open' });
    expect(beats.map(b => b.key)).toEqual([
      '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15',
    ]);
    expect(beats.filter(b => b.today)).toEqual([{ key: TODAY, status: 'open', today: true }]);
  });

  it('takes past days from statusOf and today from todayState', () => {
    const status = { '2026-10-11': 'rest', '2026-10-13': 'missed' };
    const beats = buildWeekBeats({ today: TODAY, statusOf: k => status[k] || 'done', todayState: 'complete' });
    expect(beats.map(b => b.status)).toEqual(['done', 'done', 'rest', 'done', 'missed', 'done', 'complete']);
  });

  it('never asks statusOf about today (an unfinished today is not a miss)', () => {
    const statusOf = jest.fn(() => 'missed');
    buildWeekBeats({ today: TODAY, statusOf, todayState: 'open' });
    expect(statusOf).not.toHaveBeenCalledWith(TODAY);
  });

  it('leaves out days before the floor, but always keeps today', () => {
    expect(buildWeekBeats({ today: TODAY, floor: '2026-10-13', statusOf: () => 'done', todayState: 'open' }).map(b => b.key))
      .toEqual(['2026-10-13', '2026-10-14', '2026-10-15']);
    expect(buildWeekBeats({ today: TODAY, floor: '2026-10-20', statusOf: () => 'done', todayState: 'rest' }))
      .toEqual([{ key: TODAY, status: 'rest', today: true }]);
  });

  it('crosses a month boundary on local dates', () => {
    const beats = buildWeekBeats({ today: '2026-11-02', statusOf: () => 'done', todayState: 'open' });
    expect(beats[0].key).toBe('2026-10-27');
  });

  it('agrees with the overall streak rule for past days (rest = nothing scheduled or excused)', () => {
    const daily = { id: 'a', schedule: { type: 'daily' } };
    const habitsOn = () => [daily];
    const done = new Set(['2026-10-14', '2026-10-12']);
    const isDone = (k) => done.has(k);
    const isExcused = (k) => k === '2026-10-13';
    const statusOf = (k) => overallDayStatus(k, TODAY, habitsOn, isDone, isExcused);
    const beats = buildWeekBeats({ today: TODAY, floor: '2026-10-11', statusOf, todayState: 'open' });
    expect(beats.map(b => b.status)).toEqual(['missed', 'done', 'rest', 'done', 'open']);
  });
});

describe('summarizeBeats', () => {
  it('counts done (today complete included), rest and missed; an open today is neither', () => {
    const beats = [
      { status: 'done' }, { status: 'rest' }, { status: 'missed' }, { status: 'done' }, { status: 'open', today: true },
    ];
    expect(summarizeBeats(beats)).toEqual({ days: 5, done: 2, rest: 1, missed: 1 });
    expect(summarizeBeats([{ status: 'complete', today: true }])).toEqual({ days: 1, done: 1, rest: 0, missed: 0 });
  });
});
