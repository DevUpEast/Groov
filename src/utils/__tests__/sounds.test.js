// S-01: chimes respect the iOS silent switch (moved here from haptics.test.js when F-04a
// replaced src/utils/haptics.js with src/services/feedback.js).
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  createAudioPlayer: jest.fn(() => ({
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    play: jest.fn(),
    remove: jest.fn(),
  })),
}));

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  documentDirectory: 'file:///doc/',
  cacheDirectory: 'file:///cache/',
  readDirectoryAsync: jest.fn(() => Promise.resolve([])),
  deleteAsync: jest.fn(() => Promise.resolve()),
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: true })),
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
  moveAsync: jest.fn(() => Promise.resolve()),
  EncodingType: { Base64: 'base64' },
}));

const { Platform } = require('react-native');

describe('sounds audio mode', () => {
  test('setAudioModeAsync is called once with playsInSilentMode false and mixWithOthers (iOS ambient)', async () => {
    const originalOS = Platform.OS;
    Platform.OS = 'ios';
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      const { setAudioModeAsync } = require('expo-audio');
      const { playSound } = require('../sounds');
      playSound('counter-0');
      playSound('counter-1');
      for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
      expect(setAudioModeAsync).toHaveBeenCalledTimes(1);
      expect(setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({
        playsInSilentMode: false,
        interruptionMode: 'mixWithOthers',
      }));
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
      Platform.OS = originalOS;
    }
  });
});

describe('sounds: the kit on native (F-04b)', () => {
  const flush = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r)); };
  let RN; let audio; let fsys; let sounds; let warn;
  beforeEach(() => {
    jest.resetModules();
    RN = require('react-native');
    RN.Platform.OS = 'android';
    jest.spyOn(RN.InteractionManager, 'runAfterInteractions').mockImplementation(fn => { fn(); return { cancel() {} }; });
    audio = require('expo-audio');
    fsys = require('expo-file-system/legacy');
    sounds = require('../sounds');
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); warn.mockRestore(); });

  const writtenIds = () => fsys.writeAsStringAsync.mock.calls.map(([uri]) => uri.match(/groov-snd-(.+)-[0-9a-f]{8}\.wav/)[1]);

  test('a missing WAV is rendered once: written to a .tmp, then renamed to its hashed name', async () => {
    fsys.getInfoAsync.mockImplementation(() => Promise.resolve({ exists: false }));
    sounds.playSound('chord');
    await flush();
    expect(fsys.writeAsStringAsync).toHaveBeenCalledTimes(1);
    const [tmp, b64] = fsys.writeAsStringAsync.mock.calls[0];
    const uri = `file:///cache/${sounds.wavFileName('chord')}`;
    expect(uri).toMatch(/groov-snd-chord-[0-9a-f]{8}\.wav$/);
    expect(tmp).toBe(`${uri}.tmp`);
    expect(fsys.moveAsync).toHaveBeenCalledWith({ from: tmp, to: uri });
    const { renderSound, encodeWav, bytesToBase64, SAMPLE_RATE } = require('../synth');
    const { SOUND_DEFS } = require('../soundKit');
    const bytes = encodeWav(renderSound(SOUND_DEFS.chord), SAMPLE_RATE);
    expect(b64).toBe(bytesToBase64(bytes));
    expect(bytes.length).toBe(sounds.expectedWavBytes('chord'));
    expect(audio.createAudioPlayer).toHaveBeenCalledWith({ uri }, expect.anything());
    sounds.playSound('chord');
    await flush();
    expect(fsys.writeAsStringAsync).toHaveBeenCalledTimes(1);
  });

  test('a cached file of the wrong size (truncated write) is rendered again', async () => {
    fsys.getInfoAsync.mockImplementation(() => Promise.resolve({ exists: true, size: 1000 }));
    sounds.playSound('goal');
    await flush();
    expect(writtenIds()).toEqual(['goal']);
    fsys.getInfoAsync.mockImplementation(() => Promise.resolve({ exists: true, size: sounds.expectedWavBytes('habit-1') }));
    sounds.playSound('habit-1');
    await flush();
    expect(writtenIds()).toEqual(['goal']); // the right size is reused
  });

  test('a failed write is remembered for the session: no re-render per tap, one warning', async () => {
    fsys.getInfoAsync.mockImplementation(() => Promise.resolve({ exists: false }));
    fsys.writeAsStringAsync.mockImplementation(() => Promise.reject(new Error('ENOSPC')));
    for (let i = 0; i < 3; i++) { sounds.playSound('chord'); await flush(); }
    expect(fsys.writeAsStringAsync).toHaveBeenCalledTimes(1);
    expect(audio.createAudioPlayer).not.toHaveBeenCalled();
    sounds.playSound('goal');
    await flush();
    expect(fsys.writeAsStringAsync).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test('a failed play is remembered too', async () => {
    audio.createAudioPlayer.mockImplementation(() => { throw new Error('no audio'); });
    sounds.playSound('habit-2');
    await flush();
    sounds.playSound('habit-2');
    await flush();
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test('no cacheDirectory: nothing is written, no player, no throw', async () => {
    fsys.cacheDirectory = null;
    expect(() => sounds.playSound('chord')).not.toThrow();
    await flush();
    expect(fsys.getInfoAsync).not.toHaveBeenCalled();
    expect(fsys.writeAsStringAsync).not.toHaveBeenCalled();
    expect(audio.createAudioPlayer).not.toHaveBeenCalled();
    sounds.prewarm();
    jest.advanceTimersByTime(sounds.PREWARM_START_MS + 100);
    await flush();
    expect(fsys.writeAsStringAsync).not.toHaveBeenCalled();
  });

  test('at most 3 players at once: a 4th releases the oldest', async () => {
    const removed = [];
    audio.createAudioPlayer.mockImplementation(() => {
      const p = { addListener: jest.fn(() => ({ remove: jest.fn() })), play: jest.fn(), remove: jest.fn(() => removed.push(p)) };
      return p;
    });
    ['habit-1', 'habit-2', 'habit-3', 'habit-4'].forEach(id => sounds.playSound(id));
    await flush();
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(4);
    expect(sounds.activePlayerCount()).toBe(3);
    expect(removed).toEqual([audio.createAudioPlayer.mock.results[0].value]);
  });

  test('addListener throwing frees the player slot at once', async () => {
    audio.createAudioPlayer.mockImplementation(() => ({
      addListener: jest.fn(() => { throw new Error('boom'); }), play: jest.fn(), remove: jest.fn(),
    }));
    sounds.playSound('habit-1');
    await flush();
    expect(sounds.activePlayerCount()).toBe(0);
  });

  test('warm path: once the audio mode is set and the WAV is known, the player starts in the same tick', async () => {
    sounds.playSound('habit-1');
    await flush();
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(1);
    sounds.playSound('habit-1');
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(2); // no await in between
    expect(audio.createAudioPlayer.mock.results[1].value.play).toHaveBeenCalled();
  });

  test('unknown ids create no player', async () => {
    sounds.playSound('nope');
    await flush();
    expect(audio.createAudioPlayer).not.toHaveBeenCalled();
  });

  describe('background pre-render', () => {
    const runPrewarm = async (steps) => {
      for (let i = 0; i < steps; i++) { jest.advanceTimersByTime(sounds.PREWARM_GAP_MS); await flush(); }
    };

    beforeEach(() => { fsys.getInfoAsync.mockImplementation(() => Promise.resolve({ exists: false })); });

    test('starts after interactions + a few seconds, priority sounds first, one per step, then the rest', async () => {
      sounds.prewarm();
      expect(RN.InteractionManager.runAfterInteractions).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(sounds.PREWARM_START_MS - 1);
      await flush();
      expect(fsys.writeAsStringAsync).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      await flush();
      expect(writtenIds()).toEqual(['chord']);
      await runPrewarm(4);
      expect(writtenIds()).toEqual(['chord', 'habit-1', 'goal', 'challenge', 'fanfare']);
      await runPrewarm(40);
      const { SOUND_DEFS } = require('../soundKit');
      expect(writtenIds()).toEqual(sounds.prewarmOrder());
      expect([...writtenIds()].sort()).toEqual(Object.keys(SOUND_DEFS).sort());
      // One player is created and removed at idle to pay the native setup cost; none plays.
      expect(audio.createAudioPlayer).toHaveBeenCalledTimes(1);
      const warm = audio.createAudioPlayer.mock.results[0].value;
      expect(warm.play).not.toHaveBeenCalled();
      expect(warm.remove).toHaveBeenCalled();
      expect(audio.setAudioModeAsync).toHaveBeenCalled();
      sounds.prewarm(); // idempotent
      expect(RN.InteractionManager.runAfterInteractions).toHaveBeenCalledTimes(1);
    });

    test('backs off while the user is busy, and after a sound plays', async () => {
      let busy = true;
      sounds.prewarm({ isBusy: () => busy });
      jest.advanceTimersByTime(sounds.PREWARM_START_MS);
      await flush();
      jest.advanceTimersByTime(sounds.PREWARM_QUIET_MS * 2);
      await flush();
      expect(fsys.writeAsStringAsync).not.toHaveBeenCalled();
      busy = false;
      jest.advanceTimersByTime(sounds.PREWARM_QUIET_MS);
      await flush();
      expect(writtenIds()).toEqual(['chord']);
      // A sound plays (habit-1 renders on demand); the pre-render waits out the quiet window.
      sounds.playSound('habit-1');
      await flush();
      expect(writtenIds()).toEqual(['chord', 'habit-1']);
      jest.advanceTimersByTime(sounds.PREWARM_QUIET_MS - 1);
      await flush();
      expect(writtenIds()).toEqual(['chord', 'habit-1']);
      jest.advanceTimersByTime(sounds.PREWARM_QUIET_MS + sounds.PREWARM_GAP_MS);
      await flush();
      expect(writtenIds()).toEqual(['chord', 'habit-1', 'goal']); // habit-1 already done: skipped
    });

    test('deletes stale kit files (old hash, leftover .tmp) and the pre-kit chimes, keeps current ones', async () => {
      const current = sounds.wavFileName('chord');
      fsys.readDirectoryAsync.mockImplementation((dir) => Promise.resolve(dir === 'file:///cache/'
        ? [current, 'groov-snd-chord-deadbeef.wav', `${current}.tmp`, 'other.bin']
        : ['snd_1047_130_16.wav', 'keep.json']));
      sounds.prewarm();
      jest.advanceTimersByTime(sounds.PREWARM_START_MS);
      await flush();
      const deleted = fsys.deleteAsync.mock.calls.map(([u]) => u);
      expect(deleted).toEqual(expect.arrayContaining([
        'file:///cache/groov-snd-chord-deadbeef.wav', `file:///cache/${current}.tmp`, 'file:///doc/snd_1047_130_16.wav',
      ]));
      expect(deleted).not.toContain('file:///doc/keep.json');
      expect(deleted).not.toContain('file:///cache/other.bin');
    });
  });
});
