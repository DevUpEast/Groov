// The shared Sheet (F-09a): drag targets (pure), the Modal wiring, every dismissal path, the
// dirty guard, the drag region, plus source checks for its two adopters.
const fs = require('fs');
const path = require('path');
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const { Modal, ScrollView, Text, Animated } = require('react-native');

jest.mock('../../../context/AppContext', () => {
  const { themes } = jest.requireActual('../../../theme/colors');
  return { useApp: () => ({ theme: themes.light }) };
});
let mockReduced = false;
jest.mock('../../../utils/a11y', () => ({
  ...jest.requireActual('../../../utils/a11y'),
  isReducedMotion: () => mockReduced,
  useReducedMotion: () => mockReduced,
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: (props) => require('react').createElement('Ionicons', props) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../services/feedback', () => ({
  __esModule: true, default: { play: jest.fn() }, EVENTS: { destructiveConfirm: 'destructiveConfirm', refused: 'refused' },
}));

const SheetModule = require('../Sheet');
const Sheet = SheetModule.default;
const { sheetDragTarget, mediumOffsetFor, DISMISS_DISTANCE, SheetFrame } = SheetModule;
const Dialog = require('../Dialog').default;

global.IS_REACT_ACT_ENVIRONMENT = true;
const ROOT = path.resolve(__dirname, '../../../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function render(props) {
  let renderer;
  act(() => { renderer = TestRenderer.create(React.createElement(Sheet, props, React.createElement(Text, null, 'Body'))); });
  return renderer;
}
const sheetModal = (r) => r.root.findAll(n => n.type === Modal)[0];
const dialogOf = (r) => r.root.findAllByType(Dialog)[0];
const byTestID = (r, id) => r.root.findAll(n => n.props.testID === id && typeof n.type !== 'string')[0];

describe('sheetDragTarget', () => {
  const med = 300;
  it('closes a one-detent sheet past the 80 dp threshold, settles it before', () => {
    expect(sheetDragTarget({ dy: DISMISS_DISTANCE + 1 })).toBe('close');
    expect(sheetDragTarget({ dy: DISMISS_DISTANCE - 1 })).toBe('large');
    expect(sheetDragTarget({ dy: -40 })).toBe('large');
  });
  it('closes on a fast downward flick from the lowest rest', () => {
    expect(sheetDragTarget({ dy: 20, vy: 2 })).toBe('close');
    expect(sheetDragTarget({ dy: -20, vy: 2 })).toBe('large');
  });
  it('moves between detents, and closes only from below medium', () => {
    const base = { detents: ['medium', 'large'], mediumOffset: med };
    expect(sheetDragTarget({ ...base, detent: 'medium', dy: -200 })).toBe('large');
    expect(sheetDragTarget({ ...base, detent: 'medium', dy: -60 })).toBe('medium');
    expect(sheetDragTarget({ ...base, detent: 'large', dy: 220 })).toBe('medium');
    expect(sheetDragTarget({ ...base, detent: 'large', dy: med + DISMISS_DISTANCE + 1 })).toBe('close');
    expect(sheetDragTarget({ ...base, detent: 'medium', dy: DISMISS_DISTANCE + 1 })).toBe('close');
    // A fast flick from large lands on medium, not closed.
    expect(sheetDragTarget({ ...base, detent: 'large', dy: 30, vy: 1.5 })).toBe('medium');
  });
  it('places medium at 55 % of the window inside the 92 % sheet', () => {
    expect(mediumOffsetFor(1000)).toBe(370);
  });
});

describe('Sheet', () => {
  it('is a transparent Modal over the status and navigation bars, with Android back wired', () => {
    const onClose = jest.fn();
    const r = render({ visible: true, onClose, title: 'Details' });
    const m = sheetModal(r);
    expect(m.props.visible).toBe(true);
    expect(m.props.transparent).toBe(true);
    expect(m.props.statusBarTranslucent).toBe(true);
    expect(m.props.navigationBarTranslucent).toBe(true);
    act(() => m.props.onRequestClose());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a scrim tap, the close button and the accessibility escape', () => {
    const onClose = jest.fn();
    const r = render({ visible: true, onClose, title: 'Details' });
    act(() => byTestID(r, 'sheet-scrim').props.onPress());
    const close = r.root.findAll(n => n.props.accessibilityLabel === 'Close' && typeof n.props.onPress === 'function')[0];
    act(() => close.props.onPress());
    const modalView = r.root.findAll(n => n.props.accessibilityViewIsModal === true)[0];
    act(() => modalView.props.onAccessibilityEscape());
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(modalView.props.accessibilityLabel).toBe('Details');
  });

  it('drags from the header region only, never from the scroll body', () => {
    const r = render({ visible: true, onClose: jest.fn(), title: 'Details' });
    const zone = byTestID(r, 'sheet-drag-zone');
    expect(typeof zone.props.onResponderMove).toBe('function');
    expect(zone.findAllByType(ScrollView)).toHaveLength(0);
    const scroll = r.root.findAllByType(ScrollView)[0];
    expect(scroll.props.onResponderMove).toBeUndefined();
    expect(zone.findAll(n => n.props.accessibilityRole === 'header').length).toBeGreaterThan(0);
  });

  it('asks before discarding a dirty sheet, then closes once the dialog has gone', () => {
    const onClose = jest.fn();
    const r = render({ visible: true, onClose, title: 'Edit', dirty: true });
    act(() => sheetModal(r).props.onRequestClose());
    expect(onClose).not.toHaveBeenCalled();
    let dialog = dialogOf(r);
    expect(dialog.props.visible).toBe(true);
    expect(dialog.props.title).toBe('Discard changes?');
    // Keep editing: stays open, no close.
    act(() => dialog.props.actions[0].onPress());
    expect(dialogOf(r).props.visible).toBe(false);
    act(() => dialogOf(r).props.onDismiss());
    expect(onClose).not.toHaveBeenCalled();
    // Discard: closes after the dialog's dismissal.
    act(() => byTestID(r, 'sheet-scrim').props.onPress());
    dialog = dialogOf(r);
    act(() => dialog.props.actions[1].onPress());
    expect(dialog.props.actions[1].variant).toBe('destructive');
    act(() => dialogOf(r).props.onDismiss());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('plays its exit, unmounts the Modal and then calls onDismiss', () => {
    jest.useFakeTimers();
    const onDismiss = jest.fn();
    const r = render({ visible: true, onClose: jest.fn(), onDismiss, title: 'Details' });
    act(() => r.update(React.createElement(Sheet, { visible: false, onClose: jest.fn(), onDismiss, title: 'Details' })));
    expect(sheetModal(r).props.visible).toBe(true); // still animating out
    act(() => { jest.advanceTimersByTime(1000); });
    expect(sheetModal(r).props.visible).toBe(false);
    act(() => { jest.runOnlyPendingTimers(); });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});

describe('adopters', () => {
  it('HabitDetailSheet uses Sheet, the Today done green and no emoji tiles or legacy heat colours', () => {
    const src = read('src/components/HabitDetailSheet.js');
    expect(src).toMatch(/from '\.\/ui\/Sheet'/);
    expect(src).not.toMatch(/PanResponder|BottomSheet|SheetDragHandle/);
    expect(src).not.toMatch(/heatPartial|heatFrozen|heatMissed|theme\.meter/);
    expect(src).not.toMatch(/🔥|🏅|✅|📈|✕/);
    expect(src).toMatch(/theme\.success/);
    expect(src).not.toMatch(/'habitDetail\.hint'/);
  });
  it('BottomSheet is a wrapper over the Sheet frame', () => {
    const src = read('src/components/BottomSheet.js');
    expect(src).toMatch(/SheetFrame/);
    expect(src).not.toMatch(/<Modal|OverlayModal/);
  });
});

// Lifecycle edges (F-09a review B1, M1, m4, m5). Animated runs on jest's fake timers.
describe('Sheet lifecycle', () => {
  // A minimal PanResponder touch history: one touch at (0, y) at time t.
  const history = (y, t, active = true) => ({
    numberActiveTouches: active ? 1 : 0,
    indexOfSingleActiveTouch: 0,
    mostRecentTimeStamp: t,
    touchBank: [{
      touchActive: active, startPageX: 0, startPageY: 0, startTimeStamp: 1,
      currentPageX: 0, currentPageY: y, currentTimeStamp: t, previousPageX: 0, previousPageY: 0, previousTimeStamp: 1,
    }],
  });
  const ev = (y, t, active) => ({ touchHistory: history(y, t, active), nativeEvent: { touches: [], changedTouches: [] } });
  const zoneOf = (r) => byTestID(r, 'sheet-drag-zone');
  // Native-driven animations do not move the JS value under jest, so read the animation calls.
  const lastTo = (spy) => spy.mock.calls.at(-1)?.[1]?.toValue;
  const drag = (r, dy) => {
    const z = zoneOf(r);
    act(() => {
      z.props.onResponderGrant(ev(0, 1));
      z.props.onResponderMove(ev(dy, 1001)); // a slow drag (dy over a second), not a flick
      z.props.onResponderRelease(ev(dy, 1002, false));
    });
  };
  const tapHeader = (r) => {
    const z = zoneOf(r);
    act(() => {
      z.props.onResponderGrant(ev(0, 1));
      z.props.onResponderRelease(ev(0, 2, false));
    });
  };
  const advance = (ms) => act(() => { jest.advanceTimersByTime(ms); });
  const el = (props) => React.createElement(Sheet, { title: 'Details', ...props }, React.createElement(Text, null, 'Body'));
  function mount(props) {
    let r;
    act(() => { r = TestRenderer.create(el({ visible: false, ...props })); });
    return r;
  }
  const show = (r, props, { onShow = true } = {}) => {
    act(() => r.update(el({ ...props, visible: true })));
    if (onShow) act(() => sheetModal(r).props.onShow());
    advance(1000);
  };
  const hide = (r, props) => act(() => r.update(el({ ...props, visible: false })));

  beforeEach(() => { jest.useFakeTimers(); mockReduced = false; });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  it('B1: a header touch during the exit cannot stop it; the Modal unmounts and onDismiss fires', () => {
    const p = { onClose: jest.fn(), onDismiss: jest.fn() };
    const r = mount(p);
    show(r, p);
    hide(r, p); // the exit is running (jest's native driver ends it on the next timer tick)
    expect(zoneOf(r).props.onStartShouldSetResponder(ev(0, 1))).toBe(false);
    expect(zoneOf(r).props.onMoveShouldSetResponderCapture(ev(40, 2))).toBe(false);
    tapHeader(r); // even if a grant slipped through, the exit keeps running
    drag(r, -200);
    advance(3000);
    expect(sheetModal(r).props.visible).toBe(false);
    act(() => { jest.runOnlyPendingTimers(); });
    expect(p.onDismiss).toHaveBeenCalledTimes(1);
    // A back press after that does not reach the host again.
    expect(p.onClose).not.toHaveBeenCalled();
  });

  it('a close request while the host has already closed re-runs the exit instead of calling onClose', () => {
    const p = { onClose: jest.fn(), onDismiss: jest.fn() };
    const r = mount(p);
    show(r, p);
    hide(r, p);
    act(() => sheetModal(r).props.onRequestClose()); // back
    act(() => byTestID(r, 'sheet-scrim').props.onPress()); // scrim: a double close
    advance(3000);
    act(() => { jest.runOnlyPendingTimers(); });
    expect(p.onClose).not.toHaveBeenCalled();
    expect(sheetModal(r).props.visible).toBe(false);
    expect(p.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('closes cleanly before onShow, and the enter fallback never re-opens it', () => {
    const p = { onClose: jest.fn(), onDismiss: jest.fn() };
    const r = mount(p);
    act(() => r.update(el({ ...p, visible: true })));
    hide(r, p); // closed before the window showed
    advance(3000);
    act(() => { jest.runOnlyPendingTimers(); });
    expect(sheetModal(r).props.visible).toBe(false);
    expect(p.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('closes cleanly during the enter spring', () => {
    const p = { onClose: jest.fn(), onDismiss: jest.fn() };
    const r = mount(p);
    act(() => r.update(el({ ...p, visible: true })));
    act(() => sheetModal(r).props.onShow());
    advance(50);
    hide(r, p);
    advance(3000);
    act(() => { jest.runOnlyPendingTimers(); });
    expect(sheetModal(r).props.visible).toBe(false);
    expect(p.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('enters after the 400 ms fallback when onShow never comes, and a late onShow does not spring again', () => {
    const springs = jest.spyOn(Animated, 'spring');
    const p = { onClose: jest.fn() };
    const r = mount(p);
    act(() => r.update(el({ ...p, visible: true })));
    advance(300);
    expect(springs).not.toHaveBeenCalled();
    advance(2000);
    expect(springs).toHaveBeenCalledTimes(1);
    expect(lastTo(springs)).toBe(0);
    act(() => sheetModal(r).props.onShow());
    advance(1000);
    expect(springs).toHaveBeenCalledTimes(1);
  });

  it('re-opens mid-exit: springs back open, stays mounted, no onDismiss', () => {
    const p = { onClose: jest.fn(), onDismiss: jest.fn() };
    const r = mount(p);
    show(r, p);
    hide(r, p);
    const springs = jest.spyOn(Animated, 'spring');
    act(() => r.update(el({ ...p, visible: true })));
    expect(springs).toHaveBeenCalledTimes(1); // at once: the window is still up
    expect(lastTo(springs)).toBe(0);
    advance(2000);
    act(() => { jest.runOnlyPendingTimers(); });
    expect(sheetModal(r).props.visible).toBe(true);
    expect(p.onDismiss).not.toHaveBeenCalled();
    // And it can still be closed afterwards.
    expect(zoneOf(r).props.onStartShouldSetResponder(ev(0, 1))).toBe(true);
  });

  it('m4: a drag-close the host refuses settles the sheet back to its detent', () => {
    const p = { onClose: jest.fn() };
    const r = mount(p);
    show(r, p);
    const springs = jest.spyOn(Animated, 'spring');
    drag(r, 200);
    expect(p.onClose).toHaveBeenCalledTimes(1);
    expect(springs).toHaveBeenCalledTimes(1);
    expect(lastTo(springs)).toBe(0);
    advance(2000);
    expect(sheetModal(r).props.visible).toBe(true);
  });

  it('a short drag settles back without closing; a plain header tap does nothing', () => {
    const p = { onClose: jest.fn() };
    const r = mount(p);
    show(r, p);
    const springs = jest.spyOn(Animated, 'spring');
    drag(r, 40);
    expect(lastTo(springs)).toBe(0);
    advance(2000);
    springs.mockClear();
    tapHeader(r);
    expect(springs).not.toHaveBeenCalled(); // n3: no spring restarted by a tap
    expect(p.onClose).not.toHaveBeenCalled();
  });

  it('m5: under reduced motion a medium sheet still rests at the medium height', () => {
    mockReduced = true;
    const p = { onClose: jest.fn(), detents: ['medium', 'large'], initialDetent: 'medium' };
    const timings = jest.spyOn(Animated, 'timing');
    const r = mount(p);
    show(r, p);
    const frame = r.root.findByType(SheetFrame);
    expect(frame.props.rest).toBeGreaterThan(0); // the medium offset
    expect(lastTo(timings)).toBe(0); // the 150 ms fade in, to fully opaque
  });
});
