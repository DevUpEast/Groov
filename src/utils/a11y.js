import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

// The OS "reduce motion" setting, read once and kept current for the whole app (F-05).
// - iOS: Settings > Accessibility > Motion > Reduce Motion.
// - Android: RN reads Settings.Global.TRANSITION_ANIMATION_SCALE == 0 (Accessibility >
//   "Remove animations", or `adb shell settings put global transition_animation_scale 0`).
// - Web: the `prefers-reduced-motion: reduce` media query.
// One subscription feeds every consumer, so non-React code (a PanResponder made once in a ref)
// reads the live value through isReducedMotion() instead of a stale closure.
let reducedNow = false;
let started = false;
const listeners = new Set();

function setReduced(value) {
  const next = !!value;
  if (next === reducedNow) return;
  reducedNow = next;
  listeners.forEach((fn) => { try { fn(next); } catch {} });
}

function start() {
  if (started) return;
  started = true;
  if (Platform.OS === 'web') {
    try {
      const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : null;
      if (mq) {
        setReduced(mq.matches);
        const onChange = (e) => setReduced(e.matches);
        if (mq.addEventListener) mq.addEventListener('change', onChange);
        else mq.addListener?.(onChange);
      }
    } catch {}
    return;
  }
  try {
    AccessibilityInfo.isReduceMotionEnabled?.().then(setReduced).catch(() => {});
    AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduced);
  } catch {}
}

// Current value, for code outside React render (animation helpers, PanResponders).
export function isReducedMotion() {
  start();
  return reducedNow;
}

// Calls `fn(reduced)` on every change; returns the unsubscribe function.
export function subscribeReducedMotion(fn) {
  start();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// True when the OS "reduce motion" setting is on; re-renders when it changes. Prefer
// `useMotion()` from src/theme/motion.js, which wraps this and adds the motion tokens.
export function useReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, isReducedMotion, isReducedMotion);
}

// Test hook: resets the shared store so each test starts from a fresh subscription.
export function __resetReducedMotionForTests() {
  reducedNow = false;
  started = false;
  listeners.clear();
}

// Post a short message to the screen reader (e.g. "Drink water done").
export function announce(message) {
  try { AccessibilityInfo.announceForAccessibility(message); } catch {}
}

// Whether a screen reader (TalkBack / VoiceOver) is on, kept current like the reduced-motion
// store above. The Snackbar stays up longer then (C-10).
let readerNow = false;
let readerStarted = false;
const readerListeners = new Set();

function startReader() {
  if (readerStarted) return;
  readerStarted = true;
  const set = (value) => {
    const next = !!value;
    if (next === readerNow) return;
    readerNow = next;
    readerListeners.forEach((fn) => { try { fn(next); } catch {} });
  };
  try {
    AccessibilityInfo.isScreenReaderEnabled?.().then(set).catch(() => {});
    AccessibilityInfo.addEventListener?.('screenReaderChanged', set);
  } catch {}
}

export function isScreenReaderOn() {
  startReader();
  return readerNow;
}

export function subscribeScreenReader(fn) {
  startReader();
  readerListeners.add(fn);
  return () => readerListeners.delete(fn);
}

export function __resetScreenReaderForTests() {
  readerNow = false;
  readerStarted = false;
  readerListeners.clear();
}
