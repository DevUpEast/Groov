// C-06b: the beat bus and the beat-driven tween / held value. A change made while its beat is
// pending waits for it; a change inside a fired beat rides what is left of it; a change with
// no beat (sync pull, choreography off) is immediate.
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const { Animated } = require('react-native');

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../utils/a11y', () => ({ useReducedMotion: () => false, isReducedMotion: () => false }));
jest.mock('../../services/feedback', () => ({ __esModule: true, logFrames: jest.fn(), default: {} }));

const bus = require('../../utils/beatBus');
const useTween = require('../useTween').default;
const { useBeatValue } = require('../useTween');
const { logFrames } = require('../../services/feedback');

let starts;
beforeEach(() => {
  jest.useFakeTimers();
  bus.__resetBeatBusForTests();
  starts = [];
  logFrames.mockClear();
  jest.spyOn(Animated, 'timing').mockImplementation((value, config) => ({
    start: (cb) => { starts.push({ at: Date.now(), ...config }); value.setValue(config.toValue); cb?.({ finished: true }); },
    stop: jest.fn(),
  }));
});
afterEach(() => { jest.restoreAllMocks(); jest.clearAllTimers(); jest.useRealTimers(); });

const item = (beat, at, length, tapAt, extra = {}) => ({ key: `visual:${beat}${extra.habitId ? `:${extra.habitId}` : ''}`, beat, at, duration: length, tapAt, ...extra });

function Tween({ target, opts, out }) { out.value = useTween(target, opts); return null; }
function Held({ value, match, opts, out }) { out.shown = useBeatValue(value, match, opts); return null; }

describe('beatBus', () => {
  it('finds pending beats first, then fired ones inside their window (plus the grace)', () => {
    const now = Date.now();
    const p = item('progress', 125, 300, now);
    bus.expectBeat(p);
    expect(bus.findBeat({ beat: 'progress' })).toEqual({ status: 'pending', item: p });
    bus.emitBeat(p);
    expect(bus.findBeat({ beat: 'progress' }).status).toBe('fired');
    jest.setSystemTime(now + 425 + bus.FIRED_GRACE_MS + 1);
    expect(bus.findBeat({ beat: 'progress' })).toBeNull();
  });

  it('matches habit beats per card; a beat with no habit (Mark the rest) matches every card', () => {
    const c = item('confirm', 0, 200, Date.now(), { habitId: 'a' });
    expect(bus.matchesBeat(c, { beat: 'confirm', habitId: 'a' })).toBe(true);
    expect(bus.matchesBeat(c, { beat: 'confirm', habitId: 'b' })).toBe(false);
    expect(bus.matchesBeat({ ...c, habitId: null }, { beat: 'confirm', habitId: 'b' })).toBe(true);
    expect(bus.matchesBeat(c, { beat: ['count', 'confirm'], habitId: 'a' })).toBe(true);
  });

  it('a late ride still plays for at least 150 ms', () => {
    const now = Date.now();
    const c = item('confirm', 0, 200, now - 300);
    expect(bus.rideLength(c, now)).toBe(150);
    expect(bus.rideLength(item('confirm', 0, 200, now - 20), now)).toBe(180);
  });
});

describe('useTween', () => {
  const out = {};
  const mount = (target, opts) => { let r; act(() => { r = TestRenderer.create(<Tween target={target} opts={opts} out={out} />); }); return r; };
  const update = (r, target, opts) => act(() => { r.update(<Tween target={target} opts={opts} out={out} />); });

  it('no beat: tweens over its duration, or jumps with onlyOnBeat (the immediate state)', () => {
    const r = mount(0, {});
    update(r, 1, {});
    expect(starts).toHaveLength(1);
    expect(starts[0].duration).toBe(300);
    const j = mount(0, { onlyOnBeat: true });
    starts = [];
    update(j, 0.5, { onlyOnBeat: true });
    expect(starts).toHaveLength(0);
    expect(out.value.__getValue()).toBe(0.5);
  });

  it('waits for a pending beat and runs over its window (the ring: +125 for 300 ms)', () => {
    const opts = { beat: { beat: 'progress' }, onlyOnBeat: true, log: 'ring' };
    const r = mount(0.25, opts);
    const tapAt = Date.now();
    const p = item('progress', 125, 300, tapAt);
    bus.expectBeat(p);
    update(r, 0.5, opts);
    expect(starts).toHaveLength(0);
    expect(out.value.__getValue()).toBe(0.25);
    jest.advanceTimersByTime(125);
    act(() => { bus.emitBeat(p); });
    expect(starts).toHaveLength(1);
    expect(starts[0].at - tapAt).toBe(125);
    expect(starts[0].duration).toBe(300);
    expect(out.value.__getValue()).toBe(0.5);
    // __DEV__: the run's frames go to the Feedback log against the planned window.
    expect(logFrames).toHaveBeenCalledWith(expect.objectContaining({ name: 'ring', tapAt, target: 125, length: 300 }));
  });

  it('a cancelled beat with nothing pending shows the change at once', () => {
    const opts = { beat: { beat: 'resolution' }, onlyOnBeat: true };
    const r = mount(0, opts);
    const res = item('resolution', 750, 200, Date.now());
    bus.expectBeat(res);
    update(r, 1, opts);
    expect(out.value.__getValue()).toBe(0);
    act(() => { bus.cancelBeat(res); });
    expect(out.value.__getValue()).toBe(1);
  });

  it('a change inside a fired beat rides it; `from` restarts the check draw at 0', () => {
    const seen = [];
    const opts = { beat: { beat: 'confirm', habitId: 'a' }, onlyOnBeat: true, from: (_p, n) => (n === 1 ? 0 : null) };
    const r = mount(0, opts);
    const c = item('confirm', 0, 200, Date.now(), { habitId: 'a' });
    bus.emitBeat(c);
    out.value.addListener(({ value }) => seen.push(value));
    update(r, 1, opts);
    expect(starts).toHaveLength(1);
    expect(starts[0].duration).toBe(200);
    expect(seen).toEqual([0, 1]);
  });
});

describe('useBeatValue', () => {
  const out = {};
  const match = { beat: 'linkedReward' };
  const mount = (value, opts) => { let r; act(() => { r = TestRenderer.create(<Held value={value} match={match} opts={opts} out={out} />); }); return r; };
  const update = (r, value, opts) => act(() => { r.update(<Held value={value} match={match} opts={opts} out={out} />); });

  it('holds the old value until its beat, then releases it with that beat', () => {
    const r = mount('open');
    const b = item('linkedReward', 250, 200, Date.now());
    bus.expectBeat(b);
    update(r, 'claimed');
    expect(out.shown).toEqual({ value: 'open', beat: null });
    act(() => { bus.emitBeat(b); });
    expect(out.shown).toEqual({ value: 'claimed', beat: b });
  });

  it('outside a moment the value is live', () => {
    const r = mount('open');
    update(r, 'claimed');
    expect(out.shown).toEqual({ value: 'claimed', beat: null });
  });

  it("release 'end' waits for the end of the beat's window (the beat-row mark at +425)", () => {
    const r = mount('open', { release: 'end' });
    const b = item('linkedReward', 125, 300, Date.now());
    bus.expectBeat(b);
    update(r, 'done', { release: 'end' });
    act(() => { bus.emitBeat(b); });
    expect(out.shown.value).toBe('open');
    act(() => { jest.advanceTimersByTime(300); });
    expect(out.shown.value).toBe('done');
  });
});
