// C-10: the shared Snackbar (plan §3). One at a time (a newer one replaces it and bumps), the
// 8 s / 10 s (screen reader) timeout, pausing while touched or under a sheet or dialog,
// announce, Undo, the app going to the background, unmount, the exit animation, reduced motion
// and the content inset.
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const { Animated, AppState, Platform, StyleSheet } = require('react-native');

let mockReduced = false;
let mockReader = false;
jest.mock('../../../utils/a11y', () => ({
  useReducedMotion: () => mockReduced,
  isReducedMotion: () => mockReduced,
  isScreenReaderOn: () => mockReader,
  subscribeScreenReader: () => () => {},
  announce: jest.fn(),
}));

const { SnackbarProvider, SnackbarView, useSnackbar, useSnackbarInset, snackbarDuration } = require('../Snackbar');
const { overlayOpened } = require('../../../utils/overlayStatus');
const { announce } = require('../../../utils/a11y');
const { themes } = require('../../../theme/colors');
const { snackbar: SNACK } = require('../../../theme/motion');

global.IS_REACT_ACT_ENVIRONMENT = true;

let configs;
let springs;
let appStateListeners;
let holdExit; // when set, exit timings wait for finishExit()
let pendingExit;
beforeEach(() => {
  mockReduced = false;
  mockReader = false;
  configs = [];
  springs = [];
  holdExit = false;
  pendingExit = [];
  announce.mockClear();
  jest.spyOn(Animated, 'timing').mockImplementation((value, config) => {
    configs.push(config);
    return {
      start: (cb) => {
        const done = () => { value.setValue(config.toValue); cb?.({ finished: true }); };
        if (holdExit) pendingExit.push(done);
        else done();
      },
      stop: jest.fn(),
    };
  });
  jest.spyOn(Animated, 'spring').mockImplementation((value, config) => {
    springs.push({ value, config, from: value.__getValue() });
    return { start: (cb) => { value.setValue(config.toValue); cb?.({ finished: true }); }, stop: jest.fn() };
  });
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
    appStateListeners.push(fn);
    return { remove: () => { appStateListeners = appStateListeners.filter(f => f !== fn); } };
  });
  jest.useFakeTimers();
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

function render() {
  const ref = { api: null, inset: 0 };
  function Probe() {
    ref.api = useSnackbar();
    ref.inset = useSnackbarInset();
    return null;
  }
  const tree = (
    <SnackbarProvider>
      <Probe />
      <SnackbarView bottom={56} theme={themes.light} />
    </SnackbarProvider>
  );
  let r;
  act(() => { r = TestRenderer.create(tree); });
  const bar = () => r.root.findAll(n => n.props.testID === 'snackbar')[0] || null;
  const surface = () => bar().findAll(n => typeof n.props.onTouchStart === 'function')[0];
  const action = () => bar().findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')[0];
  const texts = () => (bar() ? [...new Set(bar().findAll(n => typeof n.props.children === 'string').map(n => n.props.children))] : []);
  const show = (item) => { let id; act(() => { id = ref.api.show(item); }); return id; };
  const advance = (ms) => act(() => { jest.advanceTimersByTime(ms); });
  return { r, ref, bar, surface, action, texts, show, advance };
}
const item = (over) => ({ message: 'Read skipped today', actionLabel: 'Undo', onAction: jest.fn(), onHide: jest.fn(), ...over });

describe('Snackbar', () => {
  it('shows the message and its action, announces it, and hides itself after 8 s', () => {
    const s = render();
    const it1 = item();
    s.show(it1);
    expect(s.texts()).toEqual(['Read skipped today', 'Undo']);
    expect(announce).toHaveBeenCalledWith('Read skipped today');
    // The action's name carries the message for a screen reader that reaches it later.
    expect(s.action().props.accessibilityLabel).toBe('Undo: Read skipped today');
    s.advance(SNACK.standard - 1);
    expect(it1.onHide).not.toHaveBeenCalled();
    s.advance(1);
    expect(it1.onHide).toHaveBeenCalledWith('timeout');
    expect(it1.onAction).not.toHaveBeenCalled();
    expect(s.bar()).toBeNull(); // the exit ran (mocked to finish at once)
  });

  it('lasts 10 s with a screen reader on', () => {
    expect(snackbarDuration({}, false)).toBe(8000);
    expect(snackbarDuration({}, true)).toBe(10000);
    expect(snackbarDuration({ duration: 4000 }, true)).toBe(10000);
    mockReader = true;
    const s = render();
    const it1 = item();
    s.show(it1);
    s.advance(9999);
    expect(it1.onHide).not.toHaveBeenCalled();
    s.advance(1);
    expect(it1.onHide).toHaveBeenCalledWith('timeout');
  });

  it('pauses while touched, then resumes with the time that was left', () => {
    const s = render();
    const it1 = item();
    s.show(it1);
    s.advance(6000);
    act(() => { s.surface().props.onTouchStart(); });
    s.advance(60000);
    expect(it1.onHide).not.toHaveBeenCalled();
    act(() => { s.surface().props.onTouchEnd(); });
    s.advance(1999);
    expect(it1.onHide).not.toHaveBeenCalled();
    s.advance(1);
    expect(it1.onHide).toHaveBeenCalledWith('timeout');
  });

  it('pauses while a sheet or dialog is open over it', () => {
    const s = render();
    const it1 = item();
    s.show(it1);
    s.advance(1000);
    let close;
    act(() => { close = overlayOpened(); });
    s.advance(30000);
    expect(it1.onHide).not.toHaveBeenCalled();
    act(() => { close(); });
    s.advance(7000);
    expect(it1.onHide).toHaveBeenCalledWith('timeout');
  });

  it('Undo runs onAction (never onHide) and says "Undone"', () => {
    const s = render();
    const it1 = item();
    s.show(it1);
    act(() => { s.action().props.onPress(); });
    expect(it1.onAction).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenLastCalledWith('Undone');
    s.advance(20000);
    expect(it1.onHide).not.toHaveBeenCalled();
  });

  it('one at a time: a newer snackbar replaces the shown one, which closes, and bumps in place', () => {
    const s = render();
    const a = item({ message: 'Marked 2 habits done' });
    const b = item({ message: 'Read skipped today' });
    s.show(a);
    s.advance(5000);
    springs = [];
    s.show(b);
    expect(a.onHide).toHaveBeenCalledWith('replaced');
    expect(s.texts()[0]).toBe('Read skipped today');
    // The bump: scale 1.03 -> 1 on the snappy spring.
    expect(springs).toHaveLength(1);
    expect(springs[0].from).toBeCloseTo(SNACK.bumpFrom);
    expect(springs[0].config).toMatchObject({ toValue: 1, stiffness: 400 });
    // The newcomer gets a full window of its own.
    s.advance(7999);
    expect(b.onHide).not.toHaveBeenCalled();
    s.advance(1);
    expect(b.onHide).toHaveBeenCalledWith('timeout');
  });

  it('backgrounding hides only an endsOnBackground snackbar', () => {
    const s = render();
    const keep = item();
    s.show(keep);
    act(() => { appStateListeners.forEach(fn => fn('background')); });
    expect(keep.onHide).not.toHaveBeenCalled();
    const ends = item({ endsOnBackground: true });
    s.show(ends);
    act(() => { appStateListeners.forEach(fn => fn('background')); });
    expect(ends.onHide).toHaveBeenCalledWith('background');
  });

  it('dismiss by id or predicate, and unmount closes what is showing', () => {
    const s = render();
    const a = item();
    const id = s.show(a);
    let hit;
    act(() => { hit = s.ref.api.dismiss(id + 1); });
    expect(hit).toBe(false);
    act(() => { hit = s.ref.api.dismiss(id); });
    expect(hit).toBe(true);
    expect(a.onHide).toHaveBeenCalledWith('dismissed');
    const b = item();
    s.show(b);
    act(() => { s.r.unmount(); });
    expect(b.onHide).toHaveBeenCalledWith('unmount');
  });

  it('keeps the last snackbar on screen, untouchable and hidden from screen readers, until its exit finishes', () => {
    const s = render();
    s.show(item());
    holdExit = true;
    act(() => { s.ref.api.dismiss(); });
    const wrap = s.bar();
    expect(wrap).not.toBeNull();
    expect(wrap.props.pointerEvents).toBe('none');
    expect(wrap.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(wrap.props.accessibilityElementsHidden).toBe(true);
    const exits = configs.slice(-2);
    expect(exits.map(c => c.duration)).toEqual([210, 210]); // duration.exit(value)
    act(() => { pendingExit.splice(0).forEach(f => f()); });
    expect(s.bar()).toBeNull();
  });

  it('reduced motion: fades in 150 ms, never slides or bumps', () => {
    mockReduced = true;
    const s = render();
    configs = [];
    s.show(item());
    expect(configs).toHaveLength(1);
    expect(configs[0]).toMatchObject({ toValue: 1, duration: 150 });
    springs = [];
    s.show(item({ message: 'Next' }));
    expect(springs).toHaveLength(0);
  });

  it('pads the content by its height while it shows (list-end buttons stay reachable)', () => {
    const s = render();
    expect(s.ref.inset).toBe(0);
    s.show(item());
    expect(s.ref.inset).toBe(0); // not measured yet
    act(() => { s.surface().props.onLayout({ nativeEvent: { layout: { height: 52 } } }); });
    expect(s.ref.inset).toBe(52 + SNACK.gap);
    act(() => { s.ref.api.dismiss(); }); // the exit is mocked to finish at once
    expect(s.ref.inset).toBe(0);
  });

  it('sits above the tab bar; Android is a full-width bar, iOS a floating pill', () => {
    const s = render();
    s.show(item());
    const wrap = StyleSheet.flatten(s.bar().props.style);
    expect(wrap.bottom).toBe(56 + SNACK.gap);
    const bar = StyleSheet.flatten(s.surface().props.style);
    if (Platform.OS === 'android') {
      expect(wrap).toMatchObject({ left: 8, right: 8 });
      expect(bar.alignSelf).toBe('stretch');
    } else {
      expect(wrap.alignItems).toBe('center');
      expect(bar.borderRadius).toBe(999);
    }
    expect(bar.backgroundColor).toBe(themes.light.toast);
  });

  it('flush() ends what shows as "flush" and resolves with its onHide result (Settings, before sign-out)', async () => {
    const s = render();
    const it1 = item({ onHide: jest.fn(() => Promise.resolve('synced')) });
    s.show(it1);
    let result;
    await act(async () => { result = await s.ref.api.flush(); });
    expect(it1.onHide).toHaveBeenCalledWith('flush');
    expect(result).toBe('synced');
    await act(async () => { result = await s.ref.api.flush(); }); // nothing showing
    expect(result).toBeUndefined();
  });

  it('showing(kind) names what is on screen', () => {
    const s = render();
    expect(s.ref.api.showing('markRest')).toBe(false);
    s.show(item({ kind: 'markRest' }));
    expect(s.ref.api.showing('markRest')).toBe(true);
    expect(s.ref.api.showing('skip')).toBe(false);
  });

  it('keeps the inset until the exit animation has finished (no jump under a leaving bar)', () => {
    const s = render();
    s.show(item());
    act(() => { s.surface().props.onLayout({ nativeEvent: { layout: { height: 52 } } }); });
    holdExit = true;
    act(() => { s.ref.api.dismiss(); });
    expect(s.ref.inset).toBe(52 + SNACK.gap);
    act(() => { pendingExit.splice(0).forEach(f => f()); });
    expect(s.ref.inset).toBe(0);
  });

  it('without a provider, show is a no-op (screens render in isolation)', () => {
    let api;
    function Lone() { api = useSnackbar(); return null; }
    act(() => { TestRenderer.create(<Lone />); });
    expect(api.show({ message: 'x' })).toBeNull();
  });
});

describe('Snackbar on the web', () => {
  it('pauses while the mouse is over the bar', () => {
    jest.isolateModules(() => {
      // A fresh module graph (Platform.OS is read at import), with its own React + renderer.
      const R = require('react');
      const TR = require('react-test-renderer');
      const RN = require('react-native');
      const os = RN.Platform.OS;
      RN.Platform.OS = 'web';
      try {
        const Web = require('../Snackbar');
        const webThemes = require('../../../theme/colors').themes;
        const ref = {};
        function Probe() { ref.api = Web.useSnackbar(); return null; }
        let r;
        TR.act(() => {
          r = TR.create(R.createElement(Web.SnackbarProvider, null,
            R.createElement(Probe), R.createElement(Web.SnackbarView, { theme: webThemes.light })));
        });
        const it1 = item();
        TR.act(() => { ref.api.show(it1); });
        const surface = r.root.findAll(n => typeof n.props.onMouseEnter === 'function')[0];
        expect(surface).toBeTruthy();
        TR.act(() => { surface.props.onMouseEnter(); });
        TR.act(() => { jest.advanceTimersByTime(30000); });
        expect(it1.onHide).not.toHaveBeenCalled();
        TR.act(() => { surface.props.onMouseLeave(); });
        TR.act(() => { jest.advanceTimersByTime(SNACK.standard); });
        expect(it1.onHide).toHaveBeenCalledWith('timeout');
      } finally {
        RN.Platform.OS = os;
      }
    });
  });
});
