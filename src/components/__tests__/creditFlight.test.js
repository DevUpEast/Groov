// C-07: the day-complete credit (card -> ring), RingBurst, the anchors they measure, and the
// TabScope that keeps hidden tabs out of a check-off's render.
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const { Animated, InteractionManager } = require('react-native');

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
  logMark: jest.fn(),
  default: { play: jest.fn(() => ({ cancel: jest.fn() })), toggled: jest.fn() },
  EVENTS: { refused: 'refused' },
}));
jest.mock('react-native-svg', () => {
  const R = require('react');
  const C = (name) => (props) => R.createElement(name, props, props.children);
  return { __esModule: true, default: C('Svg'), Circle: C('Circle'), Path: C('Path') };
});
// Window rects by anchor key; the overlay layers measure as the whole body.
const mockRects = {};
jest.mock('../../utils/creditAnchors', () => {
  const real = jest.requireActual('../../utils/creditAnchors');
  return {
    ...real,
    measureNode: jest.fn(() => Promise.resolve({ x: 0, y: 100, width: 400, height: 700 })),
    measureAnchor: jest.fn((key) => Promise.resolve(mockRects[key] || null)),
  };
});

const bus = require('../../utils/beatBus');
const anchors = jest.requireActual('../../utils/creditAnchors');
const { planBeats, KINDS, MOMENT_MS } = require('../../utils/beats');
const CreditFlight = require('../CreditFlight').default;
const { creditCurveSamples, pickDeparture } = require('../CreditFlight');
const RingBurst = require('../RingBurst').default;
const { burstParticles } = require('../RingBurst');
const { amount } = require('../../theme/motion');
const { themes } = require('../../theme/colors');

const theme = themes.light;
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const item = (beat, extra = {}) => ({ beat, key: `visual:${beat}`, channel: 'visual', at: beat === 'creditDeparts' ? 500 : 750, duration: 250, tapAt: Date.now() - 500, group: 'resolution', ...extra });

beforeEach(() => {
  bus.__resetBeatBusForTests();
  mockReduced = false;
  Object.keys(mockRects).forEach((k) => delete mockRects[k]);
  jest.restoreAllMocks();
  // The idle pre-warm run is checked on its own below.
  jest.spyOn(InteractionManager, 'runAfterInteractions').mockReturnValue({ cancel() {} });
});

describe('anchors and the departure point (pure)', () => {
  const layer = { x: 0, y: 0, width: 400, height: 700 };
  const edge = { x: 16, y: 120, width: 368, height: 100 };
  it('leaves from the check when it is on screen', () => {
    expect(anchors.departurePoint({ source: { x: 340, y: 400, width: 32, height: 32 }, layer, edge })).toEqual({ x: 356, y: 416 });
  });
  it('leaves from the strip edge when the card is off screen or gone (§4.2)', () => {
    const fromEdge = { x: 16 + 368 * anchors.EDGE_X, y: 220 };
    expect(anchors.departurePoint({ source: { x: 340, y: 900, width: 32, height: 32 }, layer, edge })).toEqual(fromEdge);
    expect(anchors.departurePoint({ source: null, layer, edge })).toEqual(fromEdge);
  });
  it('treats a card under the sticky bar as hidden', () => {
    const cover = { x: 0, y: 0, width: 400, height: 48 };
    expect(anchors.departurePoint({ source: { x: 340, y: 10, width: 32, height: 32 }, layer, edge: cover, cover })).toEqual({ x: 300, y: 48 });
  });
  it('Mark the rest: the bottom-most changed card on screen', () => {
    const sources = [{ x: 340, y: 300, width: 32, height: 32 }, { x: 340, y: 500, width: 32, height: 32 }, { x: 340, y: 950, width: 32, height: 32 }];
    expect(pickDeparture({ sources, layer, edge })).toEqual({ x: 356, y: 516 });
  });
  it('relativeTo and centreOf', () => {
    expect(anchors.centreOf(anchors.relativeTo({ x: 10, y: 110, width: 20, height: 20 }, { x: 0, y: 100 }))).toEqual({ x: 20, y: 20 });
  });
});

describe('the credit path', () => {
  it('starts at the card, ends in the ring, and rises before it sweeps across', () => {
    const { input, ex, ey } = creditCurveSamples();
    expect(input[0]).toBe(0);
    expect(input[input.length - 1]).toBe(1);
    expect(ex[0]).toBeCloseTo(0);
    expect(ey[0]).toBeCloseTo(0);
    expect(ex[ex.length - 1]).toBeCloseTo(1);
    expect(ey[ey.length - 1]).toBeCloseTo(1);
    const mid = Math.floor(input.length / 2);
    expect(ey[mid]).toBeGreaterThan(ex[mid]); // curved, not a straight line
  });
  it('planBeats carries the credit source (the checked habit, or Mark the rest\'s cards)', () => {
    const check = planBeats({ kind: KINDS.check, habitId: 'h1', dayComplete: true });
    expect(check.items.find((i) => i.beat === 'creditDeparts').creditFrom).toBe('h1');
    const rest = planBeats({ kind: KINDS.markRest, dayComplete: true, creditFrom: ['a', 'b'] });
    expect(rest.items.find((i) => i.beat === 'creditDeparts').creditFrom).toEqual(['a', 'b']);
    expect(planBeats({ kind: KINDS.check, habitId: 'h1', dayComplete: true, reduced: true }).items.some((i) => i.beat === 'creditDeparts')).toBe(false);
  });
});

describe('CreditFlight', () => {
  it('flies from the check to the ring on creditDeparts, landing on the resolution beat', async () => {
    mockRects['check:h1'] = { x: 340, y: 500, width: 32, height: 32 };
    mockRects.ring = { x: 30, y: 130, width: 88, height: 88 };
    const timing = jest.spyOn(Animated, 'timing');
    let r;
    act(() => { r = TestRenderer.create(<CreditFlight theme={theme} targets={() => ({ ring: 'ring', edge: 'strip' })} />); });
    bus.expectBeat(item('resolution'));
    act(() => { bus.emitBeat(item('creditDeparts', { creditFrom: 'h1' })); });
    await flush();
    expect(timing).toHaveBeenCalledTimes(1);
    const [, cfg] = timing.mock.calls[0];
    expect(cfg.toValue).toBe(1);
    expect(cfg.useNativeDriver).toBe(true);
    // Planned to land at tapAt + 750: about 250 ms left.
    expect(cfg.duration).toBeGreaterThan(200);
    expect(cfg.duration).toBeLessThanOrEqual(250);
    // Everything in the layer is touch-transparent.
    expect(r.root.findAll((n) => n.props.pointerEvents === 'none').length).toBeGreaterThan(0);
    act(() => r.unmount());
  });
  it('an un-check (resolution cancelled) takes the credit back mid-flight', async () => {
    mockRects['check:h1'] = { x: 340, y: 500, width: 32, height: 32 };
    mockRects.ring = { x: 30, y: 130, width: 88, height: 88 };
    const stop = jest.fn();
    jest.spyOn(Animated, 'timing').mockReturnValue({ start: jest.fn(), stop });
    let r;
    act(() => { r = TestRenderer.create(<CreditFlight theme={theme} targets={() => ({ ring: 'ring' })} />); });
    const res = item('resolution');
    bus.expectBeat(res);
    act(() => { bus.emitBeat(item('creditDeparts', { creditFrom: 'h1' })); });
    await flush();
    act(() => { bus.cancelBeat(res); });
    expect(stop).toHaveBeenCalled();
    act(() => r.unmount());
  });
  it('no credit once the ring has resolved (measuring outlasted the window)', async () => {
    mockRects['check:h1'] = { x: 340, y: 500, width: 32, height: 32 };
    mockRects.ring = { x: 30, y: 130, width: 88, height: 88 };
    const timing = jest.spyOn(Animated, 'timing');
    let r;
    act(() => { r = TestRenderer.create(<CreditFlight theme={theme} targets={() => ({ ring: 'ring' })} />); });
    act(() => { bus.emitBeat(item('creditDeparts', { creditFrom: 'h1' })); bus.emitBeat(item('resolution')); });
    await flush();
    // Only the (no-op) fade-out of a hidden dot; no flight.
    expect(timing.mock.calls.filter(([, cfg]) => cfg.toValue === 1)).toHaveLength(0);
    act(() => r.unmount());
  });
  it('does not fly without a ring to fly to', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    let r;
    act(() => { r = TestRenderer.create(<CreditFlight theme={theme} targets={() => ({ ring: 'ring' })} />); });
    act(() => { bus.emitBeat(item('creditDeparts', { creditFrom: 'h1' })); });
    await flush();
    expect(timing).not.toHaveBeenCalled();
    act(() => r.unmount());
  });
});

describe('pre-warm', () => {
  it('connects the native graph once the app is idle (a no-op run)', () => {
    let task;
    InteractionManager.runAfterInteractions.mockImplementation((fn) => { task = fn; return { cancel() {} }; });
    const timing = jest.spyOn(Animated, 'timing');
    let r;
    act(() => { r = TestRenderer.create(<RingBurst theme={theme} targets={() => ({ ring: 'ring' })} />); });
    expect(timing).not.toHaveBeenCalled();
    act(() => task());
    expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 0, useNativeDriver: true }));
    act(() => r.unmount());
  });
});

describe('RingBurst', () => {
  it('24 particles, all starting outside the ring stroke', () => {
    const ps = burstParticles();
    expect(ps).toHaveLength(amount.burstParticles);
    expect(amount.burstParticles).toBe(24);
    ps.forEach((p) => { expect(p.from).toBeGreaterThan(1.1); expect(p.to).toBeGreaterThan(p.from); });
    expect(burstParticles()).toEqual(ps); // deterministic
  });
  it('bursts on the resolution beat until the end of the moment (+1500)', async () => {
    mockRects.ring = { x: 30, y: 130, width: 88, height: 88 };
    const timing = jest.spyOn(Animated, 'timing');
    let r;
    act(() => { r = TestRenderer.create(<RingBurst theme={theme} targets={() => ({ ring: 'ring' })} />); });
    const res = item('resolution', { tapAt: Date.now() - 750 });
    act(() => { bus.emitBeat(res); });
    await flush();
    expect(timing).toHaveBeenCalledTimes(1);
    const cfg = timing.mock.calls[0][1];
    expect(cfg.useNativeDriver).toBe(true);
    expect(cfg.duration).toBeGreaterThan(MOMENT_MS - 750 - 50);
    expect(cfg.duration).toBeLessThanOrEqual(MOMENT_MS - 750);
    act(() => r.unmount());
  });
  it('reduced motion: no particles (§4.3)', async () => {
    mockReduced = true;
    mockRects.ring = { x: 30, y: 130, width: 88, height: 88 };
    const timing = jest.spyOn(Animated, 'timing');
    let r;
    act(() => { r = TestRenderer.create(<RingBurst theme={theme} targets={() => ({ ring: 'ring' })} />); });
    act(() => { bus.emitBeat(item('resolution')); });
    await flush();
    expect(timing).not.toHaveBeenCalled();
    act(() => r.unmount());
  });
});

describe('TabScope (m4: hidden tabs skip a check-off render)', () => {
  const { createTabScope } = require('../../utils/tabScope');
  const Ctx = React.createContext(null);
  const TabScope = createTabScope(Ctx);
  let renders = 0;
  const Probe = React.memo(() => { const v = React.useContext(Ctx); renders += 1; return React.createElement('Probe', { n: v.n }); });
  const tree = (value, active) => (
    <Ctx.Provider value={value}><TabScope active={active} Screen={Probe} /></Ctx.Provider>
  );
  beforeEach(() => { jest.useFakeTimers(); renders = 0; });
  afterEach(() => jest.useRealTimers());

  it('an inactive tab keeps its value until MOMENT_MS after the change, then catches up', () => {
    let r;
    act(() => { r = TestRenderer.create(tree({ n: 1, themeName: 'light' }, false)); });
    expect(renders).toBe(1);
    act(() => { r.update(tree({ n: 2, themeName: 'light' }, false)); });
    expect(renders).toBe(1);
    expect(r.root.findByType('Probe').props.n).toBe(1);
    act(() => { jest.advanceTimersByTime(MOMENT_MS); });
    expect(renders).toBe(2);
    expect(r.root.findByType('Probe').props.n).toBe(2);
    act(() => r.unmount());
  });
  it('the active tab and a theme change get the live value at once', () => {
    let r;
    act(() => { r = TestRenderer.create(tree({ n: 1, themeName: 'light' }, true)); });
    act(() => { r.update(tree({ n: 2, themeName: 'light' }, true)); });
    expect(r.root.findByType('Probe').props.n).toBe(2);
    act(() => { r.update(tree({ n: 3, themeName: 'light' }, false)); });
    expect(r.root.findByType('Probe').props.n).toBe(2);
    act(() => { r.update(tree({ n: 4, themeName: 'dark' }, false)); });
    expect(r.root.findByType('Probe').props.n).toBe(4);
    act(() => { r.update(tree({ n: 4, themeName: 'dark' }, true)); });
    expect(r.root.findByType('Probe').props.n).toBe(4);
    act(() => r.unmount());
  });
});
