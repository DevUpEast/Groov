import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// One feedback service for the whole app (plan §2.10). It is the only module that imports
// expo-haptics. Callers say *what happened* (`play(EVENTS.habitDone)`) and this file decides
// the haptic per platform and the sound, so the vocabulary stays consistent and the settings
// gate lives in one place (AppContext calls `configure` on load and on every settings change;
// callers never check settings.hapticsEnabled / soundEnabled themselves).
//
// Android never uses impactAsync / notificationAsync / selectionAsync: those drive the Vibrator
// directly ("buzzy"). It only uses performAndroidHapticsAsync (View.performHapticFeedback), which
// honours the system Touch feedback setting. expo-haptics throws for a constant the device's API
// level lacks, so each pulse is a preference chain filtered by Platform.Version, and a throw at
// runtime falls through to the next entry. The end of every chain is a no-op, never a vibrate.

export const EVENTS = Object.freeze({
  press: 'press',
  habitDone: 'habit.done',
  counterStep: 'counter.step',
  habitUndone: 'habit.undone',
  challengeClaimed: 'challenge.claimed',
  dayComplete: 'day.complete',
  milestone: 'milestone',
  trophy: 'trophy',
  markRest: 'markRest',
  selection: 'selection',
  toggleOn: 'toggle.on',
  toggleOff: 'toggle.off',
  longPress: 'longPress',
  refused: 'refused',
  error: 'error',
  destructiveConfirm: 'destructiveConfirm',
});

const A = Haptics.AndroidHaptics;

// Lowest Android API level for each constant used here; anything absent works on every level
// (Clock_Tick, Context_Click, Long_Press exist since API 21+, below our minSdk 24).
export const ANDROID_MIN_API = Object.freeze({
  [A.Confirm]: 30,
  [A.Reject]: 30,
  [A.Gesture_End]: 30,
  [A.Segment_Tick]: 34,
  [A.Segment_Frequent_Tick]: 34,
  [A.Toggle_On]: 34,
  [A.Toggle_Off]: 34,
});

// iOS pulses
const impact = (style, at = 0) => ({ at, kind: 'impact', style });
const notify = (type, at = 0) => ({ at, kind: 'notification', type });
const select = (at = 0) => ({ at, kind: 'selection' });
// Android pulse: a preference chain, first entry the device supports wins.
const droid = (chain, at = 0) => ({ at, chain });

const CONFIRM = [A.Confirm, A.Context_Click];
const TICK = [A.Segment_Tick, A.Clock_Tick];
const REJECT = [A.Reject, A.Long_Press];

/**
 * The §2.10 map. `offset` is the default delay from the triggering tap (the §4.1 beat);
 * `play(event, { delay })` overrides it. `sound` names one of SOUNDS (the existing chimes until
 * F-04b replaces them with the sound kit); null is explicit silence.
 */
export const FEEDBACK_MAP = Object.freeze({
  [EVENTS.press]: { ios: [], android: [], sound: null, offset: 0 },
  [EVENTS.habitDone]: { ios: [impact('light')], android: [droid(CONFIRM)], sound: 'success', offset: 0 },
  [EVENTS.counterStep]: { ios: [select()], android: [droid(TICK)], sound: 'chime', offset: 0 },
  [EVENTS.habitUndone]: { ios: [impact('soft')], android: [droid([A.Toggle_Off, A.Context_Click])], sound: null, offset: 0 },
  [EVENTS.challengeClaimed]: { ios: [impact('light')], android: [droid(CONFIRM)], sound: 'challenge', offset: 250 },
  [EVENTS.dayComplete]: {
    ios: [notify('success')],
    android: [droid(CONFIRM), droid(CONFIRM, 125)],
    sound: null,
    offset: 750,
  },
  [EVENTS.milestone]: {
    ios: [notify('success'), impact('light', 125), impact('light', 250)],
    android: [droid(CONFIRM), droid(CONFIRM, 125), droid([A.Gesture_End], 250)],
    sound: 'fanfare',
    offset: 0,
  },
  [EVENTS.trophy]: {
    ios: [notify('success'), impact('medium', 250)],
    android: [droid(CONFIRM), droid([A.Long_Press], 250)],
    sound: 'fanfare',
    offset: 0,
  },
  [EVENTS.markRest]: { ios: [notify('success')], android: [droid(CONFIRM)], sound: 'success', offset: 0 },
  [EVENTS.selection]: { ios: [select()], android: [droid(TICK)], sound: null, offset: 0 },
  [EVENTS.toggleOn]: { ios: [], android: [droid([A.Toggle_On, A.Context_Click])], sound: null, offset: 0 },
  [EVENTS.toggleOff]: { ios: [], android: [droid([A.Toggle_Off, A.Context_Click])], sound: null, offset: 0 },
  [EVENTS.longPress]: { ios: [impact('medium')], android: [droid([A.Long_Press])], sound: null, offset: 0 },
  [EVENTS.refused]: { ios: [notify('warning')], android: [droid(REJECT)], sound: null, offset: 0 },
  [EVENTS.error]: { ios: [notify('error')], android: [droid(REJECT)], sound: null, offset: 0 },
  [EVENTS.destructiveConfirm]: { ios: [notify('warning')], android: [droid(REJECT)], sound: null, offset: 0 },
});

// Event sound → the existing chime in src/utils/sounds.js. Required lazily, so importing this
// module (every screen does) never loads expo-audio until a sound actually plays.
const SOUNDS = {
  chime: 'playChime',
  success: 'playSuccessChime',
  challenge: 'playChallengeChime',
  fanfare: 'playHornFanfare',
};

const IOS_IMPACT = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  soft: Haptics.ImpactFeedbackStyle.Soft,
};
const IOS_NOTIFICATION = {
  success: Haptics.NotificationFeedbackType.Success,
  warning: Haptics.NotificationFeedbackType.Warning,
  error: Haptics.NotificationFeedbackType.Error,
};

/** The constants of `chain` this API level supports, in preference order. */
export function supportedChain(chain, apiLevel) {
  return chain.filter(c => (ANDROID_MIN_API[c] || 0) <= apiLevel);
}

/** What an event resolves to on Android at `apiLevel`: [{ at, haptic }] (haptic null = no-op). */
export function resolveAndroid(event, apiLevel) {
  const spec = FEEDBACK_MAP[event];
  if (!spec) return [];
  return spec.android.map(p => ({ at: p.at, haptic: supportedChain(p.chain, apiLevel)[0] ?? null }));
}

export const RATE_LIMIT_MS = 40;
export const LOG_SIZE = 50;

let enabled = { haptics: true, sound: true };
let lastHapticAt = -Infinity;
let log = [];

/** Mirror the settings gate. Only an explicit false turns a channel off. */
export function configure({ haptics, sound } = {}) {
  enabled = { haptics: haptics !== false, sound: sound !== false };
}

export function isEnabled() {
  return { ...enabled };
}

function record(entry) {
  log.push(entry);
  if (log.length > LOG_SIZE) log = log.slice(log.length - LOG_SIZE);
}

/** The last LOG_SIZE fired entries, oldest first (Settings → Developer → Feedback log). */
export function recent() {
  return log.slice();
}

export function clearRecent() {
  log = [];
}

function apiLevel() {
  const v = Number(Platform.Version);
  return Number.isFinite(v) ? v : 0;
}

// Try each supported constant until one works; resolves to the one used (or null).
async function performAndroid(candidates) {
  for (const c of candidates) {
    try {
      await Haptics.performAndroidHapticsAsync(c);
      return c;
    } catch {
      // Missing on this device after all: fall through to the next.
    }
  }
  return null;
}

function performIOS(pulse) {
  let p;
  if (pulse.kind === 'impact') p = Haptics.impactAsync(IOS_IMPACT[pulse.style]);
  else if (pulse.kind === 'notification') p = Haptics.notificationAsync(IOS_NOTIFICATION[pulse.type]);
  else p = Haptics.selectionAsync();
  Promise.resolve(p).catch(() => {});
  return pulse.kind === 'selection' ? 'selection' : `${pulse.kind}(${pulse.style || pulse.type})`;
}

// `followUp`: a later pulse of the same event (day.complete's second Confirm). The rate limit
// only applies to an event's first pulse; follow-ups are part of the pattern. Returns whether
// the pulse fired (a dropped first pulse drops the rest of the pattern too).
function firePulse(event, pulse, calledAt, followUp = false) {
  if (!enabled.haptics || Platform.OS === 'web') return false;
  const now = Date.now();
  if (!followUp && now - lastHapticAt < RATE_LIMIT_MS) return false; // rapid counter taps: drop, never queue
  if (Platform.OS === 'android') {
    const candidates = supportedChain(pulse.chain, apiLevel());
    if (candidates.length === 0) return true; // no-op on this API level, the pattern continues
    lastHapticAt = now;
    record({ t: now, offset: now - calledAt, event, haptic: `android:${candidates[0]}`, sound: null });
    performAndroid(candidates).catch(() => {});
    return true;
  }
  lastHapticAt = now;
  record({ t: now, offset: now - calledAt, event, haptic: `ios:${performIOS(pulse)}`, sound: null });
  return true;
}

// Pulses are chained, each timed from the previous one actually firing, so a busy JS thread
// that delays the first pulse keeps the pattern's spacing instead of collapsing it.
function runPattern(event, pulses, i, calledAt) {
  if (!firePulse(event, pulses[i], calledAt, i > 0)) return;
  const next = pulses[i + 1];
  if (next) setTimeout(() => runPattern(event, pulses, i + 1, calledAt), next.at - pulses[i].at);
}

function fireSound(event, name, calledAt) {
  if (!enabled.sound || !name || !SOUNDS[name]) return;
  const now = Date.now();
  record({ t: now, offset: now - calledAt, event, haptic: null, sound: name });
  try { require('../utils/sounds')[SOUNDS[name]](); } catch { /* audio failure is never fatal */ }
}

function at(ms, fn) {
  if (ms > 0) setTimeout(fn, ms);
  else fn();
}

/**
 * Fire the feedback for `event`: its haptic pulses (gated by the haptics setting) and its sound
 * (gated by the sound setting), starting `opts.delay` ms from now (default: the event's beat
 * offset). Never awaits: call it in the same frame as the visual change.
 */
export function play(event, opts = {}) {
  const spec = FEEDBACK_MAP[event];
  if (!spec) {
    if (__DEV__) console.warn(`[feedback] unknown event ${event}`);
    return;
  }
  const calledAt = Date.now();
  const delay = typeof opts.delay === 'number' ? opts.delay : spec.offset;
  if (enabled.haptics && Platform.OS !== 'web') {
    const pulses = Platform.OS === 'android' ? spec.android : spec.ios;
    if (pulses.length) at(delay + pulses[0].at, () => runPattern(event, pulses, 0, calledAt));
  }
  if (enabled.sound && spec.sound) at(delay, () => fireSound(event, spec.sound, calledAt));
}

/** Switch / toggle feedback (Android only; iOS switches have their own native haptic). */
export function toggled(on) {
  play(on ? EVENTS.toggleOn : EVENTS.toggleOff);
}

export function __resetForTests() {
  enabled = { haptics: true, sound: true };
  lastHapticAt = -Infinity;
  log = [];
}

const feedback = { play, toggled, configure, isEnabled, recent, clearRecent, EVENTS };
export default feedback;
