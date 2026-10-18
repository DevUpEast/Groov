import AsyncStorage from '@react-native-async-storage/async-storage';

export async function saveData(key, value) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('saveData failed:', key, e);
  }
}

export async function loadData(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('loadData failed:', key, e);
    return null;
  }
}

// Keys that belong to supabase-js (session, PKCE code verifier). They share this
// AsyncStorage instance, so a blanket AsyncStorage.clear() would silently log the
// user out of the client while React still holds the stale session object: every
// request then runs unauthenticated (RLS rejects it) and the next launch shows the
// login screen. Only wipe Groov's own keys.
const isSupabaseKey = (key) => key.startsWith('sb-');

// Device-local keys (S-10): they belong to the device, never sync, and survive
// clearAll (account switch, account deletion, Settings → Data → Reset). The account-
// scoped parts of `deviceSettings` are dropped separately
// (clearUserScopedDeviceSettings). The classification table is in CLAUDE.md.
export const DEVICE_LOCAL_KEYS = Object.freeze([
  'deviceSettings', // src/utils/deviceSettings.js
  'devFlags',       // src/utils/devFlags.js (C-06a)
  'dateOffset',     // dev tools simulated date (only applied in dev mode)
  'locale',         // Settings → Language (src/i18n, LOCALE_STORAGE_KEY)
  'reviewPrompts',  // store-review prompt stamps (src/services/review.js)
]);

export async function clearAll() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => !isSupabaseKey(k) && !DEVICE_LOCAL_KEYS.includes(k));
    if (ours.length > 0) await AsyncStorage.multiRemove(ours);
  } catch (e) {
    console.warn('clearAll failed:', e);
  }
}
