import { buildBackup, validateBackup, mergeBackup, summarizeBackup, BACKUP_FORMAT } from '../backup';

const state = {
  habits: [{ id: 'a', name: 'Water', type: 'volume', volumeGoal: 8 }],
  completions: { '2026-10-13': { a: 8 }, '2026-10-14': { a: 3 } },
  notes: { '2026-10-13': { a: 'felt good' } },
  settings: { theme: 'dark', skips: {}, streakFreezes: [] },
  challenges: [{ id: 'c1', name: 'Kick', days: 3, completedDays: [] }],
  pastChallenges: [],
  dailySnapshot: { '2026-10-13': [{ id: 'a', name: 'Water', volumeGoal: 8 }] },
  accountCreatedAt: '2026-10-01',
};

describe('backup round trip', () => {
  it('builds a versioned envelope and validates it back', () => {
    const b = buildBackup(state, '2026-10-14T10:00:00.000Z');
    expect(b.format).toBe(BACKUP_FORMAT);
    const v = validateBackup(JSON.stringify(b));
    expect(v.ok).toBe(true);
    expect(v.data.habits).toEqual(state.habits);
    expect(v.data.completions).toEqual(state.completions);
    expect(v.data.notes).toEqual(state.notes);
    expect(v.data.accountCreatedAt).toBe('2026-10-01');
    expect(summarizeBackup(v.data)).toBe('1 habit, 2 days of history, 1 challenge');
  });

  it('rejects junk and newer versions', () => {
    expect(validateBackup('not json').ok).toBe(false);
    expect(validateBackup({ foo: 1 }).ok).toBe(false);
    expect(validateBackup({ format: BACKUP_FORMAT, version: 99, data: {} }).ok).toBe(false);
    expect(validateBackup({ format: BACKUP_FORMAT, version: 1, data: { habits: [] } }).ok).toBe(false);
  });

  it('strips malformed entries instead of failing', () => {
    const v = validateBackup({
      format: BACKUP_FORMAT, version: 1,
      data: {
        habits: [{ id: 'a', name: 'ok' }, { nope: true }, 'x'],
        completions: { '2026-10-13': { a: 1, b: 'bad' }, 'junk': { a: 1 } },
        notes: { '2026-10-13': { a: '' } },
        dailySnapshot: { '2026-10-13': [{ id: 'a' }, 5] },
      },
    });
    expect(v.ok).toBe(true);
    expect(v.data.habits).toEqual([{ id: 'a', name: 'ok' }]);
    expect(v.data.completions).toEqual({ '2026-10-13': { a: 1 } });
    expect(v.data.notes).toEqual({});
    expect(v.data.dailySnapshot).toEqual({ '2026-10-13': [{ id: 'a' }] });
  });

  it('merges with backup winning per record/day and the earliest account date', () => {
    const current = { ...state, habits: [{ id: 'a', name: 'Old' }, { id: 'z', name: 'Keep' }], completions: { '2026-10-14': { a: 5, z: 1 } }, accountCreatedAt: '2026-10-05' };
    const v = validateBackup(buildBackup(state));
    const m = mergeBackup(current, v.data);
    expect(m.habits.map(h => h.name).sort()).toEqual(['Keep', 'Water']);
    expect(m.completions['2026-10-14']).toEqual({ a: 3, z: 1 });
    expect(m.accountCreatedAt).toBe('2026-10-01');
    expect(m.settings.theme).toBe('dark');
  });
});
