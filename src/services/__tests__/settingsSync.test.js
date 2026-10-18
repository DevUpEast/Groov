// S-10: settings persistence. The `extras` column round-trip, the merge on a cloud pull,
// the backup mirror, the missing-column fallback and the key classification.
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockUpsert = jest.fn();
jest.mock('../../utils/supabase', () => ({
  supabase: { from: jest.fn(() => ({ upsert: (row) => mockUpsert(row) })) },
}));
jest.mock('../../i18n', () => ({ t: (k) => k }));

const { settingsToRow, rowToSettings, upsertSettingsRow, syncSettings, writeBackSettings, isMissingExtrasColumn, EXTRAS_DIRTY_KEY, __resetExtrasColumnForTests } = require('../sync');
const { DEFAULT_SETTINGS, migrateSettings, mergeExtras, withHint, sameExtras, withCloudExtras } = require('../../utils/settings');
const AsyncStorage = require('@react-native-async-storage/async-storage');
const { buildBackup, validateBackup, mergeBackup } = require('../../utils/backup');
const { DEVICE_LOCAL_KEYS } = require('../../utils/storage');

const MISSING = { code: 'PGRST204', message: "Could not find the 'extras' column of 'settings' in the schema cache" };

beforeEach(async () => { mockUpsert.mockReset(); __resetExtrasColumnForTests(); await AsyncStorage.clear(); });

describe('classification', () => {
  test('every DEFAULT_SETTINGS key round-trips through the settings row (no unsynced top-level key)', () => {
    const s = {
      ...DEFAULT_SETTINGS,
      theme: 'dark',
      notificationsEnabled: false,
      soundEnabled: false,
      hapticsEnabled: false,
      eveningReminderEnabled: true,
      eveningReminderHour: 21,
      eveningReminderMinute: 15,
      skips: { '2026-10-01': ['h1'] },
      streakFreezes: ['2026-10-02'],
      milestones: [{ id: 'streak-7', date: '2026-10-03' }],
      extras: { hints: { longPress: true }, streakNewsEnabled: true, futureKey: { a: 1 } },
    };
    const back = rowToSettings(settingsToRow(s, 'u1'));
    for (const key of Object.keys(DEFAULT_SETTINGS)) expect([key, back[key]]).toEqual([key, s[key]]);
    expect(Object.keys(back).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  test('device-local keys are not settings keys and never reach the row', () => {
    const row = settingsToRow({ ...DEFAULT_SETTINGS, badgeEnabled: true, devFlags: { x: 1 }, dateOffset: 3 }, 'u1');
    for (const k of [...DEVICE_LOCAL_KEYS, 'badgeEnabled', 'lastSeen', 'devFlags']) {
      expect(k in DEFAULT_SETTINGS).toBe(false);
      expect(JSON.stringify(row)).not.toContain(`"${k}"`);
    }
  });
});

describe('extras round trip', () => {
  test('unknown extras keys survive row → settings → row', () => {
    const extras = { hints: { longPress: true, challengeTip: false }, newer: [1, { deep: true }] };
    const row = settingsToRow({ ...DEFAULT_SETTINGS, extras }, 'u1');
    expect(row.extras).toEqual(extras);
    expect(settingsToRow(rowToSettings(row), 'u1')).toEqual(row);
  });

  test('a row from a server without the column reads as empty extras', () => {
    const { extras, ...legacyRow } = settingsToRow(DEFAULT_SETTINGS, 'u1'); // eslint-disable-line no-unused-vars
    expect(rowToSettings(legacyRow).extras).toEqual({});
    expect(rowToSettings({ ...legacyRow, extras: null }).extras).toEqual({});
    expect(rowToSettings({ ...legacyRow, extras: ['bad'] }).extras).toEqual({});
  });

  test('stored settings keep extras through migrateSettings (cold start)', () => {
    const stored = { ...DEFAULT_SETTINGS, extras: { hints: { longPress: true }, x: 2 } };
    expect(migrateSettings(JSON.parse(JSON.stringify(stored))).extras).toEqual(stored.extras);
    expect(migrateSettings({ reminders: [] }).extras).toEqual({});
  });
});

describe('cloud pull merge: migrateSettings(cloud, local)', () => {
  const local = { ...DEFAULT_SETTINGS, theme: 'dark', extras: { hints: { longPress: true }, onlyLocal: 1, streakNewsEnabled: true } };

  test('local extras keys the cloud lacks are kept; columns are cloud-wins', () => {
    const cloud = rowToSettings({ ...settingsToRow({ ...DEFAULT_SETTINGS, theme: 'light' }, 'u'), extras: undefined });
    const merged = migrateSettings(cloud, local);
    expect(merged.theme).toBe('light');
    expect(merged.extras).toEqual(local.extras);
  });

  test('hints and milestonesBackfilled OR-merge: a local true survives a cloud false or missing value', () => {
    const cloud = { ...DEFAULT_SETTINGS, extras: { hints: { longPress: false, challengeTip: true }, milestonesBackfilled: false } };
    const merged = migrateSettings(cloud, { ...local, extras: { ...local.extras, milestonesBackfilled: true } });
    expect(merged.extras.hints).toEqual({ longPress: true, challengeTip: true });
    expect(merged.extras.milestonesBackfilled).toBe(true);
    // And a cloud true survives a local false.
    expect(mergeExtras({ milestonesBackfilled: true }, { milestonesBackfilled: false }).milestonesBackfilled).toBe(true);
    expect(mergeExtras({}, {})).toEqual({});
  });

  test('other extras keys are cloud-wins', () => {
    const cloud = { ...DEFAULT_SETTINGS, extras: { streakNewsEnabled: false } };
    expect(migrateSettings(cloud, local).extras.streakNewsEnabled).toBe(false);
  });

  test('unknown top-level local keys are dropped on a merge; a null local merges with nothing', () => {
    const merged = migrateSettings({ ...DEFAULT_SETTINGS }, { ...local, stray: true });
    expect('stray' in merged).toBe(false);
    expect(migrateSettings({ ...DEFAULT_SETTINGS, extras: { a: 1 } }, null).extras).toEqual({ a: 1 });
  });

  test('withHint marks one hint and keeps the rest of extras', () => {
    expect(withHint({ extras: { hints: { a: true }, k: 1 } }, 'b')).toEqual({ hints: { a: true, b: true }, k: 1 });
    expect(withHint({}, 'a')).toEqual({ hints: { a: true } });
  });
});

describe('missing-column fallback (before the migration is applied)', () => {
  test('a PGRST204 for extras retries without it, then omits it for the session', async () => {
    mockUpsert.mockResolvedValueOnce({ error: MISSING }).mockResolvedValue({ error: null });
    const row = settingsToRow({ ...DEFAULT_SETTINGS, extras: { a: 1 } }, 'u1');
    const res = await upsertSettingsRow(row);
    expect(res.error).toBeNull();
    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect('extras' in mockUpsert.mock.calls[0][0]).toBe(true);
    expect('extras' in mockUpsert.mock.calls[1][0]).toBe(false);
    await syncSettings('u1', DEFAULT_SETTINGS);
    expect(mockUpsert).toHaveBeenCalledTimes(3);
    expect('extras' in mockUpsert.mock.calls[2][0]).toBe(false);
  });

  test('with the column present extras is sent once; other errors do not trigger the fallback', async () => {
    mockUpsert.mockResolvedValue({ error: null });
    await syncSettings('u1', { ...DEFAULT_SETTINGS, extras: { a: 1 } });
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert.mock.calls[0][0].extras).toEqual({ a: 1 });
    mockUpsert.mockReset();
    mockUpsert.mockResolvedValue({ error: { code: '42501', message: 'row-level security' } });
    await upsertSettingsRow(settingsToRow(DEFAULT_SETTINGS, 'u1'));
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(isMissingExtrasColumn({ code: '42703', message: 'column settings.extras does not exist' })).toBe(true);
    expect(isMissingExtrasColumn({ code: 'PGRST204', message: "Could not find the 'theme' column" })).toBe(false);
  });
});

describe('backup', () => {
  const state = {
    habits: [{ id: 'h1', name: 'Read', createdAt: '2026-10-01' }],
    completions: { '2026-10-01': { h1: 1 } },
    settings: { ...DEFAULT_SETTINGS, extras: { hints: { longPress: true }, k: 'backup' } },
  };

  test('a backup round-trip keeps extras and excludes the device keys', () => {
    const json = JSON.stringify(buildBackup(state));
    for (const k of [...DEVICE_LOCAL_KEYS, 'badgeEnabled', 'lastSeen']) expect(json).not.toContain(`"${k}"`);
    const v = validateBackup(json);
    expect(v.ok).toBe(true);
    expect(v.data.settings.extras).toEqual(state.settings.extras);
  });

  test('validateBackup accepts extras only as a plain object', () => {
    const b = buildBackup({ ...state, settings: { ...DEFAULT_SETTINGS, extras: 'nope' } });
    expect('extras' in validateBackup(b).data.settings).toBe(false);
    const b2 = buildBackup({ ...state, settings: { ...DEFAULT_SETTINGS, extras: [1] } });
    expect('extras' in validateBackup(b2).data.settings).toBe(false);
  });

  test('mergeBackup deep-merges extras: backup wins per key, hints OR-merge, local-only keys stay', () => {
    const current = { ...state, settings: { ...DEFAULT_SETTINGS, extras: { hints: { challengeTip: true }, k: 'local', onlyLocal: 1 } } };
    const merged = mergeBackup(current, validateBackup(buildBackup(state)).data);
    expect(merged.settings.extras).toEqual({ hints: { longPress: true, challengeTip: true }, k: 'backup', onlyLocal: 1 });
  });

  test('a merge import drops unknown top-level keys, as a pull does (importBackup normalises with the two-argument form)', () => {
    const incoming = validateBackup(buildBackup({ ...state, settings: { ...state.settings, stray: 1 } })).data;
    const merged = mergeBackup(state, incoming);
    const next = migrateSettings(merged.settings, state.settings);
    expect('stray' in next).toBe(false);
    expect(next.extras).toEqual(state.settings.extras);
  });
});

describe('write-back of the merged extras (review M1)', () => {
  const local = { ...DEFAULT_SETTINGS, extras: { hints: { longPress: true } } };

  test('a pull whose cloud lacks a local hint pushes the merged settings once', async () => {
    mockUpsert.mockResolvedValue({ error: null });
    const cloud = { ...DEFAULT_SETTINGS, theme: 'dark', extras: { hints: { challengeTip: true } } };
    const merged = migrateSettings(cloud, local);
    expect(await writeBackSettings('u1', cloud, merged, { hasExtrasColumn: true })).toBe(true);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const row = mockUpsert.mock.calls[0][0];
    expect(row.extras).toEqual({ hints: { challengeTip: true, longPress: true } });
    expect(row.theme).toBe('dark'); // columns are the cloud's: the write-back never reverts them
  });

  test('no push when the cloud already has everything, or when the row has no extras column', async () => {
    mockUpsert.mockResolvedValue({ error: null });
    const cloud = { ...DEFAULT_SETTINGS, extras: { hints: { longPress: true } } };
    expect(await writeBackSettings('u1', cloud, migrateSettings(cloud, local), { hasExtrasColumn: true })).toBe(false);
    expect(await writeBackSettings('u1', { ...DEFAULT_SETTINGS }, migrateSettings({ ...DEFAULT_SETTINGS }, local), { hasExtrasColumn: false })).toBe(false);
    expect(await writeBackSettings(null, cloud, local, { hasExtrasColumn: true })).toBe(false);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  test('sameExtras ignores key order (jsonb reorders keys)', () => {
    expect(sameExtras({ a: 1, b: { x: [1, { y: 2 }], z: 1 } }, { b: { z: 1, x: [1, { y: 2 }] }, a: 1 })).toBe(true);
    expect(sameExtras({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(sameExtras(undefined, {})).toBe(true);
  });

  test('extrasDirty: extras dropped by the fallback are pushed once the column exists (next launch)', async () => {
    mockUpsert.mockResolvedValueOnce({ error: MISSING }).mockResolvedValue({ error: null });
    await syncSettings('u1', local); // fallback: extras dropped, dirty set
    expect(JSON.parse(await AsyncStorage.getItem(EXTRAS_DIRTY_KEY))).toBe(true);
    __resetExtrasColumnForTests(); // next launch: the column flag re-probes, dirty is re-read
    mockUpsert.mockClear();
    // The cloud already equals the local copy (say another device pushed it), yet the
    // dirty flag still forces one push carrying extras.
    const cloud = { ...DEFAULT_SETTINGS, extras: { hints: { longPress: true } } };
    expect(await writeBackSettings('u1', cloud, migrateSettings(cloud, local), { hasExtrasColumn: true })).toBe(true);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert.mock.calls[0][0].extras).toEqual({ hints: { longPress: true } });
    expect(JSON.parse(await AsyncStorage.getItem(EXTRAS_DIRTY_KEY))).toBe(false);
    expect(await writeBackSettings('u1', cloud, migrateSettings(cloud, local), { hasExtrasColumn: true })).toBe(false);
  });

  test('a fallback upsert with empty extras does not mark dirty', async () => {
    mockUpsert.mockResolvedValueOnce({ error: MISSING }).mockResolvedValue({ error: null });
    await syncSettings('u1', DEFAULT_SETTINGS);
    expect(await AsyncStorage.getItem(EXTRAS_DIRTY_KEY)).toBeNull();
  });

  test('login with no cloud habits: the local push keeps the cloud hints (withCloudExtras)', () => {
    const fresh = { ...DEFAULT_SETTINGS, theme: 'dark', extras: {} };
    const cloud = { ...DEFAULT_SETTINGS, extras: { hints: { challengeTip: true }, streakNewsEnabled: true } };
    const out = withCloudExtras(fresh, cloud);
    expect(out.theme).toBe('dark');
    expect(out.extras).toEqual({ hints: { challengeTip: true }, streakNewsEnabled: true });
    // Local wins for plain keys, OR keys union.
    expect(withCloudExtras({ ...fresh, extras: { streakNewsEnabled: false, hints: { a: true } } }, cloud).extras)
      .toEqual({ streakNewsEnabled: false, hints: { a: true, challengeTip: true } });
    expect(withCloudExtras(fresh, null)).toBe(fresh);
  });
});
