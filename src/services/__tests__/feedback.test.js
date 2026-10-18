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
jest.mock('../../utils/sounds', () => ({ playSound: jest.fn() }));

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
  'sound.preview': { ios: [], android: [] },
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
    expect(sounds.playSound).not.toHaveBeenCalled();
    jest.advanceTimersByTime(100);
    configure({ haptics: false, sound: true });
    play(EVENTS.habitDone);
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(sounds.playSound).toHaveBeenCalledTimes(1);
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

describe('sound routing (F-04b kit, plan §2.11)', () => {
  test.each([
    ['habit.done', { n: 1 }, 'habit-1'], ['habit.done', { n: 3 }, 'habit-3'], ['habit.done', { step: 8, goal: 8 }, 'goal'],
    ['counter.step', { step: 1, goal: 8 }, 'counter-0'], ['counter.step', { step: 9, goal: 8 }, 'over'],
    ['habit.undone', undefined, 'undone'], ['challenge.claimed', undefined, 'challenge'], ['day.complete', undefined, 'chord'],
    ['markRest', undefined, 'chord'], ['milestone', undefined, 'fanfare'], ['trophy', undefined, 'fanfare'],
    ['sound.preview', undefined, 'habit-1'],
  ])('%s %j plays %s', (event, tone, id) => {
    play(event, { delay: 0, tone });
    jest.advanceTimersByTime(1000);
    expect(sounds.playSound).toHaveBeenCalledTimes(1);
    expect(sounds.playSound).toHaveBeenCalledWith(id);
  });

  test('events without a sound stay silent', () => {
    ['selection', 'toggle.on', 'toggle.off', 'refused', 'error', 'longPress', 'destructiveConfirm', 'press']
      .forEach(e => play(e, { delay: 0 }));
    jest.advanceTimersByTime(1000);
    expect(sounds.playSound).not.toHaveBeenCalled();
  });

  test('Mark the rest: Success haptic at 0, one chord at 750 (§4.1), cancellable', () => {
    play(EVENTS.markRest);
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(749);
    expect(sounds.playSound).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(sounds.playSound).toHaveBeenCalledWith('chord');
    const h = play(EVENTS.markRest);
    h.cancel();
    jest.advanceTimersByTime(1000);
    expect(sounds.playSound).toHaveBeenCalledTimes(1);
  });

  test('sound.preview has no haptic of its own', () => {
    setPlatform('android', 36);
    play(EVENTS.soundPreview);
    expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
    expect(sounds.playSound).toHaveBeenCalledWith('habit-1');
  });

  test('tap sounds: at most one start per 60 ms; celebrations are never dropped', () => {
    play(EVENTS.counterStep, { tone: { step: 1, goal: 8 } });
    jest.advanceTimersByTime(59);
    play(EVENTS.counterStep, { tone: { step: 2, goal: 8 } });
    expect(sounds.playSound).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    play(EVENTS.counterStep, { tone: { step: 3, goal: 8 } });
    expect(sounds.playSound).toHaveBeenCalledTimes(2);
    // The degree advanced with the dropped step: step 3 plays its own note.
    expect(sounds.playSound).toHaveBeenLastCalledWith('counter-1');
    play(EVENTS.dayComplete, { delay: 0 });
    play(EVENTS.challengeClaimed, { delay: 0 });
    expect(sounds.playSound).toHaveBeenCalledTimes(4);
  });

  test('atMost: the tap that breaks the limit keeps its haptic but plays no sound', () => {
    play(EVENTS.counterStep, { tone: { step: 4, goal: 3, atMost: true } });
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(sounds.playSound).not.toHaveBeenCalled();
    jest.advanceTimersByTime(100);
    play(EVENTS.counterStep, { tone: { step: 2, goal: 3, atMost: true } });
    expect(sounds.playSound).toHaveBeenCalledWith('tick');
  });

  test('sound off: the sounds module is never asked to play', () => {
    configure({ haptics: true, sound: false });
    Object.values(EVENTS).forEach(e => play(e, { delay: 0, tone: { n: 2 } }));
    jest.advanceTimersByTime(2000);
    expect(sounds.playSound).not.toHaveBeenCalled();
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
    // Sounds have their own 60 ms limit: only the tap at 0 starts one (the others are within 60 ms).
    expect(sounds.playSound).toHaveBeenCalledTimes(1);
  });

  test('the log keeps the last 50 entries with their offset from the tap', () => {
    setPlatform('android', 36);
    play(EVENTS.dayComplete, { delay: 0 });
    jest.advanceTimersByTime(125);
    const [a, b] = recent().filter(e => e.haptic);
    expect(a).toMatchObject({ event: 'day.complete', haptic: 'android:confirm', offset: 0 });
    expect(b).toMatchObject({ event: 'day.complete', haptic: 'android:confirm', offset: 125 });

    for (let i = 0; i < 60; i++) { jest.advanceTimersByTime(50); play(EVENTS.selection); }
    expect(recent()).toHaveLength(50);
    expect(recent()[49]).toMatchObject({ event: 'selection', haptic: 'android:segment-tick' });
  });

  test('C-06a: `at` (the tap time) anchors the delay, and the log records the beat and the drift', () => {
    setPlatform('android', 36);
    const tapAt = Date.now();
    jest.advanceTimersByTime(200); // the JS thread was busy for 200 ms before play() ran
    play(EVENTS.dayComplete, { at: tapAt });
    jest.advanceTimersByTime(549);
    expect(recent().filter(e => e.haptic)).toEqual([]);
    jest.advanceTimersByTime(1);
    // Fired at +750 from the tap, not +950: on its beat, drift 0. The second pulse follows at +125.
    const [first] = recent().filter(e => e.haptic);
    expect(first).toMatchObject({ event: 'day.complete', offset: 750, target: 750, drift: 0 });
    jest.advanceTimersByTime(125);
    const sound = recent().find(e => e.sound === 'chord');
    expect(sound).toMatchObject({ offset: 750, target: 750, drift: 0 });
    expect(recent().filter(e => e.haptic)[1]).toMatchObject({ offset: 875, target: 875, drift: 0 });
  });

  test('C-06a: a play that arrives after its beat fires at once and logs the drift', () => {
    setPlatform('android', 36);
    const tapAt = Date.now();
    jest.advanceTimersByTime(300);
    play(EVENTS.challengeClaimed, { at: tapAt, delay: 250 });
    expect(recent().find(e => e.haptic)).toMatchObject({ offset: 300, target: 250, drift: 50 });
    // A future or missing `at` counts from now.
    feedback.clearRecent();
    play(EVENTS.habitDone, { at: Date.now() + 5000, tone: { n: 1 } });
    expect(recent().find(e => e.haptic)).toMatchObject({ offset: 0, target: 0, drift: 0 });
  });

  test('C-06a review M1: a follow-up pulse is timed from the tap, so lateness does not add up', () => {
    setPlatform('android', 36);
    const tapAt = Date.now();
    jest.advanceTimersByTime(50); // play() runs 50 ms after the tap
    play(EVENTS.dayComplete, { at: tapAt, delay: 0 });
    const pulses = () => recent().filter(e => e.haptic);
    expect(pulses()[0]).toMatchObject({ offset: 50, target: 0, drift: 50 });
    jest.advanceTimersByTime(74);
    expect(pulses()).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(pulses()[1]).toMatchObject({ offset: 125, target: 125, drift: 0 });
  });

  test('C-06a review M1: a pattern already past its next beat keeps the minimum gap', () => {
    setPlatform('android', 36);
    const tapAt = Date.now();
    jest.advanceTimersByTime(400);
    play(EVENTS.dayComplete, { at: tapAt, delay: 0 });
    jest.advanceTimersByTime(feedback.PULSE_MIN_GAP_MS - 1);
    expect(recent().filter(e => e.haptic)).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(recent().filter(e => e.haptic)[1]).toMatchObject({ offset: 400 + feedback.PULSE_MIN_GAP_MS });
  });

  test('C-06a review n1: with haptics and sound off there is no moment to wait out', () => {
    configure({ haptics: false, sound: false });
    play(EVENTS.habitDone, { tone: { n: 1 } });
    expect(feedback.quietIn()).toBe(0);
  });

  test('C-06a: quietIn counts down the moment after the last play', () => {
    expect(feedback.quietIn()).toBe(0);
    play(EVENTS.habitDone, { tone: { n: 1 } });
    expect(feedback.quietIn()).toBe(feedback.PREWARM_QUIET_MS);
    jest.advanceTimersByTime(1000);
    expect(feedback.quietIn()).toBe(feedback.PREWARM_QUIET_MS - 1000);
    jest.advanceTimersByTime(1000);
    expect(feedback.quietIn()).toBe(0);
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

  test('celebration events are never rate limited: a milestone 10 ms after a selection still fires', () => {
    play(EVENTS.selection);
    jest.advanceTimersByTime(10);
    play(EVENTS.milestone, { delay: 0 });
    jest.advanceTimersByTime(1000);
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);
  });

  test('milestone landing 10 ms after day.complete\'s second pulse: both patterns fire in full', () => {
    setPlatform('android', 36);
    play(EVENTS.dayComplete, { delay: 0 }); // Confirm at 0, Confirm at +125
    jest.advanceTimersByTime(125);
    expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(10);
    play(EVENTS.milestone, { delay: 0 }); // Confirm, Confirm +125, Gesture_End +250
    jest.advanceTimersByTime(1000);
    expect(Haptics.performAndroidHapticsAsync.mock.calls.map(c => c[0]))
      .toEqual(['confirm', 'confirm', 'confirm', 'confirm', 'gesture-end']);
  });

  test.each([EVENTS.trophy, EVENTS.challengeClaimed, EVENTS.dayComplete, EVENTS.markRest, EVENTS.habitDone])(
    '%s right after another haptic is not dropped', (event) => {
      play(EVENTS.counterStep);
      jest.advanceTimersByTime(5);
      play(event, { delay: 0 });
      jest.advanceTimersByTime(1000);
      expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
      expect(Haptics.impactAsync.mock.calls.length + Haptics.notificationAsync.mock.calls.length).toBeGreaterThan(0);
    },
  );

  test('a dropped repeat tap shows in the log as dropped', () => {
    play(EVENTS.counterStep);
    jest.advanceTimersByTime(10);
    play(EVENTS.selection);
    expect(recent().filter(e => e.dropped)).toEqual([expect.objectContaining({ event: 'selection', dropped: true })]);
  });
});

describe('cancel and sound:false', () => {
  test('cancel() drops a pending day.complete (an un-check inside the 750 ms window)', () => {
    setPlatform('android', 36);
    const handle = play(EVENTS.dayComplete);
    jest.advanceTimersByTime(500);
    handle.cancel();
    jest.advanceTimersByTime(2000);
    expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
    expect(recent()).toEqual([]);
  });

  test('cancel() between pulses stops the rest of the pattern', () => {
    const handle = play(EVENTS.milestone, { delay: 0 });
    jest.advanceTimersByTime(130);
    handle.cancel();
    jest.advanceTimersByTime(1000);
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  });

  test('cancel() also drops a pending sound; an unknown event returns a no-op handle', () => {
    const handle = play(EVENTS.challengeClaimed);
    handle.cancel();
    jest.advanceTimersByTime(1000);
    expect(sounds.playSound).not.toHaveBeenCalled();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => play('nope').cancel()).not.toThrow();
    warn.mockRestore();
  });

  test('sound:false plays the haptic only', () => {
    play(EVENTS.counterStep, { sound: false });
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(sounds.playSound).not.toHaveBeenCalled();
  });
});

describe('call-site source checks (review M1/m1-m3)', () => {
  const read = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8').replace(/\r\n/g, '\n');

  test('TodayScreen keeps the pending day.complete / challenge.claimed handles and an un-check cancels them', () => {
    const src = read('screens/TodayScreen.js');
    expect(src).toMatch(/keepPending\(feedback\.play\(EVENTS\.dayComplete\)\)/);
    expect(src).toMatch(/keepPending\(feedback\.play\(EVENTS\.challengeClaimed\)\)/);
    const dec = src.slice(src.indexOf('const handleDecrement'), src.indexOf('const handleSkipToggle'));
    expect(dec).toMatch(/cancelPendingFeedback\(\);\s*feedback\.play\(EVENTS\.habitUndone\)/);
    // A −1 that is not an un-check: haptic only, no rising chime.
    expect(dec).toMatch(/feedback\.play\(EVENTS\.counterStep, \{ sound: false \}\)/);
    const undoRest = src.slice(src.indexOf('const undoMarkRest'), src.indexOf('return (', src.indexOf('const undoMarkRest')));
    expect(undoRest).toMatch(/cancelPendingFeedback\(\)/);
  });

  test('every destructive Alert plays destructiveConfirm just before it opens', () => {
    for (const rel of ['screens/SettingsScreen.js', 'screens/HabitsScreen.js', 'screens/ChallengeScreen.js']) {
      const src = read(rel);
      // Each Alert.alert( call whose button list has a destructive style...
      const calls = [...src.matchAll(/Alert\.alert\(/g)].map(m => m.index);
      for (const i of calls) {
        const next = calls.find(j => j > i) ?? src.length;
        // ...up to the next Alert.alert (a nested confirm is checked on its own).
        if (!/style: 'destructive'/.test(src.slice(i, Math.min(next, i + 900)))) continue;
        const before = src.slice(Math.max(0, i - 120), i);
        expect({ file: rel, at: src.slice(0, i).split('\n').length, ok: /destructiveConfirm\);\s*$/.test(before) })
          .toEqual({ file: rel, at: src.slice(0, i).split('\n').length, ok: true });
      }
    }
  });
});

describe('pre-render scheduling (F-04b M1)', () => {
  test('isBusy for 1.5 s after any feedback event', () => {
    expect(feedback.isBusy()).toBe(false);
    play(EVENTS.selection);
    expect(feedback.isBusy()).toBe(true);
    jest.advanceTimersByTime(1499);
    expect(feedback.isBusy()).toBe(true);
    jest.advanceTimersByTime(1);
    expect(feedback.isBusy()).toBe(false);
  });

  test('prewarmSounds hands sounds.prewarm a live isBusy, only with sound on and not on web', () => {
    sounds.prewarm = jest.fn();
    configure({ sound: false });
    feedback.prewarmSounds();
    expect(sounds.prewarm).not.toHaveBeenCalled();
    configure({ sound: true });
    setPlatform('web', undefined);
    feedback.prewarmSounds();
    expect(sounds.prewarm).not.toHaveBeenCalled();
    setPlatform('android', 36);
    feedback.prewarmSounds();
    expect(sounds.prewarm).toHaveBeenCalledTimes(1);
    const { isBusy } = sounds.prewarm.mock.calls[0][0];
    jest.advanceTimersByTime(2000);
    expect(isBusy()).toBe(false);
    play(EVENTS.habitDone);
    expect(isBusy()).toBe(true);
  });

  test('AppContext starts the pre-render once loaded with sound on', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'context', 'AppContext.js'), 'utf8');
    expect(src).toMatch(/if \(loaded && settings\.soundEnabled\) feedback\.prewarmSounds\(\)/);
  });
});

describe('F-04b call sites', () => {
  const read = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8').replace(/\r\n/g, '\n');

  test('TodayScreen passes the ladder tone and keeps the Mark-the-rest chord cancellable', () => {
    const src = read('screens/TodayScreen.js');
    expect(src).toMatch(/feedback\.play\(justCompleted \? EVENTS\.habitDone : EVENTS\.counterStep, \{ tone \}\)/);
    expect(src).toMatch(/keepPending\(feedback\.play\(EVENTS\.markRest\)\)/);
  });

  test('Settings previews Sounds through its own event, never a chime directly', () => {
    const src = read('screens/SettingsScreen.js');
    expect(src).toMatch(/feedback\.play\(EVENTS\.soundPreview\)/);
    // updateSettings applies the gate synchronously; screens never configure feedback (m3).
    expect(src).not.toMatch(/feedback\.configure/);
    expect(src).not.toMatch(/utils\/sounds/);
  });

  test('only feedback.js loads the sounds module', () => {
    const offenders = [];
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach(d => {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) { if (d.name !== '__tests__') walk(p); return; }
      if (!p.endsWith('.js') || p.endsWith(path.join('services', 'feedback.js'))) return;
      if (/['"](\.\.?\/)+(utils\/)?sounds['"]/.test(fs.readFileSync(p, 'utf8'))) offenders.push(p);
    });
    walk(path.join(__dirname, '..', '..'));
    expect(offenders).toEqual([]);
  });
});
