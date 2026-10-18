import { Platform, InteractionManager } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { renderSound, encodeWav, bytesToBase64, hashString, SAMPLE_RATE, SYNTH_VERSION } from './synth';
import { SOUND_DEFS } from './soundKit';

// Plays the Groov sound kit (plan §2.11). The sounds are synthesised in code by src/utils/synth.js
// from the definitions in src/utils/soundKit.js; there are no audio assets.
// - iOS / Android: each sound is rendered once to a small WAV in the cache directory (named by
//   a hash of its definition, so a kit edit re-renders it) and played through expo-audio.
//   The kit is pre-rendered at idle after launch (prewarm, started by AppContext through
//   feedback.prewarmSounds); a sound that is not ready yet renders on demand.
// - Web: the same samples go into a Web Audio AudioBuffer.
// src/services/feedback.js is the only caller: it maps events to sound ids and gates on
// settings.soundEnabled, so nothing here runs (and no player is created) when sound is off.
// iOS uses the ambient category (playsInSilentMode false + mixWithOthers): the ring/silent
// switch mutes the kit and other apps' audio keeps playing. Android plays on the media stream.

export const MAX_PLAYERS = 3;

// ─── Web Audio (browser) ─────────────────────────────────────────────────────

let audioCtx = null;
const webBuffers = {};

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  return audioCtx;
}

async function playWeb(id) {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    if (!webBuffers[id]) {
      const samples = renderSound(SOUND_DEFS[id], SAMPLE_RATE);
      const buffer = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
      buffer.getChannelData(0).set(samples);
      webBuffers[id] = buffer;
    }
    const src = ctx.createBufferSource();
    src.buffer = webBuffers[id];
    src.connect(ctx.destination);
    src.start();
  } catch { /* silent */ }
}

// ─── Native audio via expo-audio ─────────────────────────────────────────────

// Audio mode is configured once; a singleton promise keeps near-simultaneous sounds from racing.
let audioModePromise = null;
let audioModeReady = false;

function ensureAudioMode() {
  if (audioModePromise) return audioModePromise;
  audioModePromise = setAudioModeAsync({
    playsInSilentMode: false, // iOS .ambient: the silent switch mutes the kit
    interruptionMode: 'mixWithOthers',
    allowsRecording: false,
    shouldPlayInBackground: false,
  }).then(() => { audioModeReady = true; }).catch(e => {
    warnOnce('setAudioModeAsync failed', e);
    audioModePromise = null; // reset so the next call retries
  });
  return audioModePromise;
}

/** The cache file name of a sound: its id plus a hash of what it renders from. */
export function wavFileName(id) {
  const key = hashString(`${SYNTH_VERSION}|${SAMPLE_RATE}|${JSON.stringify(SOUND_DEFS[id])}`);
  return `groov-snd-${id}-${key}.wav`;
}

/** Byte size of a complete WAV for `id` (a shorter cached file is a truncated write). */
export function expectedWavBytes(id) {
  return 44 + 2 * Math.max(1, Math.round((SOUND_DEFS[id].capMs / 1000) * SAMPLE_RATE));
}

const uriCache = {}; // id → file URI (this session)
const pendingUri = {}; // id → Promise<uri> while rendering
const failed = {}; // id → true after a write or play failure: never retried this session
let lastSoundAt = -Infinity;

// One warning per session, so a broken audio path never floods LogBox (it swallows taps).
let warned = false;
function warnOnce(what, e) {
  if (warned) return;
  warned = true;
  console.warn(`[Sound] ${what}:`, e?.message ?? e);
}

function cacheDir() {
  return FileSystem.cacheDirectory || null;
}

function getOrCreateWav(id) {
  if (uriCache[id]) return Promise.resolve(uriCache[id]);
  if (pendingUri[id]) return pendingUri[id];
  const dir = cacheDir();
  if (!dir) return Promise.reject(new Error('no cache directory'));
  const uri = `${dir}${wavFileName(id)}`;
  pendingUri[id] = (async () => {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || (typeof info.size === 'number' && info.size !== expectedWavBytes(id))) {
      const bytes = encodeWav(renderSound(SOUND_DEFS[id], SAMPLE_RATE), SAMPLE_RATE);
      // Write beside the target and rename, so an interrupted write never leaves a short WAV
      // under the name that later sessions reuse.
      const tmp = `${uri}.tmp`;
      await FileSystem.writeAsStringAsync(tmp, bytesToBase64(bytes), { encoding: FileSystem.EncodingType.Base64 });
      await FileSystem.deleteAsync(uri, { idempotent: true });
      await FileSystem.moveAsync({ from: tmp, to: uri });
    }
    uriCache[id] = uri;
    return uri;
  })().catch(e => {
    failed[id] = true;
    throw e;
  }).finally(() => { delete pendingUri[id]; });
  return pendingUri[id];
}

// ─── Background pre-render ───────────────────────────────────────────────────
// Rendering is synchronous JS (up to ~90 ms for the fanfare without a JIT), so the kit is
// rendered once the app is idle after launch, celebration sounds first, one sound per
// macrotask, and a step is postponed while the user is checking things off (a sound or a
// feedback event in the last PREWARM_QUIET_MS) so it never lands inside a §4.1 beat window.
// A sound that is not ready yet still renders on demand when it plays.

export const PREWARM_PRIORITY = Object.freeze(['chord', 'habit-1', 'goal', 'challenge', 'fanfare']);
export const PREWARM_START_MS = 4000;
export const PREWARM_QUIET_MS = 1500;
export const PREWARM_GAP_MS = 100;

/** The pre-render order: the priority sounds, then the rest of the kit. */
export function prewarmOrder() {
  return [...PREWARM_PRIORITY, ...Object.keys(SOUND_DEFS).filter(id => !PREWARM_PRIORITY.includes(id))];
}

let prewarmStarted = false;

/**
 * Pre-render the kit in the background (native only, idempotent). `isBusy()` (from feedback.js:
 * a feedback event in the last 1.5 s) postpones a step, as does a sound played here.
 */
export function prewarm({ isBusy = () => false } = {}) {
  if (prewarmStarted || Platform.OS === 'web') return;
  prewarmStarted = true;
  const queue = prewarmOrder();
  const busy = () => isBusy() || Date.now() - lastSoundAt < PREWARM_QUIET_MS;
  const step = () => {
    if (!cacheDir()) return;
    if (busy()) { setTimeout(step, PREWARM_QUIET_MS); return; }
    let id = queue.shift();
    while (id && (uriCache[id] || failed[id])) id = queue.shift();
    if (!id) return;
    getOrCreateWav(id)
      .then(uri => warmAudioStack(uri))
      .catch(() => {})
      .finally(() => setTimeout(step, PREWARM_GAP_MS));
  };
  InteractionManager.runAfterInteractions(() => {
    setTimeout(() => {
      ensureAudioMode(); // so the first sound of the session can take the synchronous path
      removeStaleFiles();
      step();
    }, PREWARM_START_MS);
  });
}

// The first createAudioPlayer of a session pays a one-time native setup (~270 ms of blocked JS
// on the emulator, against ~20 ms after). Pay it here at idle with a player that never plays.
let audioStackWarm = false;
function warmAudioStack(uri) {
  if (audioStackWarm || !uri) return;
  audioStackWarm = true;
  try { createAudioPlayer({ uri }, { updateInterval: 100 }).remove(); } catch { /* the real play reports */ }
}

// Old cache files: the pre-kit chimes (documentDirectory/snd_*.wav) and kit files whose hash is
// not the current kit's (cacheDirectory/groov-snd-*), plus any leftover .tmp.
function removeStaleFiles() {
  if (!FileSystem.readDirectoryAsync) return;
  const sweep = (dir, isStale) => {
    if (!dir) return;
    FileSystem.readDirectoryAsync(dir)
      .then(names => names.filter(isStale)
        .forEach(n => FileSystem.deleteAsync(dir + n, { idempotent: true }).catch(() => {})))
      .catch(() => {});
  };
  sweep(FileSystem.documentDirectory, n => /^snd_.*\.wav$/.test(n));
  const current = new Set(Object.keys(SOUND_DEFS).map(wavFileName));
  sweep(cacheDir(), n => /^groov-snd-.*\.wav(\.tmp)?$/.test(n) && !current.has(n));
}

// ─── Players ─────────────────────────────────────────────────────────────────

// Live players, oldest first. At most MAX_PLAYERS at once: a new sound releases the oldest.
const active = [];

function startPlayer(uri, capMs) {
  while (active.length >= MAX_PLAYERS) active[0].release();
  const player = createAudioPlayer({ uri }, { updateInterval: 100 });
  let released = false;
  let sub = null;
  const entry = {
    release() {
      if (released) return;
      released = true;
      const i = active.indexOf(entry);
      if (i >= 0) active.splice(i, 1);
      try { sub?.remove(); } catch {}
      try { player.remove(); } catch {}
    },
  };
  active.push(entry);
  // Safety net in case didJustFinish never arrives (interrupted playback, or a throw below).
  setTimeout(() => entry.release(), capMs + 1500);
  try {
    sub = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) entry.release();
    });
    player.volume = 1.0;
    player.play();
  } catch (e) {
    entry.release(); // free the slot now
    throw e;
  }
}

function playNative(id) {
  if (failed[id]) return;
  // Warm path (audio mode set, WAV on disk): start the player in the same tick as the tap.
  // Awaiting here would queue the start behind the re-render the tap triggers, which on a
  // dev build is hundreds of ms.
  if (audioModeReady && uriCache[id]) {
    try {
      startPlayer(uriCache[id], SOUND_DEFS[id].capMs);
    } catch (e) {
      failed[id] = true;
      warnOnce('playback failed', e);
    }
    return;
  }
  playNativeCold(id);
}

async function playNativeCold(id) {
  try {
    await ensureAudioMode();
    const uri = await getOrCreateWav(id);
    startPlayer(uri, SOUND_DEFS[id].capMs);
  } catch (e) {
    failed[id] = true;
    warnOnce('playback failed', e);
  }
}

/** Number of live native players (tests, and the max-3 rule). */
export function activePlayerCount() {
  return active.length;
}

/** Play one sound of the kit by id (see SOUND_DEFS). Unknown ids are ignored. */
export function playSound(id) {
  if (!SOUND_DEFS[id]) return;
  lastSoundAt = Date.now();
  if (Platform.OS === 'web') playWeb(id);
  else playNative(id);
}
