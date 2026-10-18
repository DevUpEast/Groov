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
      .then(uri => warmPlayer(id, uri))
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
// on the emulator, against ~20 ms after). Pay it here at idle: the priority sounds (chord,
// first habit note, goal, challenge motif, fanfare) get their pooled player now, unplayed.
function warmPlayer(id, uri) {
  if (!uri || !PREWARM_PRIORITY.includes(id) || pool.has(id)) return;
  try { entryFor(id, uri); } catch { /* the real play reports */ }
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

// ─── Players (pooled) ────────────────────────────────────────────────────────

// One expo-audio player per sound, created once and reused: a replay seeks to 0 and plays
// (C-06a), so a tap never pays createAudioPlayer (a native object and a bridge round trip,
// ~20 ms of blocked JS on the emulator and ~270 ms for the first of a session). At most
// MAX_PLAYERS sound at once (a new sound pauses the oldest); at most MAX_POOL players are
// kept, and the least recently used idle one is released to make room.
export const MAX_POOL = 10;
const pool = new Map(); // id -> entry, least recently used first

function stopped(entry) {
  entry.playing = false;
  if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
}

function releaseEntry(entry) {
  stopped(entry);
  if (pool.get(entry.id) === entry) pool.delete(entry.id);
  try { entry.sub?.remove(); } catch {}
  try { entry.player.remove(); } catch {}
}

function makeEntry(id, uri) {
  while (pool.size >= MAX_POOL) {
    const all = [...pool.values()];
    releaseEntry(all.find(e => !e.playing) || all[0]);
  }
  const player = createAudioPlayer({ uri }, { updateInterval: 100 });
  const entry = { id, player, playing: false, used: false, sub: null, timer: null, startedAt: 0 };
  pool.set(id, entry);
  try {
    entry.sub = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) stopped(entry);
    });
  } catch (e) {
    releaseEntry(entry);
    throw e;
  }
  return entry;
}

// The pooled player for `id` (created on first use), marked most recently used.
function entryFor(id, uri) {
  const e = pool.get(id);
  if (!e) return makeEntry(id, uri);
  pool.delete(id);
  pool.set(id, e);
  return e;
}

function startPlayer(id, uri, capMs) {
  const entry = entryFor(id, uri);
  const others = [...pool.values()].filter(e => e.playing && e !== entry).sort((a, b) => a.startedAt - b.startedAt);
  while (others.length >= MAX_PLAYERS) {
    const oldest = others.shift();
    try { oldest.player.pause(); } catch {}
    stopped(oldest);
  }
  try {
    // A player that has played sits at its end: rewind it. Both calls run on the native main
    // queue in order, so the play starts from 0.
    if (entry.used && entry.player.seekTo) Promise.resolve(entry.player.seekTo(0)).catch(() => {});
    entry.player.volume = 1.0;
    entry.player.play();
  } catch (e) {
    releaseEntry(entry); // free the slot now
    throw e;
  }
  entry.used = true;
  entry.playing = true;
  entry.startedAt = Date.now();
  if (entry.timer) clearTimeout(entry.timer);
  // Safety net in case didJustFinish never arrives (interrupted playback).
  entry.timer = setTimeout(() => stopped(entry), capMs + 1500);
}

function playNative(id) {
  if (failed[id]) return;
  // Warm path (audio mode set, WAV on disk): start the player in the same tick as the tap.
  // Awaiting here would queue the start behind the re-render the tap triggers, which on a
  // dev build is hundreds of ms.
  if (audioModeReady && uriCache[id]) {
    try {
      startPlayer(id, uriCache[id], SOUND_DEFS[id].capMs);
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
    startPlayer(id, uri, SOUND_DEFS[id].capMs);
  } catch (e) {
    failed[id] = true;
    warnOnce('playback failed', e);
  }
}

/** Number of native players sounding now (tests, and the max-3 rule). */
export function activePlayerCount() {
  return [...pool.values()].filter(e => e.playing).length;
}

/** Number of pooled native players, playing or idle (tests). */
export function pooledPlayerCount() {
  return pool.size;
}

/** Play one sound of the kit by id (see SOUND_DEFS). Unknown ids are ignored. */
export function playSound(id) {
  if (!SOUND_DEFS[id]) return;
  lastSoundAt = Date.now();
  if (Platform.OS === 'web') playWeb(id);
  else playNative(id);
}
