// The Groov "soft kalimba" synth (plan §2.11). Pure JavaScript: no React Native, Expo or DOM
// imports, so the app (src/utils/sounds.js) and the Node renderer (scripts/render-sound-kit.mjs)
// run the same code and the WAVs Isaac listens to are the WAVs the app plays.
//
// A voice is additive: three inharmonic partials (1, 2.76, 5.4 times the fundamental, the
// spectrum of a struck metal tine) plus a 5 ms "click" partial at 9x, each with its own
// exponential decay. A 3 ms raised-cosine attack starts the voice; a 15 ms fade-out at the
// sound's duration cap ends it, so nothing clicks. Imports between these pure modules use
// explicit `.js` extensions because Node's ESM loader requires them.

export const SAMPLE_RATE = 32000;
// Bump when the synthesis code changes in a way that alters the output: it is part of the
// cache key of the WAV files the app renders on the device.
export const SYNTH_VERSION = 1;

// [frequency ratio, relative amplitude, decay tau as a fraction of tau1 (or absolute seconds)]
export const PARTIALS = Object.freeze([
  Object.freeze({ ratio: 1.0, amp: 1.0, tauScale: 1.0 }),
  Object.freeze({ ratio: 2.76, amp: 0.32, tauScale: 0.3 }),
  Object.freeze({ ratio: 5.4, amp: 0.12, tauScale: 0.12 }),
  Object.freeze({ ratio: 9.0, amp: 0.05, tauSeconds: 0.005 }), // the click
]);

export const ATTACK_S = 0.003;
export const FADE_OUT_S = 0.015;
// Partials at or above this fraction of the sample rate are left out (no aliasing).
export const BAND_LIMIT = 0.45;

/** dBFS → linear peak amplitude (−18 dBFS ≈ 0.126). */
export function dbToAmp(db) {
  return Math.pow(10, db / 20);
}

/** Linear peak amplitude → dBFS. */
export function ampToDb(amp) {
  return 20 * Math.log10(amp);
}

/**
 * One kalimba note, un-normalised (the fundamental starts at amplitude 1).
 * spec: { freq (Hz), tau (s, the fundamental's decay), durationMs (length of the buffer) }.
 */
export function renderTone({ freq, tau, durationMs }, sampleRate = SAMPLE_RATE) {
  const n = Math.max(1, Math.round((durationMs / 1000) * sampleRate));
  const out = new Float32Array(n);
  const attackN = Math.max(1, Math.round(ATTACK_S * sampleRate));
  const partials = PARTIALS
    .map(p => ({ f: freq * p.ratio, amp: p.amp, tau: p.tauSeconds ?? tau * p.tauScale }))
    .filter(p => p.f < BAND_LIMIT * sampleRate);
  for (const p of partials) {
    const w = (2 * Math.PI * p.f) / sampleRate;
    const k = 1 / (p.tau * sampleRate);
    for (let i = 0; i < n; i++) {
      out[i] += p.amp * Math.exp(-i * k) * Math.sin(w * i);
    }
  }
  for (let i = 0; i < attackN && i < n; i++) {
    out[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / attackN); // raised cosine 0 → 1
  }
  return out;
}

/** Sum `tracks` ([{ samples, atMs, gain? }]) into one buffer of `durationMs` (longer tails are cut). */
export function mix(tracks, durationMs, sampleRate = SAMPLE_RATE) {
  const n = Math.max(1, Math.round((durationMs / 1000) * sampleRate));
  const out = new Float32Array(n);
  for (const { samples, atMs = 0, gain = 1 } of tracks) {
    const start = Math.round((atMs / 1000) * sampleRate);
    for (let i = 0; i < samples.length && start + i < n; i++) out[start + i] += samples[i] * gain;
  }
  return out;
}

export function peak(samples) {
  let p = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > p) p = a;
  }
  return p;
}

/** Scale in place so the peak sits at `db` dBFS. */
export function normalise(samples, db) {
  const p = peak(samples);
  if (p === 0) return samples;
  const g = dbToAmp(db) / p;
  for (let i = 0; i < samples.length; i++) samples[i] *= g;
  return samples;
}

/** The 15 ms fade-out over the last samples (in place). */
export function fadeOut(samples, sampleRate = SAMPLE_RATE) {
  const n = samples.length;
  const fadeN = Math.min(n, Math.round(FADE_OUT_S * sampleRate));
  for (let i = 0; i < fadeN; i++) {
    const x = i / fadeN; // 0 → 1 across the fade
    samples[n - fadeN + i] *= 0.5 + 0.5 * Math.cos(Math.PI * x);
  }
  return samples;
}

/**
 * A whole sound: def = { notes: [{ freq, atMs }], tau, capMs, levelDb }. Each note is a kalimba
 * voice starting at its offset; the mix is cut at capMs with the fade-out, and its peak is
 * normalised to levelDb.
 */
export function renderSound(def, sampleRate = SAMPLE_RATE) {
  const tracks = def.notes.map(note => ({
    atMs: note.atMs || 0,
    samples: renderTone({ freq: note.freq, tau: def.tau, durationMs: def.capMs - (note.atMs || 0) }, sampleRate),
  }));
  const out = mix(tracks, def.capMs, sampleRate);
  fadeOut(out, sampleRate);
  return normalise(out, def.levelDb);
}

/** 16-bit PCM mono WAV. */
export function encodeWav(samples, sampleRate = SAMPLE_RATE) {
  const n = samples.length;
  const bytes = new Uint8Array(44 + n * 2);
  const view = new DataView(bytes.buffer);
  const str = (off, s) => { for (let i = 0; i < s.length; i++) bytes[off + i] = s.charCodeAt(i); };
  str(0, 'RIFF');
  view.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767)));
    view.setInt16(44 + i * 2, v, true);
  }
  return bytes;
}

/** Pure-JS base64 (RN has no reliable btoa for binary). */
export function bytesToBase64(bytes) {
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

/** A short stable hash (FNV-1a, hex) used to version cached WAV files by their definition. */
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
