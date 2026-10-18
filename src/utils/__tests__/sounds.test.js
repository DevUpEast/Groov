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
      const { playChime } = require('../sounds');
      playChime();
      playChime();
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
