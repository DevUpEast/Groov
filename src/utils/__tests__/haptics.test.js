// S-01: one module-level haptics gate, no Vibration fallback, and chimes that
// respect the iOS silent switch.
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success' },
}));

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

const fs = require('fs');
const path = require('path');
const { Platform } = require('react-native');
const Haptics = require('expo-haptics');
const haptics = require('../haptics');

const EXPORTS = ['lightImpact', 'mediumImpact', 'heavyImpact', 'successNotification'];
const nativeCalls = () =>
  Haptics.impactAsync.mock.calls.length +
  Haptics.notificationAsync.mock.calls.length +
  Haptics.selectionAsync.mock.calls.length;

describe('haptics gate', () => {
  const originalOS = Platform.OS;
  beforeEach(() => { jest.clearAllMocks(); Platform.OS = 'ios'; haptics.setHapticsEnabled(true); });
  afterAll(() => { Platform.OS = originalOS; haptics.setHapticsEnabled(true); });

  test.each(EXPORTS)('%s makes 0 native calls when haptics are disabled', async (name) => {
    haptics.setHapticsEnabled(false);
    await haptics[name]();
    expect(nativeCalls()).toBe(0);
  });

  test.each(EXPORTS)('%s makes 1 native call when haptics are enabled', async (name) => {
    await haptics[name]();
    expect(nativeCalls()).toBe(1);
  });

  test('only an explicit false disables (undefined keeps the default on)', async () => {
    haptics.setHapticsEnabled(undefined);
    await haptics.lightImpact();
    expect(nativeCalls()).toBe(1);
  });

  test('re-enabling restores haptics', async () => {
    haptics.setHapticsEnabled(false);
    await haptics.lightImpact();
    haptics.setHapticsEnabled(true);
    await haptics.lightImpact();
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  });

  test('a failing native call is swallowed without a fallback', async () => {
    Haptics.impactAsync.mockImplementationOnce(() => Promise.reject(new Error('unsupported')));
    await expect(haptics.lightImpact()).resolves.toBeUndefined();
  });

  test('web is a no-op', async () => {
    Platform.OS = 'web';
    await haptics.lightImpact();
    expect(nativeCalls()).toBe(0);
  });

  test('haptics.js no longer imports Vibration', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'haptics.js'), 'utf8');
    expect(src).not.toMatch(/import[^;]*Vibration/);
    expect(src).not.toMatch(/Vibration\.vibrate/);
  });
});

describe('sounds audio mode', () => {
  test('setAudioModeAsync gets playsInSilentMode false and mixWithOthers (iOS ambient)', async () => {
    const originalOS = Platform.OS;
    Platform.OS = 'ios';
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    const { setAudioModeAsync } = require('expo-audio');
    const { playChime } = require('../sounds');
    playChime();
    for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
    expect(setAudioModeAsync).toHaveBeenCalledWith(expect.objectContaining({
      playsInSilentMode: false,
      interruptionMode: 'mixWithOthers',
    }));
    jest.clearAllTimers();
    jest.useRealTimers();
    Platform.OS = originalOS;
  });
});
