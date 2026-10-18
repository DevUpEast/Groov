// OverlayModal (F-02): registers the overlay at once. On Android, when opening would change the
// status-bar style (dark Today), the Modal opens two frames later, after the status bar has
// switched, because the dialog window copies it only on creation. Otherwise it opens at once.
global.IS_REACT_ACT_ENVIRONMENT = true;

function load(os, { changesStatusBar = true } = {}) {
  jest.resetModules();
  jest.doMock('../../../context/AppContext', () => {
    const { themes } = jest.requireActual('../../../theme/colors');
    return { useApp: () => ({ theme: themes.dark }) };
  });
  const RN = require('react-native');
  RN.Platform.OS = os;
  const status = require('../../../utils/overlayStatus');
  status.setOverlayChangesStatusBar(changesStatusBar);
  const TestRenderer = require('react-test-renderer');
  return {
    OverlayModal: require('../OverlayModal').default, status, RN,
    React: require('react'), TestRenderer, act: TestRenderer.act,
  };
}

afterEach(() => { jest.useRealTimers(); });

function mount({ OverlayModal, React, TestRenderer, act, RN }, props) {
  let r;
  act(() => { r = TestRenderer.create(React.createElement(OverlayModal, { onRequestClose: () => {}, ...props })); });
  const modal = () => r.root.findAll(n => n.type === RN.Modal)[0];
  const update = (p) => act(() => { r.update(React.createElement(OverlayModal, { onRequestClose: () => {}, ...p })); });
  return { r, modal, update };
}

it('on Android, when the status bar must change, registers first and opens after two frames; closes at once', () => {
  jest.useFakeTimers();
  const env = load('android');
  const before = env.status.openOverlayCount();
  const { r, modal, update } = mount(env, { visible: true, transparent: true });
  expect(env.status.openOverlayCount()).toBe(before + 1);
  expect(modal().props.visible).toBe(false);
  env.act(() => { jest.advanceTimersByTime(100); });
  expect(modal().props.visible).toBe(true);
  expect(modal().props.transparent).toBe(true);
  update({ visible: false });
  expect(modal().props.visible).toBe(false);
  expect(env.status.openOverlayCount()).toBe(before);
  env.act(() => { r.unmount(); });
});

it('on Android opens at once when the status bar would not change (light mode, other screens)', () => {
  jest.useFakeTimers();
  const env = load('android', { changesStatusBar: false });
  const { r, modal } = mount(env, { visible: true });
  expect(modal().props.visible).toBe(true);
  env.act(() => { r.unmount(); });
});

it('unmounting while the open is pending cancels it and restores the overlay count', () => {
  jest.useFakeTimers();
  const env = load('android');
  const before = env.status.openOverlayCount();
  const cancel = jest.spyOn(global, 'cancelAnimationFrame');
  const { r } = mount(env, { visible: true });
  expect(env.status.openOverlayCount()).toBe(before + 1);
  env.act(() => { r.unmount(); });
  expect(cancel).toHaveBeenCalled();
  expect(env.status.openOverlayCount()).toBe(before);
  expect(() => env.act(() => { jest.advanceTimersByTime(100); })).not.toThrow();
  cancel.mockRestore();
});

it('closing within the two frames never shows the Modal', () => {
  jest.useFakeTimers();
  const env = load('android');
  const { r, modal, update } = mount(env, { visible: true });
  env.act(() => { jest.advanceTimersByTime(5); });
  update({ visible: false });
  env.act(() => { jest.advanceTimersByTime(200); });
  expect(modal().props.visible).toBe(false);
  env.act(() => { r.unmount(); });
});

it('on iOS opens at once', () => {
  const env = load('ios');
  const { r, modal } = mount(env, { visible: true });
  expect(modal().props.visible).toBe(true);
  env.act(() => { r.unmount(); });
});

it('Dialog focus still lands through a deferred Android open (onShow passes through)', () => {
  jest.useFakeTimers();
  const env = load('android');
  const Dialog = require('../Dialog').default;
  const field = { focus: jest.fn(), isFocused: () => true };
  let r;
  env.act(() => { r = env.TestRenderer.create(env.React.createElement(Dialog, { visible: true, onClose: jest.fn(), title: 'T', initialFocusRef: { current: field } })); });
  const modal = () => r.root.findAll(n => n.type === env.RN.Modal)[0];
  expect(modal().props.visible).toBe(false);
  env.act(() => { jest.advanceTimersByTime(100); });
  expect(modal().props.visible).toBe(true);
  env.act(() => { modal().props.onShow(); });
  env.act(() => { jest.advanceTimersByTime(150); });
  expect(field.focus).toHaveBeenCalledTimes(1);
  env.act(() => { r.unmount(); });
});
