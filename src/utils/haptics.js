import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// One gate for every haptic in the app: AppContext mirrors settings.hapticsEnabled
// into setHapticsEnabled(), so callers never need to check the setting themselves.
// There is no Vibration fallback: a buzzy vibrator pulse is worse than nothing.

let hapticsEnabled = true;

export function setHapticsEnabled(v) {
  hapticsEnabled = v !== false;
}

async function tryHaptic(fn) {
  if (!hapticsEnabled || Platform.OS === 'web') return;
  try {
    await fn();
  } catch {
    // Unsupported on this device: stay silent.
  }
}

export async function lightImpact() {
  await tryHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export async function mediumImpact() {
  await tryHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

export async function heavyImpact() {
  await tryHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
}

export async function successNotification() {
  await tryHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}
