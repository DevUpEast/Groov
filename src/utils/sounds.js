import { Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';

// Short synthesised chimes. On web they are generated live with the Web Audio API;
// on iOS/Android a tiny WAV is rendered once per tone, cached in the document
// directory and played through expo-audio. Callers gate on settings.soundEnabled.
// iOS uses the ambient category (playsInSilentMode false + mixWithOthers), so the
// ring/silent switch mutes chimes and other apps' audio keeps playing.

// ─── Web Audio API (browser) ──────────────────────────────────────────────────

let audioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  return audioCtx;
}

async function playToneWeb(frequency, duration, gainValue = 0.25) {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch { /* silent */ }
}

// ─── Native audio via expo-audio ─────────────────────────────────────────────

function buildWAV(frequency, duration, gain = 0.45) {
  const sampleRate = 22050;
  const numSamples = Math.max(1, Math.floor(sampleRate * duration));
  const bytes = new Uint8Array(44 + numSamples * 2);
  const view = new DataView(bytes.buffer);

  const wr = (off, s) => { for (let i = 0; i < s.length; i++) bytes[off + i] = s.charCodeAt(i); };
  wr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  wr(8, 'WAVE');
  wr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  wr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 6);
    const sample = Math.sin(2 * Math.PI * frequency * t) * envelope * gain;
    const v = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    view.setInt16(44 + i * 2, v, true);
  }
  return bytes;
}

// Pure-JS base64 — avoids btoa + String.fromCharCode.apply issues on React Native
function uint8ToBase64(bytes) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    result += chars[b0 >> 2];
    result += chars[((b0 & 3) << 4) | (b1 >> 4)];
    result += i + 1 < len ? chars[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < len ? chars[b2 & 63] : '=';
  }
  return result;
}

// Audio mode is configured once; a singleton promise keeps the near-simultaneous
// tones of a multi-note chime from racing each other.
let audioModePromise = null;

function ensureAudioMode() {
  if (audioModePromise) return audioModePromise;
  audioModePromise = setAudioModeAsync({
    playsInSilentMode: false, // iOS .ambient: the silent switch mutes chimes
    interruptionMode: 'mixWithOthers',
    allowsRecording: false,
    shouldPlayInBackground: false,
  }).catch(e => {
    console.warn('[Sound] setAudioModeAsync failed:', e?.message ?? e);
    audioModePromise = null; // reset so the next call retries
  });
  return audioModePromise;
}

// ─── WAV file cache (documentDirectory is stable, never cleared by the OS) ───

const memCache = {}; // key → file URI (in-memory, reset on app restart)

async function getOrCreateWav(key, frequency, duration, gain) {
  if (memCache[key]) return memCache[key];

  const uri = `${FileSystem.documentDirectory}snd_${key}.wav`;

  // Reuse a file written in a previous session
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    const wav = buildWAV(frequency, duration, gain);
    const b64 = uint8ToBase64(wav);
    await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
  }

  memCache[key] = uri;
  return uri;
}

async function playToneNative(frequency, duration, gain = 0.3) {
  try {
    await ensureAudioMode();

    // Include gain in the cache key so changing gain produces a fresh WAV file
    const key = `${frequency}_${Math.round(duration * 1000)}_${Math.round(gain * 100)}`;
    const uri = await getOrCreateWav(key, frequency, duration, gain);

    const player = createAudioPlayer({ uri }, { updateInterval: 100 });
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      try { sub.remove(); } catch {}
      try { player.remove(); } catch {}
    };
    const sub = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) release();
    });
    // Safety net in case didJustFinish never arrives (e.g. interrupted playback).
    setTimeout(release, duration * 1000 + 1500);

    player.volume = 1.0;
    player.play();
  } catch (e) {
    console.warn('[Sound] playback failed:', e?.message ?? e);
  }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

function playTone(frequency, duration, gain = 0.3) {
  if (Platform.OS === 'web') {
    playToneWeb(frequency, duration, gain);
  } else {
    playToneNative(frequency, duration, gain);
  }
}

// ─── Public chime functions ───────────────────────────────────────────────────
// All sounds kept soft (gain ≤ 0.18) and brief (total ≤ 350 ms).

// Single soft ding — a volume habit ticked up one step
export function playChime() {
  playTone(1047, 0.13, 0.16);
}

// Two ascending notes — a habit reached its goal
export function playSuccessChime() {
  playTone(784, 0.11, 0.15);
  setTimeout(() => playTone(1047, 0.14, 0.13), 90);
}

// Three ascending notes — a challenge day claimed
export function playChallengeChime() {
  playTone(659, 0.10, 0.14);
  setTimeout(() => playTone(784, 0.10, 0.13), 85);
  setTimeout(() => playTone(1047, 0.14, 0.12), 170);
}

// Four-note ascending finish — challenge completed
export function playHornFanfare() {
  playTone(523, 0.10, 0.14);
  setTimeout(() => playTone(659, 0.10, 0.13), 80);
  setTimeout(() => playTone(784, 0.10, 0.12), 160);
  setTimeout(() => playTone(1047, 0.16, 0.12), 240);
}
