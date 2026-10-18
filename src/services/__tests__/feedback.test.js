// F-04a: the feedback service, haptic half (plan §2.10, §7.1). The mapping here is the
// authoritative check: every event, its iOS call, and its Android constant per API level.
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  performAndroidHapticsAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Soft: 'soft', Rigid: 'rigid' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  // The real string values from node_modules/expo-haptics/build/Haptics.types.d.ts.
  AndroidHaptics: {
    Confirm: 'confirm', Reject: 'reject', Gesture_Start: 'gesture-start', Gesture_End: 'gesture-end',
    Toggle_On: 'toggle-on', Toggle_Off: 'toggle-off', Clock_Tick: 'clock-tick', Context_Click: 'context-click',
    Drag_Start: 'drag-start', Keyboard_Tap: 'keyboard-tap', Long_Press: 'long-press', Virtual_Key: 'virtual-key',
    No_Haptics: 'no-haptics', Segment_Tick: 'segment-tick', Segment_Frequent_Tick: 'segment-frequent-tick',
  },
}));
jest.mock('../../utils/sounds', () => ({
  playChime: jest.fn(), playSuccessChime: jest.fn(), playChallengeChime: jest.fn(), playHornFanfare: jest.fn(),
}));

const fs = require('fs');
const path = require('path');
const { Platform, Vibration } = require('react-native');
const Haptics = require('expo-haptics');
const sounds = require('../../utils/sounds');
const feedback = require('../feedback');

const { EVENTS, FEEDBACK_MAP, play, configure, recent, resolveAndroid } = feedback;

// §2.10, transcribed independently of feedback.js so a map edit has to be made twice.
// Android: [first choice, fallback] per pulse, with the pulse offset.
const SPEC = {
  'press': { ios: [], android: [] },
  'habit.done': { ios: [['impact', 'light', 0]], android: [['confirm', 'context-click', 0]] },
  'counter.step': { ios: [['selection', null, 0]], android: [['segment-tick', 'clock-tick', 0]] },
  'habit.undone': { ios: [['impact', 'soft', 0]], android: [['toggle-off', 'context-click', 0]] },
  'challenge.claimed': { ios: [['impact', 'light', 0]], android: [['confirm', 'context-click', 0]] },
  'day.complete': { ios: [['notification', 'success', 0]], android: [['confirm', 'context-click', 0], ['confirm', 'context-click', 125]] },
  'milestone': {
    ios: [['notification', 'success', 0], ['impact', 'light', 125], ['impact', 'light', 250]],
    android: [['confirm', 'context-click', 0], ['confirm', 'context-click', 125], ['gesture-end', null, 250]],
  },
  'trophy': { ios: [['notification', 'success', 0], ['impact', 'medium', 250]], android: [['confirm', 'context-click', 0], ['long-press', 'long-press', 250]] },
  'markRest': { ios: [['notification', 'success', 0]], android: [['confirm', 'context-click', 0]] },
  'selection': { ios: [['selection', null, 0]], android: [['segment-tick', 'clock-tick', 0]] },
  'toggle.on': { ios: [], android: [['toggle-on', 'context-click', 0]] },
  'toggle.off': { ios: [], android: [['toggle-off', 'context-click', 0]] },
  'longPress': { ios: [['impact', 'medium', 0]], android: [['long-press', 'long-press', 0]] },
  'refused': { ios: [['notification', 'warning', 0]], android: [['reject', 'long-press', 0]] },
  'error': { ios: [['notification', 'error', 0]], android: [['reject', 'long-press', 0]] },
  'destructiveConfirm': { ios: [['notification', 'warning', 0]], android: [['reject', 'long-press', 0]] },
};
const MIN_API = { 'confirm': 30, 'reject': 30, 'gesture-end': 30, 'segment-tick': 34, 'toggle-on': 34, 'toggle-off': 34 };
const expectedAndroid = (event, api) =>
  SPEC[event].android.map(([first, fallback, at]) => ({
    at, haptic: (MIN_API[first] || 0) <= api ? first : fallback && (MIN_API[fallback] || 0) <= api ? fallback : null,
  }));

const iosCalls = () => [
  ...Haptics.impactAsync.mock.calls.map(c => ['impact', c[0]]),
  ...Haptics.notificationAsync.mock.calls.map(c => ['notification', c[0]]),
  ...Haptics.selectionAsync.mock.calls.map(() => ['selection', null]),
];
const allNativeCalls = () =>
  Haptics.impactAsync.mock.calls.length + Haptics.notificationAsync.mock.calls.length
  + Haptics.selectionAsync.mock.calls.length + Haptics.performAndroidHapticsAsync.mock.calls.length;

const originalOS = Platform.OS;
const originalVersion = Platform.Version;
function setPlatform(os, version) {
  Platform.OS = os;
  Object.defineProperty(Platform, 'Version', { value: version, configurable: true, writable: true });
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  feedback.__resetForTests();
  setPlatform('ios', '18.0');
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});
afterAll(() => setPlatform(originalOS, originalVersion));

describe('map coverage', () => {
  test('EVENTS and the map cover exactly the §2.10 events', () => {
    expect(Object.values(EVENTS).sort()).toEqual(Object.keys(SPEC).sort());
    expect(Object.keys(FEEDBACK_MAP).sort()).toEqual(Object.keys(SPEC).sort());
  });

  test.each(Object.keys(SPEC))('%s has explicit ios, android and sound entries', (event) => {
    const spec = FEEDBACK_MAP[event];
    expect(Array.isArray(spec.ios)).toBe(true);
    expect(Array.isArray(spec.android)).toBe(true);
    expect(spec).toHaveProperty('sound'); // null is allowed, but must be stated
  });
});

describe('Android resolution per API level', () => {
  const LEVELS = [24, 29, 30, 33, 34, 36];
  const cases = Object.keys(SPEC).flatMap(e => LEVELS.map(api => [e, api]));
  test.each(cases)('%s at API %i', (event, api) => {
    expect(resolveAndroid(event, api)).toEqual(expectedAndroid(event, api));
  });

  test('worked examples from §2.10', () => {
    expect(resolveAndroid('habit.done', 29)).toEqual([{ at: 0, haptic: 'context-click' }]);
    expect(resolveAndroid('counter.step', 33)).toEqual([{ at: 0, haptic: 'clock-tick' }]);
    expect(resolveAndroid('counter.step', 34)).toEqual([{ at: 0, haptic: 'segment-tick' }]);
    expect(resolveAndroid('toggle.on', 33)).toEqual([{ at: 0, haptic: 'context-click' }]);
    expect(resolveAndroid('refused', 24)).toEqual([{ at: 0, haptic: 'long-press' }]);
    // Milestone below 30 is Context_Click ×2: Gesture_End has no fallback.
    expect(resolveAndroid('milestone', 29).map(p => p.haptic)).toEqual(['context-click', 'context-click', null]);
  });

  test.each(Object.keys(SPEC).flatMap(e => [[e, 29], [e, 36]]))('play(%s) on Android %i calls exactly the resolved constants', async (event, api) => {
    setPlatform('android', api);
    play(event, { delay: 0 });
    jest.advanceTimersByTime(1000);
    await flush();
    const expected = expectedAndroid(event, api).map(p => p.haptic).filter(Boolean);
    expect(Haptics.performAndroidHapticsAsync.mock.calls.map(c => c[0])).toEqual(expected);
    // Never the Vibrator-backed calls on Android.
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  test('a constant that throws at runtime falls through to the next, then to nothing', async () => {
    setPlatform('android', 34);
    Haptics.performAndroidHapticsAsync.mockImplementationOnce(() => Promise.reject(new Error('HapticsNotSupportedException')));
    play(EVENTS.counterStep);
    await flush();
    expect(Haptics.performAndroidHapticsAsync.mock.calls.map(c => c[0])).toEqual(['segment-tick', 'clock-tick']);

    jest.clearAllMocks();
    jest.advanceTimersByTime(100);
    Haptics.performAndroidHapticsAsync.mockImplementation(() => Promise.reject(new Error('nope')));
    const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
    try {
      play(EVENTS.longPress);
      await flush();
      expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledTimes(1);
      expect(vibrate).not.toHaveBeenCalled();
    } finally {
      vibrate.mockRestore();
      Haptics.performAndroidHapticsAsync.mockImplementation(() => Promise.resolve());
    }
  });
});

describe('iOS calls', () => {
  test.each(Object.keys(SPEC))('play(%s) on iOS', (event) => {
    play(event, { delay: 0 });
    jest.advanceTimersByTime(1000);
    const expected = SPEC[event].ios.map(([kind, arg]) => [kind, arg]);
    expect(iosCalls().sort()).toEqual(expected.sort());
    expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
  });

  test('pulse offsets are honoured (milestone: 0, +125, +250)', () => {
    play(EVENTS.milestone);
    expect(iosCalls()).toEqual([['notification', 'success']]);
    jest.advanceTimersByTime(125);
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(125);
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);
  });

  test('default beat offsets: challenge.claimed +250, day.complete +750; delay overrides', () => {
    play(EVENTS.challengeClaimed);
    jest.advanceTimersByTime(249);
    expect(allNativeCalls()).toBe(0);
    jest.advanceTimersByTime(1);
    expect(allNativeCalls()).toBe(1);

    jest.advanceTimersByTime(100);
    play(EVENTS.dayComplete);
    jest.advanceTimersByTime(749);
    expect(allNativeCalls()).toBe(1);
    jest.advanceTimersByTime(1);
    expect(allNativeCalls()).toBe(2);

    jest.advanceTimersByTime(100);
    play(EVENTS.dayComplete, { delay: 0 });
    expect(allNativeCalls()).toBe(3);
  });
});

describe('gating', () => {
  test.each(['ios', 'android'])('haptics off: zero native calls for every event on %s', (os) => {
    setPlatform(os, os === 'android' ? 36 : '18.0');
    configure({ haptics: false, sound: true });
    Object.values(EVENTS).forEach(e => play(e, { delay: 0 }));
    jest.advanceTimersByTime(2000);
    expect(allNativeCalls()).toBe(0);
  });

  test('haptics turned off while a delayed pulse is pending: it does not fire', () => {
    play(EVENTS.dayComplete);
    configure({ haptics: false, sound: true });
    jest.advanceTimersByTime(2000);
    expect(allNativeCalls()).toBe(0);
  });

  test('both channels off: no calls, no sound and no log entries', () => {
    configure({ haptics: false, sound: false });
    Object.values(EVENTS).forEach(e => play(e, { delay: 0 }));
    jest.advanceTimersByTime(2000);
    expect(allNativeCalls()).toBe(0);
    Object.values(sounds).forEach(fn => expect(fn).not.toHaveBeenCalled());
    expect(recent()).toEqual([]);
  });

  test('sound off keeps haptics; haptics off keeps sound', () => {
    configure({ haptics: true, sound: false });
    play(EVENTS.habitDone);
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(sounds.playSuccessChime).not.toHaveBeenCalled();
    jest.advanceTimersByTime(100);
    configure({ haptics: false, sound: true });
    play(EVENTS.habitDone);
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(sounds.playSuccessChime).toHaveBeenCalledTimes(1);
  });

  test('only an explicit false disables', () => {
    configure({});
    play(EVENTS.selection);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  test('web: no haptics', () => {
    setPlatform('web', undefined);
    Object.values(EVENTS).forEach(e => play(e, { delay: 0 }));
    jest.advanceTimersByTime(2000);
    expect(allNativeCalls()).toBe(0);
  });
});

describe('sound routing (existing chimes until F-04b)', () => {
  test.each([
    ['habit.done', 'playSuccessChime'], ['counter.step', 'playChime'], ['markRest', 'playSuccessChime'],
    ['challenge.claimed', 'playChallengeChime'], ['milestone', 'playHornFanfare'], ['trophy', 'playHornFanfare'],
  ])('%s plays %s', (event, fn) => {
    play(event, { delay: 0 });
    expect(sounds[fn]).toHaveBeenCalledTimes(1);
  });

  test('events without a sound stay silent', () => {
    ['selection', 'toggle.on', 'toggle.off', 'refused', 'error', 'longPress', 'habit.undone', 'destructiveConfirm', 'press']
      .forEach(e => play(e, { delay: 0 }));
    Object.values(sounds).forEach(fn => expect(fn).not.toHaveBeenCalled());
  });
});

describe('rate limit and log', () => {
  test('at most one haptic per 40 ms; later ones in the window are dropped', () => {
    play(EVENTS.counterStep);
    jest.advanceTimersByTime(20);
    play(EVENTS.counterStep);
    jest.advanceTimersByTime(19);
    play(EVENTS.counterStep);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    play(EVENTS.counterStep);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(2);
    // The sound is not rate limited here (F-04b owns the sound limits).
    expect(sounds.playChime).toHaveBeenCalledTimes(4);
  });

  test('the log keeps the last 50 entries with their offset from the tap', () => {
    setPlatform('android', 36);
    play(EVENTS.dayComplete, { delay: 0 });
    jest.advanceTimersByTime(125);
    const [a, b] = recent();
    expect(a).toMatchObject({ event: 'day.complete', haptic: 'android:confirm', offset: 0 });
    expect(b).toMatchObject({ event: 'day.complete', haptic: 'android:confirm', offset: 125 });

    for (let i = 0; i < 60; i++) { jest.advanceTimersByTime(50); play(EVENTS.selection); }
    expect(recent()).toHaveLength(50);
    expect(recent()[49]).toMatchObject({ event: 'selection', haptic: 'android:segment-tick' });
  });
});

describe('source checks', () => {
  const SRC = path.join(__dirname, '..', '..');
  const ROOT = path.join(SRC, '..');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === '__tests__' ? [] : walk(p);
    return p.endsWith('.js') ? [p] : [];
  });
  const files = [...walk(SRC), path.join(ROOT, 'App.js'), path.join(ROOT, 'index.js')];

  test('no file outside src/services/feedback.js imports expo-haptics', () => {
    const offenders = files.filter(f => !f.endsWith(path.join('services', 'feedback.js'))
      && /from ['"]expo-haptics['"]|require\(['"]expo-haptics['"]\)/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  test('src/utils/haptics.js is gone and nothing imports it', () => {
    expect(fs.existsSync(path.join(SRC, 'utils', 'haptics.js'))).toBe(false);
    const offenders = files.filter(f => /utils\/haptics['"]/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  test('no caller re-checks the haptics setting (the service is the gate)', () => {
    const offenders = files.filter(f => /if \(\s*settings\??\.hapticsEnabled/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  test('feedback.js has no Vibration fallback', () => {
    const src = fs.readFileSync(path.join(SRC, 'services', 'feedback.js'), 'utf8');
    expect(src).not.toMatch(/Vibration/);
  });
});

describe('pattern timing', () => {
  test('the second pulse is timed from the first one firing (+125), so a late start keeps the spacing', () => {
    setPlatform('android', 36);
    play(EVENTS.dayComplete, { delay: 0 });
    // Only the first pulse has a timer until it fires; the second is armed from inside it.
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(124);
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledTimes(2);
  });

  test('follow-up pulses bypass the 40 ms limit; a dropped first pulse drops the pattern', () => {
    play(EVENTS.selection);
    jest.advanceTimersByTime(10);
    play(EVENTS.milestone, { delay: 0 }); // first pulse inside the window: whole pattern dropped
    jest.advanceTimersByTime(1000);
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });
});
