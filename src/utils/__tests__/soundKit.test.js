// F-04b: the sound kit (plan §2.11). The synth, the ladder, the event map and the renderer.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const synth = require('../synth');
const kit = require('../soundKit');

const { renderTone, renderSound, encodeWav, dbToAmp, ampToDb, peak, SAMPLE_RATE } = synth;
const { LADDER, SOUND_DEFS, EVENT_SOUNDS, soundIdFor, habitDegree, counterDegree, renderKitFiles, LISTENING_SET } = kit;

// Amplitude of `freq` in samples[start, start + len) via a Hann-windowed Goertzel; with `env`
// (the expected envelope per sample) it returns the estimate divided by the window-weighted
// envelope, i.e. the partial's starting amplitude.
function amplitudeAt(samples, freq, startS, lenS, env = () => 1) {
  const start = Math.round(startS * SAMPLE_RATE);
  const n = Math.round(lenS * SAMPLE_RATE);
  let re = 0, im = 0, wsum = 0, esum = 0;
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    const phase = (2 * Math.PI * freq * (start + i)) / SAMPLE_RATE;
    re += samples[start + i] * w * Math.cos(phase);
    im += samples[start + i] * w * Math.sin(phase);
    wsum += w;
    esum += w * env((start + i) / SAMPLE_RATE);
  }
  return (2 * Math.hypot(re, im)) / wsum / (esum / wsum);
}

describe('synth: partials and envelope (§2.11 timbre table)', () => {
  const f = 523.25;
  const tau = 0.35;
  const tone = renderTone({ freq: f, tau, durationMs: 600 });
  const decay = (t0) => (t) => Math.exp(-(t) / t0);

  test.each([
    ['fundamental', 1.0, 1.0, 1.0],
    ['partial 2', 2.76, 0.32, 0.3],
    ['partial 3', 5.4, 0.12, 0.12],
  ])('%s: ratio %s, amplitude %s, tau %s x tau1', (_, ratio, amp, tauScale) => {
    const est = amplitudeAt(tone, f * ratio, 0.01, 0.03, decay(tau * tauScale));
    expect(est).toBeGreaterThan(amp * 0.93);
    expect(est).toBeLessThan(amp * 1.07);
  });

  test('no energy between the partials (inharmonic, not 2x / 3x)', () => {
    expect(amplitudeAt(tone, f * 2, 0.01, 0.03)).toBeLessThan(0.01);
    expect(amplitudeAt(tone, f * 3, 0.01, 0.03)).toBeLessThan(0.01);
  });

  test('each partial decays with its own time constant', () => {
    // Fundamental: amplitude ratio across 100 ms is e^(-0.1 / tau1).
    const a = amplitudeAt(tone, f, 0.05, 0.04);
    const b = amplitudeAt(tone, f, 0.15, 0.04);
    expect(b / a).toBeCloseTo(Math.exp(-0.1 / tau), 2);
    // Partial 2 decays with 0.3 x tau1, across 40 ms.
    const c = amplitudeAt(tone, f * 2.76, 0.03, 0.03);
    const d = amplitudeAt(tone, f * 2.76, 0.07, 0.03);
    expect(d / c).toBeCloseTo(Math.exp(-0.04 / (0.3 * tau)), 2);
  });

  test('the click partial (9x, 5 ms) is present at the start and gone by 40 ms', () => {
    const early = amplitudeAt(tone, f * 9, 0.0, 0.01, decay(0.005));
    expect(early).toBeGreaterThan(0.05 * 0.8);
    expect(early).toBeLessThan(0.05 * 1.2);
    expect(amplitudeAt(tone, f * 9, 0.04, 0.02)).toBeLessThan(0.001);
  });

  test('partials above 0.45 x the sample rate are left out (no aliasing)', () => {
    const high = renderTone({ freq: 2093, tau: 0.5, durationMs: 200 }); // 9x = 18.8 kHz > 14.4 kHz
    const alias = SAMPLE_RATE - 2093 * 9; // where 18.8 kHz would fold to
    expect(amplitudeAt(high, alias, 0.0, 0.01)).toBeLessThan(0.002);
  });

  test('3 ms raised-cosine attack, 15 ms fade-out at the cap', () => {
    expect(tone[0]).toBe(0);
    const attackN = Math.round(0.003 * SAMPLE_RATE);
    expect(Math.abs(tone[Math.floor(attackN / 4)])).toBeLessThan(0.5);
    const s = renderSound(SOUND_DEFS['habit-1']);
    expect(s.length).toBe(Math.round(0.45 * SAMPLE_RATE));
    expect(Math.abs(s[s.length - 1])).toBeLessThan(1e-4);
    // the last 15 ms are quieter than the 15 ms before them
    const fadeN = Math.round(0.015 * SAMPLE_RATE);
    expect(peak(s.slice(-fadeN))).toBeLessThan(peak(s.slice(-2 * fadeN, -fadeN)));
  });

  test('dB helpers: -18 dBFS is about 0.126', () => {
    expect(dbToAmp(-18)).toBeCloseTo(0.126, 3);
    expect(ampToDb(dbToAmp(-22))).toBeCloseTo(-22, 6);
  });
});

describe('sound definitions (§2.11 event table)', () => {
  // Transcribed from the plan independently of soundKit.js.
  const TABLE = {
    'habit-1': { tau: 0.35, cap: 450, db: -18 },
    goal: { tau: 0.35, cap: 450, db: -18 },
    'counter-0': { tau: 0.18, cap: 250, db: -22 },
    over: { tau: 0.18, cap: 250, db: -26 },
    undone: { tau: 0.15, cap: 250, db: -24 },
    challenge: { tau: 0.25, cap: 600, db: -20 },
    chord: { tau: 0.6, cap: 900, db: -18 },
    fanfare: { tau: 0.5, cap: 1200, db: -18 },
  };

  test.each(Object.entries(TABLE))('%s: tau, duration cap and level', (id, row) => {
    const def = SOUND_DEFS[id];
    expect(def.tau).toBe(row.tau);
    expect(def.capMs).toBe(row.cap);
    expect(def.levelDb).toBe(row.db);
    const s = renderSound(def);
    expect(s.length / SAMPLE_RATE * 1000).toBeLessThanOrEqual(row.cap);
    expect(ampToDb(peak(s))).toBeCloseTo(row.db, 1);
  });

  test('every sound peaks at or below -18 dBFS and stays under 1.2 s', () => {
    for (const [id, def] of Object.entries(SOUND_DEFS)) {
      const s = renderSound(def);
      expect([id, ampToDb(peak(s)) <= -18 + 1e-6]).toEqual([id, true]);
      expect(def.capMs).toBeLessThanOrEqual(1200);
      def.notes.forEach(note => expect(note.atMs).toBeLessThan(def.capMs));
    }
  });

  test('notes: undone E5 then C5 at 62 ms; claimed G5 C6 E6 on 32nds; chord C5 E5 G5 C6; fanfare arpeggio on 16ths then the chord an octave up', () => {
    const fr = (id) => SOUND_DEFS[id].notes.map(n => [n.freq, n.atMs]);
    expect(fr('undone')).toEqual([[659.26, 0], [523.25, 62]]);
    expect(fr('challenge')).toEqual([[783.99, 0], [1046.5, 62], [1318.51, 125]]);
    expect(fr('chord')).toEqual([[523.25, 0], [659.26, 0], [783.99, 0], [1046.5, 0]]);
    expect(fr('fanfare')).toEqual([
      [523.25, 0], [659.26, 125], [783.99, 250], [1046.5, 375], [1318.51, 500],
      [1046.5, 625], [1318.51, 625], [1567.98, 625], [2093, 625],
    ]);
    expect(fr('goal')).toEqual([[1046.5, 0], [1318.51, 62]]);
    expect(fr('over')).toEqual([[1318.51, 0]]);
  });
});

describe('one pitch ladder', () => {
  test('C-major pentatonic C5 … G6', () => {
    expect(LADDER).toEqual([523.25, 587.33, 659.26, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98]);
    for (let i = 1; i < LADDER.length; i++) expect(LADDER[i]).toBeGreaterThan(LADDER[i - 1]);
  });

  test('habit ladder H(n) = L[min(n, 8) - 1] climbs C5 → E6 and never falls', () => {
    const freqs = [];
    for (let n = 1; n <= 12; n++) freqs.push(SOUND_DEFS[soundIdFor('habit.done', { n })].notes[0].freq);
    expect(freqs.slice(0, 8)).toEqual(LADDER.slice(0, 8));
    for (let i = 1; i < freqs.length; i++) expect(freqs[i]).toBeGreaterThanOrEqual(freqs[i - 1]);
    expect(habitDegree(0)).toBe(0);
    expect(habitDegree(undefined)).toBe(0);
  });

  test('counter ladder: every step to the goal is >= the previous one, the goal step is the highest note', () => {
    for (let G = 1; G <= 60; G++) {
      let prev = -Infinity;
      let highest = -Infinity;
      for (let k = 1; k < G; k++) {
        const id = soundIdFor('counter.step', { step: k, goal: G });
        const f = SOUND_DEFS[id].notes[0].freq;
        expect(f).toBeGreaterThanOrEqual(prev);
        prev = f;
        highest = Math.max(highest, f);
      }
      expect(counterDegree(G, G)).toBe(5);
      const goal = SOUND_DEFS[soundIdFor('habit.done', { step: G, goal: G })];
      const goalFreqs = goal.notes.map(n => n.freq);
      // The goal step never drops: it starts at or above every step and rises within itself.
      expect(goalFreqs[0]).toBeGreaterThanOrEqual(prev);
      expect(goalFreqs[1]).toBeGreaterThan(goalFreqs[0]);
      expect(Math.max(...goalFreqs)).toBeGreaterThan(highest);
      expect(goalFreqs[1]).toBe(LADDER[counterDegree(G, G) + 2]);
    }
  });

  test('timer steps of +5 and past-goal steps', () => {
    expect(soundIdFor('counter.step', { step: 5, goal: 30 })).toBe(`counter-${Math.round(4 * 5 / 29)}`);
    expect(soundIdFor('counter.step', { step: 9, goal: 8 })).toBe('over');
    expect(soundIdFor('counter.step', {})).toBe('counter-0');
  });
});

describe('every event has a sound or an explicit none', () => {
  const EVENTS_SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'services', 'feedback.js'), 'utf8');
  const eventValues = [...EVENTS_SRC.slice(EVENTS_SRC.indexOf('export const EVENTS'), EVENTS_SRC.indexOf('});'))
    .matchAll(/:\s*'([^']+)'/g)].map(m => m[1]);

  test('the EVENTS list is read from feedback.js', () => {
    expect(eventValues).toEqual(expect.arrayContaining(['habit.done', 'counter.step', 'day.complete', 'sound.preview', 'error']));
  });

  test.each(eventValues)('%s is listed in EVENT_SOUNDS', (event) => {
    expect(Object.prototype.hasOwnProperty.call(EVENT_SOUNDS, event)).toBe(true);
    const id = soundIdFor(event, { n: 3 });
    if (EVENT_SOUNDS[event] === null) expect(id).toBeNull();
    else expect(SOUND_DEFS[id]).toBeDefined();
  });

  test('§2.11 rows', () => {
    expect(soundIdFor('habit.done', { n: 1 })).toBe('habit-1');
    expect(soundIdFor('habit.done', { step: 8, goal: 8 })).toBe('goal');
    expect(soundIdFor('habit.undone')).toBe('undone');
    expect(soundIdFor('challenge.claimed')).toBe('challenge');
    expect(soundIdFor('day.complete')).toBe('chord');
    expect(soundIdFor('markRest')).toBe('chord');
    expect(soundIdFor('milestone')).toBe('fanfare');
    expect(soundIdFor('trophy')).toBe('fanfare');
    expect(soundIdFor('sound.preview')).toBe('habit-1');
    ['press', 'selection', 'toggle.on', 'toggle.off', 'longPress', 'refused', 'error', 'destructiveConfirm']
      .forEach(e => expect(EVENT_SOUNDS[e]).toBeNull());
  });
});

describe('render', () => {
  const sha = (b) => crypto.createHash('sha256').update(Buffer.from(b)).digest('hex');

  test('12 listening WAVs plus the day; every listening id exists', () => {
    const files = renderKitFiles();
    expect(LISTENING_SET).toHaveLength(12);
    expect(files).toHaveLength(13);
    LISTENING_SET.forEach(l => expect(SOUND_DEFS[l.id]).toBeDefined());
    const day = files[12];
    expect(day.name).toBe('13-a-day.wav');
    const secs = (day.bytes.length - 44) / 2 / SAMPLE_RATE;
    expect(secs).toBeGreaterThan(8);
    expect(secs).toBeLessThanOrEqual(10);
  });

  test('WAV header: RIFF, PCM mono 16-bit at the kit rate', () => {
    const b = Buffer.from(encodeWav(new Float32Array(10)));
    expect(b.toString('ascii', 0, 4)).toBe('RIFF');
    expect(b.toString('ascii', 8, 12)).toBe('WAVE');
    expect(b.readUInt16LE(20)).toBe(1);
    expect(b.readUInt16LE(22)).toBe(1);
    expect(b.readUInt32LE(24)).toBe(SAMPLE_RATE);
    expect(b.readUInt16LE(34)).toBe(16);
    expect(b.readUInt32LE(40)).toBe(20);
  });

  test('deterministic in-process', () => {
    const a = renderKitFiles().map(f => sha(f.bytes));
    const b = renderKitFiles().map(f => sha(f.bytes));
    expect(a).toEqual(b);
  });

  test('the Node script (no expo-audio) writes the same bytes, run after run', () => {
    const script = path.join(__dirname, '..', '..', '..', 'scripts', 'render-sound-kit.mjs');
    // Neither the script nor the pure modules it loads may import Expo or React Native.
    const IMPORT_RN = /(from|import\()\s*['"](expo|react-native|@?react)/;
    [script, path.join(__dirname, '..', 'synth.js'), path.join(__dirname, '..', 'soundKit.js')]
      .forEach(f => expect(fs.readFileSync(f, 'utf8')).not.toMatch(IMPORT_RN));
    const run = () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'groov-kit-'));
      execFileSync(process.execPath, [script, '--out', dir, '--quiet'], { stdio: 'pipe' });
      const out = fs.readdirSync(dir).sort().map(n => [n, sha(fs.readFileSync(path.join(dir, n)))]);
      fs.rmSync(dir, { recursive: true, force: true });
      return out;
    };
    const first = run();
    expect(first).toEqual(run());
    expect(first).toEqual(renderKitFiles().map(f => [f.name, sha(f.bytes)]).sort());
  }, 30000);
});
