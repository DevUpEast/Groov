import { Platform } from 'react-native';
import * as StoreReview from 'expo-store-review';
import { loadData, saveData } from '../utils/storage';

// In-app review prompts are rationed: Apple shows the sheet at most 3 times a year,
// so we never *ask* more than that either, and only after a signature moment.
export const REVIEW_MAX_PER_YEAR = 3;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const KEY = 'reviewPrompts';

export async function canRequestReview(now = Date.now()) {
  if (Platform.OS === 'web') return false;
  const stamps = (await loadData(KEY)) || [];
  const recent = stamps.filter(t => now - t < YEAR_MS);
  return recent.length < REVIEW_MAX_PER_YEAR;
}

// Ask the OS for the review sheet if the quota allows. Returns true when a prompt
// was attempted. `reason` is only for debugging.
export async function maybeRequestReview(reason = '') {
  try {
    if (!(await canRequestReview())) return false;
    if (!(await StoreReview.hasAction())) return false;
    const now = Date.now();
    const stamps = ((await loadData(KEY)) || []).filter(t => now - t < YEAR_MS);
    await saveData(KEY, [...stamps, now]);
    await StoreReview.requestReview();
    if (__DEV__) console.log('[review] requested after', reason);
    return true;
  } catch {
    return false;
  }
}

// Settings row: always try the native sheet; fall back to the store page when known.
export async function openRateApp() {
  try {
    if (await StoreReview.hasAction()) { await StoreReview.requestReview(); return true; }
    const url = StoreReview.storeUrl();
    if (url) { const { Linking } = require('react-native'); await Linking.openURL(url); return true; }
  } catch {}
  return false;
}
