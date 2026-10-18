// S-10: the device-local store (AsyncStorage `deviceSettings`, never synced) and the
// device keys that survive storage.clearAll.
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
let mockStored = null;
jest.mock('../storage', () => ({
  ...jest.requireActual('../storage'),
  loadData: jest.fn(() => Promise.resolve(mockStored)),
  saveData: jest.fn(() => Promise.resolve()),
}));
const storage = require('../storage');
const ds = require('../deviceSettings');

beforeEach(() => { ds.__resetDeviceSettingsForTests(); mockStored = null; storage.saveData.mockClear(); });

test('loads the stored object once and keeps unknown keys on every write', async () => {
  mockStored = { badgeEnabled: false, fromNewerVersion: { a: 1 } };
  await ds.loadDeviceSettings();
  await ds.loadDeviceSettings();
  expect(storage.loadData).toHaveBeenCalledWith('deviceSettings');
  expect(ds.getDeviceSetting('badgeEnabled')).toBe(false);
  ds.setDeviceSetting('badgeEnabled', true);
  expect(storage.saveData).toHaveBeenLastCalledWith('deviceSettings', { badgeEnabled: true, fromNewerVersion: { a: 1 } });
});

test('a write before the load finishes wins over the stored value', async () => {
  mockStored = { badgeEnabled: false, other: 1 };
  ds.setDeviceSetting('badgeEnabled', true);
  await ds.loadDeviceSettings();
  expect(ds.getDeviceSettings()).toEqual({ badgeEnabled: true, other: 1 });
});

test('clearUserScopedDeviceSettings drops lastSeen only', async () => {
  ds.setDeviceSettings({ badgeEnabled: true, lastSeen: { date: '2026-10-01', streak: 3 } });
  await ds.clearUserScopedDeviceSettings();
  expect(ds.getDeviceSettings()).toEqual({ badgeEnabled: true });
  storage.saveData.mockClear();
  await ds.clearUserScopedDeviceSettings();
  expect(storage.saveData).not.toHaveBeenCalled();
});

test('clearing before the load finishes still drops a stored lastSeen', async () => {
  mockStored = { badgeEnabled: true, lastSeen: { date: '2026-10-01' } };
  await ds.clearUserScopedDeviceSettings();
  expect(ds.getDeviceSettings()).toEqual({ badgeEnabled: true });
});

test('badge upgrade migration: an existing install keeps the badge on, a new install starts off', () => {
  expect(ds.migrateBadgeFlag({}, true)).toEqual({ badgeEnabled: true });
  expect(ds.migrateBadgeFlag(null, false)).toEqual({ badgeEnabled: false });
  // Runs once: a stored choice is never overwritten.
  expect(ds.migrateBadgeFlag({ badgeEnabled: false }, true)).toBeNull();
  expect(ds.migrateBadgeFlag({ badgeEnabled: true }, false)).toBeNull();
});

test('clearAll keeps the device-local keys and the supabase session', async () => {
  const AsyncStorage = require('@react-native-async-storage/async-storage');
  const keys = ['habits', 'settings', 'hasOnboarded', 'sb-x-auth-token', ...storage.DEVICE_LOCAL_KEYS];
  jest.spyOn(AsyncStorage, 'getAllKeys').mockResolvedValue(keys);
  const remove = jest.spyOn(AsyncStorage, 'multiRemove').mockResolvedValue();
  await storage.clearAll();
  expect(remove).toHaveBeenCalledWith(['habits', 'settings', 'hasOnboarded']);
  expect(storage.DEVICE_LOCAL_KEYS).toEqual(expect.arrayContaining(['deviceSettings', 'devFlags', 'dateOffset', 'locale']));
});
