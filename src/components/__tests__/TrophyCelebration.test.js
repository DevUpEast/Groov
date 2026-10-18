// CEL-2 (S-09): the trophy is a root Modal; a tap or the back key dismisses it once it has
// been up for 1 s, and an early dismiss cancels the auto-dismiss timer.
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const { Modal, Animated } = require('react-native');

jest.mock('../../services/feedback', () => ({ __esModule: true, default: { play: jest.fn() }, EVENTS: { trophy: 'trophy' } }));
let mockReduced = false;
jest.mock('../../utils/a11y', () => ({ useReducedMotion: () => mockReduced, announce: jest.fn() }));

const TrophyCelebration = require('../TrophyCelebration').default;
const { TROPHY_SKIP_AFTER_MS, TROPHY_FALLBACK_MS } = require('../TrophyCelebration');
const { themes } = require('../../theme/colors');

global.IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => { jest.useFakeTimers(); mockReduced = false; });
afterEach(() => { jest.useRealTimers(); jest.clearAllMocks(); });

function mount(onDone) {
  let r;
  act(() => { r = TestRenderer.create(<TrophyCelebration visible onDone={onDone} theme={themes.light} />); });
  return r;
}
// The full-screen scrim is the tap target (role button, with an onPress).
const scrim = (r) => r.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')[0];
const press = (r) => act(() => { scrim(r).props.onPress(); });
const back = (r) => act(() => { r.root.findByType(Modal).props.onRequestClose(); });

describe('TrophyCelebration (CEL-2)', () => {
  it('renders inside a translucent-status-bar Modal with a back handler', () => {
    const r = mount(jest.fn());
    const modal = r.root.findByType(Modal);
    expect(modal.props.transparent).toBe(true);
    expect(modal.props.statusBarTranslucent).toBe(true);
    expect(typeof modal.props.onRequestClose).toBe('function');
  });

  it('ignores a tap and the back key during the first second', () => {
    const onDone = jest.fn();
    const r = mount(onDone);
    act(() => { jest.advanceTimersByTime(TROPHY_SKIP_AFTER_MS - 50); });
    press(r);
    back(r);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('dismisses on a tap after 1 s, once, and clears the auto-dismiss timer', () => {
    const onDone = jest.fn();
    const r = mount(onDone);
    act(() => { jest.advanceTimersByTime(TROPHY_SKIP_AFTER_MS); });
    press(r);
    expect(onDone).toHaveBeenCalledTimes(1);
    act(() => { jest.advanceTimersByTime(10000); });
    press(r);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('dismisses on the Android back key after 1 s', () => {
    const onDone = jest.fn();
    const r = mount(onDone);
    act(() => { jest.advanceTimersByTime(TROPHY_SKIP_AFTER_MS + 10); });
    back(r);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('closes by the fallback timer when the orbit animation never finishes', () => {
    const timing = jest.spyOn(Animated, 'timing').mockReturnValue({ start: () => {}, stop: () => {}, reset: () => {} });
    const onDone = jest.fn();
    mount(onDone);
    act(() => { jest.advanceTimersByTime(TROPHY_FALLBACK_MS - 10); });
    expect(onDone).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(20); });
    expect(onDone).toHaveBeenCalledTimes(1);
    timing.mockRestore();
  });

  it('does not fade the Modal in under reduced motion', () => {
    mockReduced = true;
    const r = mount(jest.fn());
    expect(r.root.findByType(Modal).props.animationType).toBe('none');
  });

  it('still auto-dismisses with reduced motion, exactly once', () => {
    mockReduced = true;
    const onDone = jest.fn();
    mount(onDone);
    act(() => { jest.advanceTimersByTime(2000); });
    expect(onDone).toHaveBeenCalledTimes(1);
    act(() => { jest.advanceTimersByTime(10000); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
