import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { devToolsAllowed } from './appEnv';

// Developer mode is unlocked per device (Settings → tap the version label 7× and enter
// the code). It is stored in SecureStore rather than AsyncStorage so "Clear All Data"
// and account switches do not touch it. SecureStore is unavailable on web.

const KEY = 'GROOV_DEV_DEVICE_OWNER';

export async function loadDevMode() {
  // A production build never runs in dev mode, even on a device unlocked by an earlier build.
  if (Platform.OS === 'web' || !devToolsAllowed) return false;
  try {
    return (await SecureStore.getItemAsync(KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function saveDevMode(enabled) {
  if (Platform.OS === 'web') return;
  try {
    if (enabled) await SecureStore.setItemAsync(KEY, 'true');
    else await SecureStore.deleteItemAsync(KEY);
  } catch {}
}

export async function clearDevMode() {
  return saveDevMode(false);
}
