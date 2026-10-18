import { useSyncExternalStore } from 'react';
import { loadData, saveData } from './storage';

// Device-local settings (plan S-10). One AsyncStorage object under the key
// `deviceSettings` for per-device state that must never sync: it is not part of the
// settings row, a cloud pull never touches it, backups leave it out, and
// storage.clearAll() (account switch, account deletion, Settings → Data → Reset)
// keeps it, because it belongs to the device, not to an account.
//
// Keys (the full table, with the other device-local AsyncStorage keys, is in CLAUDE.md):
// - `badgeEnabled` (ST-02): the app-icon badge. Set once by the upgrade migration in
//   AppContext's load (an existing install keeps it on, a new install starts off).
// - `lastSeen` (C-09): { date, streak, freezesUsed } at the last open. It describes
//   one account, so clearUserScopedDeviceSettings() drops it on an account switch.
// Unknown keys (written by a newer app version) are kept on every write.

export const DEVICE_SETTINGS_KEY = 'deviceSettings';
// Keys that describe the signed-in account rather than the device.
export const USER_SCOPED_DEVICE_KEYS = ['lastSeen'];

let values = {};
let loading = null;
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => { try { fn(); } catch {} });
}

/** Read the stored object once (idempotent); resolves to the current values. */
export function loadDeviceSettings() {
  if (!loading) {
    loading = loadData(DEVICE_SETTINGS_KEY).then((stored) => {
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
        // A write that happened before the load finished wins over the stored value.
        values = { ...stored, ...values };
        emit();
      }
      return values;
    }).catch(() => values);
  }
  return loading;
}

export function getDeviceSetting(key) {
  return values[key];
}

export function getDeviceSettings() {
  return values;
}

/** Set one or more keys (merged over the rest) and persist the whole object. */
export function setDeviceSettings(patch) {
  values = { ...values, ...patch };
  emit();
  return saveData(DEVICE_SETTINGS_KEY, values);
}

export function setDeviceSetting(key, value) {
  return setDeviceSettings({ [key]: value });
}

/** Drop the account-scoped keys (on an account switch, deletion or reset). */
export function clearUserScopedDeviceSettings() {
  if (!USER_SCOPED_DEVICE_KEYS.some((k) => k in values)) return Promise.resolve();
  const next = { ...values };
  USER_SCOPED_DEVICE_KEYS.forEach((k) => { delete next[k]; });
  values = next;
  emit();
  return saveData(DEVICE_SETTINGS_KEY, values);
}

function subscribe(fn) {
  listeners.add(fn);
  loadDeviceSettings();
  return () => listeners.delete(fn);
}

/** The live device settings object; re-renders when any key changes. */
export function useDeviceSettings() {
  return useSyncExternalStore(subscribe, getDeviceSettings, getDeviceSettings);
}

// Badge upgrade migration (Q12, plan S-10 step 6). Run inside the initial load, before
// `loaded` is set, with whether the raw stored `settings` key was non-null.
export function migrateBadgeFlag(device, hadStoredSettings) {
  if (device && typeof device.badgeEnabled === 'boolean') return null;
  return { badgeEnabled: !!hadStoredSettings };
}

export function __resetDeviceSettingsForTests() {
  values = {};
  loading = null;
  listeners.clear();
}
