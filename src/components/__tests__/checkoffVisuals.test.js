// C-06b round 2: the check-off visuals end to end, on the real beat planner, moment hook and
// bus (fake timers). The strip converges to the live props after every sequence (check,
// un-check, an "at most" limit broken inside the window, a pull), the gold ring never sticks
// (round 1 B1), the line never contradicts the ring (M3), and the card's fade layer is in
// the first committed frame, under the ✓ (M2, m1).
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const { Animated } = require('react-native');

global.IS_REACT_ACT_ENVIRONMENT = true;

let mockReduced = false;
jest.mock('../../utils/a11y', () => ({
  useReducedMotion: () => mockReduced,
  isReducedMotion: () => mockReduced,
  announce: jest.fn(),
}));
jest.mock('../../services/feedback', () => ({
  __esModule: true,
  logFrames: jest.fn(),
  default: { play: jest.fn(() => ({ cancel: jest.fn() })), toggled: jest.fn() },
  EVENTS: { refused: 'refused' },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: (props) => require('react').createElement('Ionicons', props) }));
jest.mock('react-native-svg', () => {
  const R = require('react');
  const C = (name) => (props) => R.createElement(name, props, props.children);
  return { __esModule: true, default: C('Svg'), Circle: C('Circle'), Path: C('Path') };
});

const bus = require('../../utils/beatBus');
const useCheckoffMoment = require('../../hooks/useCheckoffMoment').default;
const useTween = require('../../hooks/useTween').default;
const { useBeatValue } = require('../../hooks/useTween');
const { KINDS, MOMENT_MS } = require('../../utils/beats');
const { useHeaderMoment, TodayRing } = require('../TodayHeader');
const RollingNumber = require('../ui/RollingNumber').default;
const CheckMark = require('../ui/CheckMark').default;
const { themes } = require('../../theme/colors');

const theme = themes.light;

beforeEach(() => {
  jest.useFakeTimers();
  bus.__resetBeatBusForTests();
  mockReduced = false;
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); });

// One screen: the moment hook plus whatever reads the bus, with live props set by the test.
function mountScreen(Child) {
  const api = {};
  function Screen({ props }) {
    api.moment = useCheckoffMoment();
    return <Child {...props} out={api} />;
  }
  let r;
  api.render = (props) => act(() => { if (r) r.update(<Screen props={props} />); else r = TestRenderer.create(<Screen props={props} />); });
  api.root = () => r.root;
  return api;
}
const advance = (ms) => act(() => { jest.advanceTimersByTime(ms); });

describe('useCheckoffMoment publishes visual beats to the bus', () => {
  it('fires beats at 0 at once, holds the rest as pending, and replaces a coalesced beat before cancelling it', () => {
    const seen = [];
    bus.subscribeBeats((e) => seen.push(`${e.type}:${e.item.beat}`));
    const api = {};
    function P() { api.m = useCheckoffMoment(); return null; }
    act(() => { TestRenderer.create(<P />); });
    act(() => { api.m.run({ kind: KINDS.check, habitId: 'a', dayComplete: true, tapAt: Date.now() }); });
    expect(seen).toEqual(['fire:confirm']);
    expect(bus.findBeat({ beat: 'progress' }).status).toBe('pending');
    expect(bus.findBeat({ beat: 'resolution' }).status).toBe('pending');
    // A second check 50 ms later coalesces the header tween: the waiting ring never sees a
    // cancel it could jump on, only the new pending item.
    advance(50);
    act(() => { api.m.run({ kind: KINDS.check, habitId: 'b', tapAt: Date.now() }); });
    expect(seen.filter(s => s === 'cancel:progress')).toEqual([]);
    expect(bus.findBeat({ beat: 'progress' }).item.habitId).toBe('b');
    // An un-check takes back the pending resolution, and says so.
    act(() => { api.m.run({ kind: KINDS.uncheck, habitId: 'a', tapAt: Date.now() }); });
    expect(seen).toContain('cancel:resolution');
    expect(bus.findBeat({ beat: 'resolution' })).toBeNull();
  });

  it('a step that breaks the day takes back the pending resolution (round 1 B1, C-06a side)', () => {
    const api = {};
    function P() { api.m = useCheckoffMoment(); return null; }
    act(() => { TestRenderer.create(<P />); });
    act(() => { api.m.run({ kind: KINDS.check, habitId: 'a', dayComplete: true, tapAt: Date.now() }); });
    advance(300);
    act(() => { api.m.run({ kind: KINDS.step, habitId: 'limit', breaksDay: true, tapAt: Date.now() }); });
    expect(bus.findBeat({ beat: 'resolution' })).toBeNull();
  });
});

describe('useTween anticipate is provisional (round 1 B1)', () => {
  function T({ target, opts, out }) { out.v = useTween(target, opts); return null; }
  const opts = { beat: { beat: 'resolution' }, onlyOnBeat: true, anticipate: () => 1 };

  it('a render that never confirms the anticipated target is reconciled back', () => {
    const out = {};
    let r;
    act(() => { r = TestRenderer.create(<T target={0} opts={opts} out={out} />); });
    const res = { key: 'visual:resolution', beat: 'resolution', at: 750, duration: 200, tapAt: Date.now() - 750 };
    act(() => { bus.emitBeat(res); });
    act(() => { r.update(<T target={0} opts={opts} out={out} />); });
    advance(1000);
    expect(out.v.__getValue()).toBe(0);
  });

  it('a render that confirms it keeps the run', () => {
    const out = {};
    let r;
    act(() => { r = TestRenderer.create(<T target={0} opts={opts} out={out} />); });
    const res = { key: 'visual:resolution', beat: 'resolution', at: 750, duration: 200, tapAt: Date.now() - 750 };
    act(() => { bus.emitBeat(res); });
    act(() => { r.update(<T target={1} opts={opts} out={out} />); });
    advance(1000);
    expect(out.v.__getValue()).toBe(1);
  });
});

describe('useBeatValue releases', () => {
  function H({ value, out }) { out.s = useBeatValue(value, { beat: 'progress' }); return null; }
  it('on a cancel with nothing pending, at the next render (no held value shown for a frame)', () => {
    const out = {};
    let r;
    act(() => { r = TestRenderer.create(<H value="a" out={out} />); });
    const p = { key: 'visual:progress', beat: 'progress', at: 125, duration: 300, tapAt: Date.now() };
    bus.expectBeat(p);
    act(() => { r.update(<H value="b" out={out} />); });
    expect(out.s.value).toBe('a');
    act(() => { bus.cancelBeat(p); });
    expect(out.s.value).toBe('b');
  });
  it('on a coalesced replacement, when the new beat fires', () => {
    const out = {};
    let r;
    act(() => { r = TestRenderer.create(<H value="a" out={out} />); });
    const p1 = { key: 'visual:progress', beat: 'progress', at: 125, duration: 300, tapAt: Date.now() };
    bus.expectBeat(p1);
    act(() => { r.update(<H value="b" out={out} />); });
    const p2 = { ...p1, tapAt: Date.now() + 50 };
    bus.expectBeat(p2);
    act(() => { bus.cancelBeat(p1); }); // identity mismatch: a no-op
    act(() => { r.update(<H value="c" out={out} />); });
    expect(out.s.value).toBe('a');
    act(() => { bus.emitBeat(p2); });
    expect(out.s.value).toBe('c');
  });
});

// The strip's held values against the live props.
function Header({ state, completed, total, streak, out }) {
  out.shown = useHeaderMoment({ state, completed, total, streak, beats: null, challenges: [] });
  return null;
}

describe('useHeaderMoment converges and never contradicts the ring', () => {
  it('a completing check: count and line at +125 ("5 of 5 done"), complete at +750, streak at +875', () => {
    const s = mountScreen(Header);
    s.render({ state: 'progress', completed: 4, total: 5, streak: 3 });
    act(() => { s.moment.run({ kind: KINDS.check, habitId: 'a', dayComplete: true, tapAt: Date.now() }); });
    s.render({ state: 'complete', completed: 5, total: 5, streak: 4 });
    expect(s.shown).toMatchObject({ state: 'progress', completed: 4, line: '4 of 5 done · 1 to go', streak: 3 });
    advance(125);
    expect(s.shown).toMatchObject({ state: 'progress', completed: 5, line: '5 of 5 done', streak: 3 });
    advance(625);
    expect(s.shown).toMatchObject({ state: 'complete', line: 'Day complete · 4-day streak', streak: 3 });
    advance(125);
    expect(s.shown).toMatchObject({ state: 'complete', streak: 4 });
  });

  it('an un-check from complete: centre, count and line switch at once (round 1 M3)', () => {
    const s = mountScreen(Header);
    s.render({ state: 'complete', completed: 5, total: 5, streak: 4 });
    act(() => { s.moment.run({ kind: KINDS.uncheck, habitId: 'a', tapAt: Date.now() }); });
    s.render({ state: 'progress', completed: 4, total: 5, streak: 3 });
    expect(s.shown).toMatchObject({ state: 'progress', completed: 4, line: '4 of 5 done · 1 to go', streak: 3 });
  });

  it('a limit broken inside the window: back to the live state, and the gold never sticks', () => {
    const s = mountScreen(Header);
    s.render({ state: 'progress', completed: 4, total: 5, streak: 3 });
    act(() => { s.moment.run({ kind: KINDS.check, habitId: 'a', dayComplete: true, tapAt: Date.now() }); });
    s.render({ state: 'complete', completed: 5, total: 5, streak: 4 });
    advance(300);
    act(() => { s.moment.run({ kind: KINDS.step, habitId: 'limit', breaksDay: true, tapAt: Date.now() }); });
    s.render({ state: 'progress', completed: 4, total: 5, streak: 3 });
    advance(MOMENT_MS);
    expect(s.shown).toMatchObject({ state: 'progress', completed: 4, total: 5, streak: 3, line: '4 of 5 done · 1 to go' });
  });

  it('a pull (no beat) is live at once', () => {
    const s = mountScreen(Header);
    s.render({ state: 'progress', completed: 1, total: 5, streak: 3 });
    s.render({ state: 'complete', completed: 5, total: 5, streak: 4 });
    expect(s.shown).toMatchObject({ state: 'complete', completed: 5, streak: 4 });
  });
});

describe('TodayRing: the gold sweep, never a cross-fade (round 1 M1), and never stuck (B1)', () => {
  const circles = (root) => root.findAll(n => n.type === 'Circle');
  function Ring({ state, completed, total, liveComplete, out }) {
    return <TodayRing state={state} completed={completed} total={total} theme={theme} ringSize={88} stroke={8} liveComplete={liveComplete} />;
  }

  it('complete at rest: the gold arc fully drawn, the green under it hidden, no opacity layer', () => {
    const s = mountScreen(Ring);
    s.render({ state: 'complete', completed: 5, total: 5, liveComplete: true });
    const [, green, gold] = circles(s.root());
    expect(gold.props.stroke).toBe(theme.signature);
    expect(gold.props.strokeDashoffset).toBeCloseTo(0);
    expect(green.props.strokeOpacity).toBe(0);
  });

  it('the resolution beat sweeps the gold dash in; a broken day (live not complete) never starts it', () => {
    const s = mountScreen(Ring);
    s.render({ state: 'progress', completed: 5, total: 5, liveComplete: false });
    const res = { key: 'visual:resolution', beat: 'resolution', at: 750, duration: 200, tapAt: Date.now() - 750 };
    act(() => { bus.emitBeat(res); });
    advance(1000);
    s.render({ state: 'progress', completed: 5, total: 5, liveComplete: false });
    const gold = circles(s.root())[2];
    expect(gold.props.strokeOpacity).toBe(0);
  });

  it('leaving complete is a cut: the gold arc goes in the same frame', () => {
    const s = mountScreen(Ring);
    s.render({ state: 'complete', completed: 5, total: 5, liveComplete: true });
    act(() => { s.moment.run({ kind: KINDS.uncheck, habitId: 'a', tapAt: Date.now() }); });
    s.render({ state: 'progress', completed: 4, total: 5, liveComplete: false });
    s.render({ state: 'progress', completed: 4, total: 5, liveComplete: false }); // read the props after the layout effect
    const gold = circles(s.root())[2];
    expect(gold.props.strokeOpacity).toBe(0);
  });
});

describe('RollingNumber and CheckMark', () => {
  let starts;
  beforeEach(() => {
    starts = [];
    jest.spyOn(Animated, 'timing').mockImplementation((value, config) => ({ start: () => { starts.push(config); }, stop: jest.fn() }));
  });
  const texts = (r) => r.root.findAll(n => n.type === 'Text').map(n => n.props.children);
  const num = (v) => (typeof v === 'number' ? v : v.__getValue());

  it('rolls only when told to: two copies while rolling, one otherwise', () => {
    let r;
    act(() => { r = TestRenderer.create(<RollingNumber value={3} />); });
    act(() => { r.update(<RollingNumber value={4} />); });
    expect(texts(r)).toEqual([4]);
    act(() => { r.update(<RollingNumber value={5} roll />); });
    expect(texts(r)).toEqual([5, 4]);
    expect(starts[0].duration).toBe(200);
  });

  it('reduced motion: an in-place cross-fade (no translate), 150 ms', () => {
    mockReduced = true;
    let r;
    act(() => { r = TestRenderer.create(<RollingNumber value={3} />); });
    act(() => { r.update(<RollingNumber value={4} roll />); });
    const moving = r.root.findAll(n => n.props && n.props.style && [].concat(n.props.style).some(s => s && s.transform));
    moving.forEach((n) => {
      const st = Object.assign({}, ...[].concat(n.props.style).filter(Boolean));
      st.transform.forEach(tr => expect(num(tr.translateY)).toBe(0));
    });
    expect(starts[0].duration).toBe(150);
  });

  it('CheckMark: static without progress; two counter-moving clip layers with it', () => {
    let r;
    act(() => { r = TestRenderer.create(<CheckMark color="#000000" />); });
    expect(r.root.findAll(n => n.props && n.props.style && [].concat(n.props.style).some(s => s && s.transform))).toHaveLength(0);
    const p = new Animated.Value(0);
    act(() => { r.update(<CheckMark color="#000000" size={16} strokeWidth={2.4} progress={p} />); });
    const layers = r.root.findAll(n => typeof n.type === 'string' && n.props && n.props.style && [].concat(n.props.style).flat(Infinity).some(s => s && s.transform));
    const xs = layers.map(n => num(Object.assign({}, ...[].concat(n.props.style).flat(Infinity).filter(Boolean)).transform[0].translateX));
    // At 0 the window is pushed left and the glyph pushed back right by the same amount.
    expect(xs[0]).toBeLessThan(0);
    expect(xs[0] + xs[1]).toBeCloseTo(0);
  });
});

describe('reduced motion variants of the chips', () => {
  const { StreakChip, ChallengeChip } = require('../TodayHeader');
  let calls;
  beforeEach(() => {
    calls = { timing: [], spring: 0 };
    jest.spyOn(Animated, 'timing').mockImplementation((v, c) => { calls.timing.push(c); return { start: (cb) => { v.setValue(c.toValue); cb?.({ finished: true }); }, stop: jest.fn() }; });
    jest.spyOn(Animated, 'spring').mockImplementation((v, c) => { calls.spring += 1; return { start: (cb) => { v.setValue(c.toValue); cb?.({ finished: true }); }, stop: jest.fn() }; });
  });
  const tick = { beat: 'streakTick', at: 875, duration: 150, tapAt: 0 };

  it('streak tick: full motion pulses the flame (to 1.12 then a spring), reduced flashes the colour in 150 ms', () => {
    let r;
    act(() => { r = TestRenderer.create(<StreakChip streak={3} theme={theme} />); });
    act(() => { r.update(<StreakChip streak={4} theme={theme} tick={tick} />); });
    expect(calls.timing.map(c => c.toValue)).toContain(1.12);
    expect(calls.spring).toBe(1);
    mockReduced = true;
    calls = { timing: [], spring: 0 };
    act(() => { r = TestRenderer.create(<StreakChip streak={3} theme={theme} />); });
    act(() => { r.update(<StreakChip streak={4} theme={theme} tick={tick} />); });
    expect(calls.spring).toBe(0);
    // The flash: up and back down in half of 150 ms each (the number's roll is a separate
    // 150 ms in-place cross-fade).
    const flash = calls.timing.filter(c => c.duration === 75);
    expect(flash.map(c => c.toValue)).toEqual([1, 0]);
  });

  it('a claimed challenge chip springs from 0.8; under reduced motion only its ✓ fades in', () => {
    const pop = { beat: 'linkedReward', at: 250, duration: 200, tapAt: 0 };
    let r;
    const chip = (done, p) => <ChallengeChip name="Kickstart" day={2} days={3} done={done} theme={theme} onPress={() => {}} pop={p} />;
    act(() => { r = TestRenderer.create(chip(false, null)); });
    act(() => { r.update(chip(true, pop)); });
    expect(calls.spring).toBe(1);
    mockReduced = true;
    calls = { timing: [], spring: 0 };
    act(() => { r = TestRenderer.create(chip(false, null)); });
    act(() => { r.update(chip(true, pop)); });
    expect(calls.spring).toBe(0);
    expect(calls.timing).toHaveLength(1);
    expect(calls.timing[0].duration).toBe(150);
  });
});
