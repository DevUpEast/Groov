import { Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { renderSound, encodeWav, bytesToBase64, hashString, SAMPLE_RATE, SYNTH_VERSION } from './synth';
import { SOUND_DEFS } from './soundKit';

// Plays the Groov sound kit (plan §2.11). The sounds are synthesised in code by src/utils/synth.js
// from the definitions in src/utils/soundKit.js; there are no audio assets.
// - iOS / Android: each sound is rendered once to a small WAV in the cache directory (named by
//   a hash of its definition, so a kit edit re-renders it) and played through expo-audio.
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

function ensureAudioMode() {
  if (audioModePromise) return audioModePromise;
  audioModePromise = setAudioModeAsync({
    playsInSilentMode: false, // iOS .ambient: the silent switch mutes the kit
    interruptionMode: 'mixWithOthers',
    allowsRecording: false,
    shouldPlayInBackground: false,
  }).catch(e => {
    console.warn('[Sound] setAudioModeAsync failed:', e?.message ?? e);
    audioModePromise = null; // reset so the next call retries
  });
  return audioModePromise;
}

/** The cache file name of a sound: its id plus a hash of what it renders from. */
export function wavFileName(id) {
  const key = hashString(`${SYNTH_VERSION}|${SAMPLE_RATE}|${JSON.stringify(SOUND_DEFS[id])}`);
  return `groov-snd-${id}-${key}.wav`;
}

const uriCache = {}; // id → file URI (this session)
const pendingUri = {}; // id → Promise<uri> while rendering

function getOrCreateWav(id) {
  if (uriCache[id]) return Promise.resolve(uriCache[id]);
  if (pendingUri[id]) return pendingUri[id];
  const uri = `${FileSystem.cacheDirectory}${wavFileName(id)}`;
  pendingUri[id] = (async () => {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) {
      const bytes = encodeWav(renderSound(SOUND_DEFS[id], SAMPLE_RATE), SAMPLE_RATE);
      await FileSystem.writeAsStringAsync(uri, bytesToBase64(bytes), { encoding: FileSystem.EncodingType.Base64 });
    }
    uriCache[id] = uri;
    return uri;
  })().finally(() => { delete pendingUri[id]; });
  return pendingUri[id];
}

// Render the rest of the kit in the background after the first sound, one file per tick, so
// later first plays (the day.complete chord, a milestone) start without a render.
let prewarmed = false;
function prewarm() {
  if (prewarmed) return;
  prewarmed = true;
  const ids = Object.keys(SOUND_DEFS);
  const next = () => {
    const id = ids.shift();
    if (!id) return;
    getOrCreateWav(id).catch(() => {}).finally(() => setTimeout(next, 50));
  };
  setTimeout(next, 1000);
  removeLegacyChimes();
}

// The pre-kit chimes were cached as documentDirectory/snd_*.wav; they are never used again.
function removeLegacyChimes() {
  const dir = FileSystem.documentDirectory;
  if (!dir || !FileSystem.readDirectoryAsync) return;
  FileSystem.readDirectoryAsync(dir)
    .then(names => names
      .filter(n => /^snd_.*\.wav$/.test(n))
      .forEach(n => FileSystem.deleteAsync(dir + n, { idempotent: true }).catch(() => {})))
    .catch(() => {});
}

// Live players, oldest first. At most MAX_PLAYERS at once: a new sound releases the oldest.
const active = [];

function startPlayer(uri, capMs) {
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
  while (active.length >= MAX_PLAYERS) active[0].release();
  active.push(entry);
  sub = player.addListener('playbackStatusUpdate', (status) => {
    if (status.didJustFinish) entry.release();
  });
  // Safety net in case didJustFinish never arrives (e.g. interrupted playback).
  setTimeout(() => entry.release(), capMs + 1500);
  player.volume = 1.0;
  player.play();
}

async function playNative(id) {
  try {
    await ensureAudioMode();
    const uri = await getOrCreateWav(id);
    startPlayer(uri, SOUND_DEFS[id].capMs);
    prewarm();
  } catch (e) {
    console.warn('[Sound] playback failed:', e?.message ?? e);
  }
}

/** Number of live native players (tests, and the max-3 rule). */
export function activePlayerCount() {
  return active.length;
}

/** Play one sound of the kit by id (see SOUND_DEFS). Unknown ids are ignored. */
export function playSound(id) {
  if (!SOUND_DEFS[id]) return;
  if (Platform.OS === 'web') playWeb(id);
  else playNative(id);
}
