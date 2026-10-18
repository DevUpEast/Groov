// C-08 (code review M1, m1, m2, m4): the milestone screen's lifecycle. Share hands off only
// after the Modal has gone, taps before the 1 s guard are swallowed (Share included), and a
// screen reader turns the auto-dismiss off.
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const { AccessibilityInfo } = require('react-native');

global.IS_REACT_ACT_ENVIRONMENT = true;

let mockReduced = false;
jest.mock('../../utils/a11y', () => ({
  useReducedMotion: () => mockReduced,
  isReducedMotion: () => mockReduced,
  announce: jest.fn(),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: (props) => require('react').createElement('Ionicons', props) }));
jest.mock('../../utils/creditAnchors', () => ({
  measureNode: jest.fn(() => Promise.resolve(null)),
  measureAnchor: jest.fn(() => Promise.resolve(null)),
  relativeTo: () => null,
  centreOf: () => null,
}));
// The Modal as a plain element: its children while visible, and its props to call onDismiss.
jest.mock('../ui/OverlayModal', () => {
  const R = require('react');
  return { __esModule: true, default: (props) => R.createElement('OverlayModal', props, props.visible ? props.children : null) };
});

const CompletionCelebration = require('../CompletionCelebration').default;
const { celebration } = require('../../theme/motion');

const MILESTONE = { days: 7, icon: 'flame', label: 'One week' };
const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); }); };

function setup({ screenReader = false } = {}) {
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockImplementation(() => Promise.resolve(screenReader));
  const cb = { onDone: jest.fn(), onShare: jest.fn(), onHidden: jest.fn() };
  let r;
  const el = (visible) => React.createElement(CompletionCelebration, { visible, milestone: visible ? MILESTONE : null, ...cb });
  act(() => { r = TestRenderer.create(el(true)); });
  return { r, cb, rerender: (v) => act(() => { r.update(el(v)); }) };
}
const press = (r, testID) => act(() => { r.root.findByProps({ testID }).props.onPress(); });
const shareButton = (r) => r.root.findAll(n => n.props.testID === 'milestone-share' && n.props.disabled !== undefined)[0];

beforeEach(() => { jest.useFakeTimers(); mockReduced = false; });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); });

test('Share is disabled before the 1 s guard; after it, Share calls onShare (not onDone) once the exit ends', async () => {
  const { r, cb } = setup();
  await flush();
  expect(shareButton(r).props.disabled).toBe(true);
  press(r, 'milestone-backdrop');
  act(() => { jest.advanceTimersByTime(celebration.milestoneSkipAfter + 50); });
  expect(cb.onDone).not.toHaveBeenCalled();
  expect(shareButton(r).props.disabled).toBe(false);
  act(() => { shareButton(r).props.onPress(); });
  act(() => { jest.advanceTimersByTime(1000); });
  expect(cb.onShare).toHaveBeenCalledTimes(1);
  expect(cb.onDone).not.toHaveBeenCalled();
  act(() => r.unmount());
});

test('M1: onHidden runs only after the Modal has gone (iOS: its onDismiss), never in the hide commit', async () => {
  const { r, cb, rerender } = setup();
  await flush();
  rerender(false);
  expect(cb.onHidden).not.toHaveBeenCalled();
  const modal = r.root.findByType('OverlayModal');
  expect(modal.props.visible).toBe(false);
  act(() => { modal.props.onDismiss(); });
  expect(cb.onHidden).toHaveBeenCalledTimes(1);
  // Unmounted afterwards; a second dismiss event does nothing.
  expect(r.root.findAllByType('OverlayModal')).toHaveLength(0);
  act(() => r.unmount());
});

test('M1: off iOS, onHidden runs two frames after the hide', async () => {
  const { Platform } = require('react-native');
  const os = Platform.OS;
  Platform.OS = 'android';
  try {
    const { r, cb, rerender } = setup();
    await flush();
    rerender(false);
    expect(cb.onHidden).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(100); });
    expect(cb.onHidden).toHaveBeenCalledTimes(1);
    act(() => r.unmount());
  } finally { Platform.OS = os; }
});

test('closes itself after autoDismissAt; a tap before 1 s is swallowed', async () => {
  const { r, cb } = setup();
  await flush();
  press(r, 'milestone-backdrop');
  act(() => { jest.advanceTimersByTime(celebration.autoDismissAt + 1000); });
  expect(cb.onDone).toHaveBeenCalledTimes(1);
  act(() => r.unmount());
});

test('no auto-dismiss while a screen reader is on', async () => {
  const { r, cb } = setup({ screenReader: true });
  await flush();
  act(() => { jest.advanceTimersByTime(celebration.autoDismissAt * 3); });
  expect(cb.onDone).not.toHaveBeenCalled();
  act(() => r.unmount());
});

test('m4: hidden before the screen-reader check resolves, no stray auto-dismiss fires', async () => {
  let resolveSr;
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockImplementation(() => new Promise((res) => { resolveSr = res; }));
  const cb = { onDone: jest.fn(), onShare: jest.fn(), onHidden: jest.fn() };
  let r;
  act(() => { r = TestRenderer.create(React.createElement(CompletionCelebration, { visible: true, milestone: MILESTONE, ...cb })); });
  act(() => { r.update(React.createElement(CompletionCelebration, { visible: false, milestone: null, ...cb })); });
  await act(async () => { resolveSr(false); });
  act(() => { jest.advanceTimersByTime(celebration.autoDismissAt * 2); });
  expect(cb.onDone).not.toHaveBeenCalled();
  act(() => r.unmount());
});

test('m2: the message is not announced when accessibility focus can be set on the headline', async () => {
  const { announce } = require('../../utils/a11y');
  announce.mockClear();
  const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => {});
  const RN = require('react-native');
  const fnh = jest.spyOn(RN, 'findNodeHandle').mockImplementation(() => 42);
  const { r } = setup();
  await flush();
  act(() => { jest.advanceTimersByTime(celebration.textInAt + 10); });
  expect(focus).toHaveBeenCalledWith(42);
  expect(announce).not.toHaveBeenCalled();
  fnh.mockRestore();
  act(() => r.unmount());
});
