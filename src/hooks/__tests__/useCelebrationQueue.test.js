// C-07 review: the trophy / milestone order (M1, m2), TabScope's flushes (m1, m5) and shared
// anchor keys (m3).
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const { AppState } = require('react-native');

global.IS_REACT_ACT_ENVIRONMENT = true;

const bus = require('../../utils/beatBus');
const useCelebrationQueue = require('../useCelebrationQueue').default;
const { MOMENT_MS } = require('../../utils/beats');
const { beat } = require('../../theme/motion');

beforeEach(() => { jest.useFakeTimers(); bus.__resetBeatBusForTests(); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

function mountQueue(initial) {
  const out = {};
  const shown = [];
  const cleared = jest.fn();
  function Probe(props) {
    out.q = useCelebrationQueue({ ...props, clearPendingMilestone: cleared, onMilestone: (m) => shown.push(m) });
    return null;
  }
  let r;
  act(() => { r = TestRenderer.create(<Probe {...initial} />); });
  return { out, shown, cleared, update: (p) => act(() => { r.update(<Probe {...p} />); }), unmount: () => act(() => r.unmount()) };
}

describe('useCelebrationQueue (M1)', () => {
  it('one check that completes a challenge, the day and a streak milestone: the trophy first, the milestone after it closes', () => {
    const tapAt = Date.now();
    // The resolution beat of the moment is pending (the milestone would aim for tapAt + 1500).
    bus.expectBeat({ beat: 'resolution', key: 'visual:resolution', at: 750, duration: 200, tapAt });
    const s = mountQueue({ pendingMilestone: null, active: true });
    act(() => { s.out.q.openTrophyAt(tapAt, MOMENT_MS); });
    // AppContext sets the milestone right after the tap's commit, with the trophy still armed.
    s.update({ pendingMilestone: { days: 7 }, active: true });
    act(() => { jest.advanceTimersByTime(MOMENT_MS); });
    expect(s.out.q.trophyCelebrating).toBe(true);
    expect(s.shown).toEqual([]); // never both at +1500
    act(() => { jest.advanceTimersByTime(5000); });
    expect(s.shown).toEqual([]);
    act(() => { s.out.q.trophyDone(); });
    act(() => { jest.advanceTimersByTime(0); });
    expect(s.shown).toEqual([{ days: 7 }]);
    expect(s.cleared).toHaveBeenCalledTimes(1);
    s.unmount();
  });

  it('a milestone timer already set when the trophy is armed is taken back by the trophy', () => {
    const tapAt = Date.now();
    bus.expectBeat({ beat: 'resolution', key: 'visual:resolution', at: 750, duration: 200, tapAt });
    const s = mountQueue({ pendingMilestone: { days: 30 }, active: true });
    act(() => { s.out.q.openTrophyAt(tapAt, MOMENT_MS); });
    act(() => { jest.advanceTimersByTime(MOMENT_MS); });
    expect(s.out.q.trophyCelebrating).toBe(true);
    expect(s.shown).toEqual([]);
    act(() => { s.out.q.trophyDone(); });
    act(() => { jest.advanceTimersByTime(0); });
    expect(s.shown).toEqual([{ days: 30 }]);
    s.unmount();
  });

  it('outside a moment the milestone waits a beat after the credit would have landed (+875)', () => {
    const s = mountQueue({ pendingMilestone: { days: 7 }, active: true });
    act(() => { jest.advanceTimersByTime(beat.b4b8b16 - 1); });
    expect(s.shown).toEqual([]);
    act(() => { jest.advanceTimersByTime(1); });
    expect(s.shown).toEqual([{ days: 7 }]);
    s.unmount();
  });

  it('m2: never while Today is hidden; it plays once Today is shown again', () => {
    const s = mountQueue({ pendingMilestone: { days: 7 }, active: false });
    act(() => { jest.advanceTimersByTime(10000); });
    expect(s.shown).toEqual([]);
    s.update({ pendingMilestone: { days: 7 }, active: true });
    act(() => { jest.advanceTimersByTime(beat.b4b8b16); });
    expect(s.shown).toEqual([{ days: 7 }]);
    s.unmount();
  });
});

describe('TabScope flushes (m1, m5)', () => {
  const { createTabScope, useTabActive } = require('../../utils/tabScope');
  const Ctx = React.createContext(null);
  const TabScope = createTabScope(Ctx);
  const Probe = React.memo(() => {
    const v = React.useContext(Ctx);
    const active = useTabActive();
    return React.createElement('Probe', { n: v.n, active });
  });
  const tree = (value, props) => <Ctx.Provider value={value}><TabScope Screen={Probe} {...props} /></Ctx.Provider>;
  const n = (r) => r.root.findByType('Probe').props.n;

  it('becoming active hands over the live value at once', () => {
    let r;
    act(() => { r = TestRenderer.create(tree({ n: 1 }, { active: false })); });
    act(() => { r.update(tree({ n: 2 }, { active: false })); });
    expect(n(r)).toBe(1);
    act(() => { r.update(tree({ n: 2 }, { active: true })); });
    expect(n(r)).toBe(2);
    expect(r.root.findByType('Probe').props.active).toBe(true);
    act(() => r.unmount());
  });

  it('a pager drag peeks: the neighbour shows the live value while it is still inactive', () => {
    let r;
    act(() => { r = TestRenderer.create(tree({ n: 1 }, { active: false })); });
    act(() => { r.update(tree({ n: 2 }, { active: false })); });
    act(() => { r.update(tree({ n: 2 }, { active: false, peek: true })); });
    expect(n(r)).toBe(2);
    expect(r.root.findByType('Probe').props.active).toBe(false);
    act(() => r.unmount());
  });

  it('leaving the foreground catches a hidden tab up', () => {
    const listeners = [];
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => { listeners.push(fn); return { remove() {} }; });
    let r;
    act(() => { r = TestRenderer.create(tree({ n: 1 }, { active: false })); });
    act(() => { r.update(tree({ n: 2 }, { active: false })); });
    expect(n(r)).toBe(1);
    act(() => { listeners.forEach((fn) => fn('background')); });
    expect(n(r)).toBe(2);
    act(() => r.unmount());
    spy.mockRestore();
  });
});

describe('creditAnchors: a shared key (m3)', () => {
  const anchors = require('../../utils/creditAnchors');
  it('a detaching node only drops the key while it is still the registered one', async () => {
    anchors.__resetAnchorsForTests();
    const a = { measureInWindow: (cb) => cb(1, 2, 3, 4) };
    const b = { measureInWindow: (cb) => cb(5, 6, 7, 8) };
    anchors.setAnchor('ring', a);
    anchors.setAnchor('ring', b); // a second header (the token preview) registers later
    anchors.setAnchor('ring', null, a); // the first one unmounts
    await expect(anchors.measureAnchor('ring')).resolves.toEqual({ x: 5, y: 6, width: 7, height: 8 });
    anchors.setAnchor('ring', null, b);
    await expect(anchors.measureAnchor('ring')).resolves.toBeNull();
  });
});
