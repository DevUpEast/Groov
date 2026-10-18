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
  documentDirectory: 'file:///doc/',
  cacheDirectory: 'file:///cache/',
  readDirectoryAsync: jest.fn(() => Promise.resolve([])),
  deleteAsync: jest.fn(() => Promise.resolve()),
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: true })),
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
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
  const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };
  let Platform; let audio; let fsys; let sounds;
  beforeEach(() => {
    jest.resetModules();
    Platform = require('react-native').Platform;
    Platform.OS = 'android';
    audio = require('expo-audio');
    fsys = require('expo-file-system/legacy');
    sounds = require('../sounds');
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    audio.createAudioPlayer.mockClear();
    fsys.writeAsStringAsync.mockClear();
  });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  test('a missing WAV is rendered once into the cache dir, named by a hash of its definition', async () => {
    fsys.getInfoAsync.mockImplementation(() => Promise.resolve({ exists: false }));
    sounds.playSound('chord');
    await flush();
    expect(fsys.writeAsStringAsync).toHaveBeenCalledTimes(1);
    const [uri, b64] = fsys.writeAsStringAsync.mock.calls[0];
    expect(uri).toBe(`file:///cache/${sounds.wavFileName('chord')}`);
    expect(uri).toMatch(/groov-snd-chord-[0-9a-f]{8}\.wav$/);
    const { renderSound, encodeWav, bytesToBase64, SAMPLE_RATE } = require('../synth');
    const { SOUND_DEFS } = require('../soundKit');
    expect(b64).toBe(bytesToBase64(encodeWav(renderSound(SOUND_DEFS.chord), SAMPLE_RATE)));
    expect(audio.createAudioPlayer).toHaveBeenCalledWith({ uri }, expect.anything());
    sounds.playSound('chord');
    await flush();
    expect(fsys.writeAsStringAsync).toHaveBeenCalledTimes(1);
    fsys.getInfoAsync.mockImplementation(() => Promise.resolve({ exists: true }));
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

  test('unknown ids create no player', async () => {
    sounds.playSound('nope');
    await flush();
    expect(audio.createAudioPlayer).not.toHaveBeenCalled();
  });
});
