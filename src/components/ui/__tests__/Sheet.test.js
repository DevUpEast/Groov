// The shared Sheet (F-09a): drag targets (pure), the Modal wiring, every dismissal path, the
// dirty guard, the drag region, plus source checks for its two adopters.
const fs = require('fs');
const path = require('path');
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
// Every renderer is unmounted after its test: a Sheet left mounted keeps its 400 ms enter
// fallback (and settle) timers, which fire after this file's environment is torn down and
// crash the worker, failing whichever file it runs next (C-08 review, the creditFlight flake).
const mountedRenderers = [];
const createRenderer = TestRenderer.create;
TestRenderer.create = (...args) => { const r = createRenderer(...args); mountedRenderers.push(r); return r; };
afterEach(() => {
  while (mountedRenderers.length) {
    const r = mountedRenderers.pop();
    try { act(() => { r.unmount(); }); } catch (_) { /* already unmounted */ }
  }
});
afterAll(() => { TestRenderer.create = createRenderer; });
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
  it('the habit and challenge forms use Sheet with the dirty guard and a pinned Save (F-09b)', () => {
    expect(fs.existsSync(path.join(ROOT, 'src/components/BottomSheet.js'))).toBe(false);
    const habits = read('src/screens/HabitsScreen.js');
    const form = habits.slice(habits.indexOf('function HabitModal('), habits.indexOf('function HabitRow('));
    expect(form).toMatch(/<Sheet\s[\s\S]*dirty=\{dirty\}[\s\S]*footer=\{\([\s\S]*testID="habit-form-save"[\s\S]*\)\}\s*>/);
    expect(form).not.toMatch(/PanResponder|BottomSheet|SheetDragHandle|sheetIn|sheetOut/);
    const challenges = read('src/screens/ChallengeScreen.js');
    const cform = challenges.slice(challenges.indexOf('function ChallengeFormModal('), challenges.indexOf('function PastChallengeDetailModal('));
    expect(cform).toMatch(/<Sheet\s[\s\S]*dirty=\{dirty\}[\s\S]*footer=\{\([\s\S]*testID="challenge-form-save"[\s\S]*\)\}\s*>/);
    expect(cform).not.toMatch(/PanResponder|BottomSheet|SheetHeader|sheet\.close|useSheetAnim/);
    // "Add a new habit" goes through the guarded close; the tab change runs after the sheet has gone.
    expect(cform).toMatch(/sheetRef\.current\?\.requestClose\(\(\) => onAddHabit/);
    expect(cform).not.toMatch(/setTimeout/);
    // No JSX-prop spacing literal survives in the frame (the old wrapper's 40 on iOS).
    expect(read('src/components/ui/Sheet.js')).not.toMatch(/paddingBottom=\{/);
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

  it('M2 (F-10): a first mount already visible waits for onShow before the enter spring', () => {
    const springs = jest.spyOn(Animated, 'spring');
    let r;
    act(() => { r = TestRenderer.create(el({ visible: true, onClose: jest.fn() })); });
    expect(sheetModal(r).props.visible).toBe(true); // the window is requested at once
    expect(springs).not.toHaveBeenCalled(); // ...but nothing moves before it exists
    act(() => sheetModal(r).props.onShow());
    expect(springs).toHaveBeenCalledTimes(1);
    expect(lastTo(springs)).toBe(0);
  });

  it('M2 (F-10): without onShow the first-mount enter still runs after the fallback', () => {
    const springs = jest.spyOn(Animated, 'spring');
    act(() => { TestRenderer.create(el({ visible: true, onClose: jest.fn() })); });
    expect(springs).not.toHaveBeenCalled();
    advance(400);
    expect(springs).toHaveBeenCalledTimes(1);
  });

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

describe('keyboard (F-09b review m2, m3, m6)', () => {
  const { keyboardLiftFor, revealOverflow, REVEAL_MARGIN } = SheetModule;
  it('adds the bottom inset back only where Android subtracts it (API 30+)', () => {
    expect(keyboardLiftFor(0, 24, 'android', 36)).toBe(0);
    expect(keyboardLiftFor(300, 24, 'android', 36)).toBe(324);
    expect(keyboardLiftFor(300, 24, 'android', 30)).toBe(324);
    expect(keyboardLiftFor(300, 24, 'android', 29)).toBe(300);
    expect(keyboardLiftFor(300, 24, 'web', 0)).toBe(300);
  });
  it('scrolls a focused input that ends at the body edge in by its border and some air', () => {
    expect(revealOverflow({ bodyY: 100, bodyHeight: 500, inputY: 552, inputHeight: 48 })).toBe(REVEAL_MARGIN);
    expect(revealOverflow({ bodyY: 100, bodyHeight: 500, inputY: 300, inputHeight: 48 })).toBe(0);
  });
});

// F-10: the medium detent keeps a pinned footer on screen and the whole body reachable.
describe('medium detent (F-10)', () => {
  const { Dimensions, View, StyleSheet } = require('react-native');
  afterEach(() => { mockReduced = false; });
  const renderMedium = (extra = {}) => {
    let r;
    act(() => {
      r = TestRenderer.create(React.createElement(Sheet, {
        visible: true, onClose: jest.fn(), title: 'Share', detents: ['medium', 'large'],
        footer: React.createElement(Text, null, 'Share image'), contentContainerStyle: { paddingBottom: 8 }, ...extra,
      }, React.createElement(Text, null, 'Body')));
    });
    return r;
  };
  const footerOf = (r) => r.root.findAll(n => n.type === Animated.View
    && n.findAll(c => c.type === Text && c.props.children === 'Share image').length > 0
    && !n.props.accessibilityViewIsModal)[0];

  it('pads the body by the hidden height at medium, and lifts the footer with the visible edge', () => {
    const offset = mediumOffsetFor(Dimensions.get('window').height);
    const r = renderMedium({ initialDetent: 'medium' });
    const scroll = r.root.findAllByType(ScrollView)[0];
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingBottom).toBe(8 + offset);
    const lift = StyleSheet.flatten(footerOf(r).props.style).transform[0].translateY;
    // Follows the sheet value, clamped to the medium offset.
    // The rendered host style carries the resolved value.
    const v = typeof lift === 'number' ? lift : lift.__getValue();
    expect(v).toBe(-offset); // the value starts off screen: clamped
  });

  it('M1: the lifted footer is backed down to the window edge, with a hairline on top', () => {
    const r = renderMedium({ initialDetent: 'medium' });
    const footer = StyleSheet.flatten(r.root.findAll(n => n.props.testID === 'sheet-footer' && typeof n.type !== 'string')[0].props.style);
    const { themes } = jest.requireActual('../../../theme/colors');
    expect(footer.backgroundColor).toBe(themes.light.raised);
    // The surface's bottom pad (no inset in this test) is covered by the footer.
    expect(footer.paddingBottom).toBe(SheetModule.surfaceBottomPad(0, 0));
    expect(footer.marginBottom).toBe(-SheetModule.surfaceBottomPad(0, 0));
    expect(footer.borderTopWidth).toBeGreaterThan(0);
  });

  it('a large-first sheet has no extra body padding', () => {
    const r = renderMedium({ initialDetent: 'large' });
    const scroll = r.root.findAllByType(ScrollView)[0];
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingBottom).toBe(8);
  });

  it('under reduced motion the footer sits at the fixed medium rest', () => {
    mockReduced = true;
    const offset = mediumOffsetFor(Dimensions.get('window').height);
    const r = renderMedium({ initialDetent: 'medium' });
    expect(StyleSheet.flatten(footerOf(r).props.style).transform[0].translateY).toBe(-offset);
  });

  it('takes a tinted surface and grabber', () => {
    const r = renderMedium({ backgroundColor: '#FEF3C7', grabberColor: '#F59E0B' });
    const frame = r.root.findByType(SheetFrame);
    expect(frame.props.backgroundColor).toBe('#FEF3C7');
    const grabber = r.root.findAll(n => n.type === View && StyleSheet.flatten(n.props.style)?.backgroundColor === '#F59E0B');
    expect(grabber.length).toBeGreaterThan(0);
  });
});

// The opening tag of each <Modal / <OverlayModal: up to the first '>' outside braces and strings,
// so a prop such as onRequestClose={() => close()} cannot end it early (review n1).
function modalTags(src) {
  const tags = [];
  const re = /<(?:Overlay)?Modal\b/g;
  let m;
  while ((m = re.exec(src))) {
    let depth = 0;
    let quote = null;
    let i = m.index + 1;
    for (; i < src.length; i += 1) {
      const c = src[i];
      if (quote) { if (c === quote && src[i - 1] !== '\\') quote = null; continue; }
      if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      else if (c === '>' && depth === 0) break;
    }
    tags.push(src.slice(m.index, i + 1));
  }
  return tags;
}

describe('modalTags', () => {
  it('reads past an arrow function in a prop', () => {
    const [tag] = modalTags('<OverlayModal visible onRequestClose={() =>\n  close()} statusBarTranslucent navigationBarTranslucent>\n</OverlayModal>');
    expect(tag).toMatch(/navigationBarTranslucent>$/);
  });
});

// F-10: every remaining sheet is a ui/Sheet; every Modal is translucent; the old helpers are gone.
describe('F-10 migration (source checks)', () => {
  const walk = (dir, out = []) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== '__tests__') walk(p, out); } else if (p.endsWith('.js')) out.push(p);
    });
    return out;
  };
  const files = [...walk(path.join(ROOT, 'src')), path.join(ROOT, 'App.js')];

  it('no slide Modal remains (a), and every Modal is translucent under both system bars (c)', () => {
    const slides = [];
    const opaque = [];
    let tags = 0;
    files.forEach((f) => {
      const src = fs.readFileSync(f, 'utf8');
      if (/animationType="slide"/.test(src)) slides.push(path.relative(ROOT, f));
      if (f.endsWith('OverlayModal.js')) return; // forwards its props to Modal
      modalTags(src).forEach((tag) => {
        tags += 1;
        if (!/statusBarTranslucent(?!=\{false\})/.test(tag) || !/navigationBarTranslucent(?!=\{false\})/.test(tag)) opaque.push(path.relative(ROOT, f));
      });
    });
    expect(tags).toBeGreaterThanOrEqual(8);
    expect(slides).toEqual([]);
    expect(opaque).toEqual([]);
  });

  it('the 7 remaining sheets render the shared Sheet (b)', () => {
    [
      'src/components/LinkAccountSheet.js', 'src/components/PaywallSheet.js', 'src/components/ShareCards.js',
      'src/components/WhatsNewSheet.js', 'src/components/ui/ActionSheet.js',
    ].forEach((f) => {
      const src = read(f);
      expect(src).toMatch(/<Sheet\b/);
      expect(src).not.toMatch(/OverlayModal|PanResponder/);
    });
    const progress = read('src/screens/ProgressScreen.js');
    const day = progress.slice(progress.indexOf('function DayDetailModal('), progress.indexOf('// ─── Bar tooltip'));
    expect(day).toMatch(/<Sheet\b[\s\S]*detents=\{\['medium', 'large'\]\}/);
    expect(progress).not.toMatch(/OverlayModal|PanResponder|sheetIn|sheetSettle/);
    const challenges = read('src/screens/ChallengeScreen.js');
    const past = challenges.slice(challenges.indexOf('function PastChallengeDetailModal('), challenges.indexOf('function ChallengeCard('));
    expect(past).toMatch(/<Sheet\b/);
    expect(challenges).not.toMatch(/OverlayModal|PanResponder|useSheetAnim|makeDragPanResponder|SheetHeader/);
    ['PaywallSheet', 'ShareCards'].forEach((f) => expect(read(`src/components/${f}.js`)).toMatch(/detents=\{\['medium', 'large'\]\}/));
    // NoteModal is a centred Dialog with the field focused through initialFocusRef.
    const note = read('src/components/NoteModal.js');
    expect(note).toMatch(/<Dialog\b[\s\S]*initialFocusRef=\{inputRef\}/);
    expect(note).not.toMatch(/<TextInput[^>]*autoFocus/);
  });

  it('the old sheet helpers are gone', () => {
    expect(fs.existsSync(path.join(ROOT, 'src/components/SheetHeader.js'))).toBe(false);
    const motion = read('src/theme/motion.js');
    expect(motion).not.toMatch(/export function (sheetIn|sheetSettle|sheetMotionStyle)\b/);
    expect(motion).not.toMatch(/sheetStyle:/);
  });
});
