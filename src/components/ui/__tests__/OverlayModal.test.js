// OverlayModal (F-02): registers the overlay at once; on Android the Modal opens two frames later,
// after the status bar has switched, because the dialog window copies it only on creation.

global.IS_REACT_ACT_ENVIRONMENT = true;

function load(os) {
  jest.resetModules();
  const RN = require('react-native');
  RN.Platform.OS = os;
  const TestRenderer = require('react-test-renderer');
  return {
    OverlayModal: require('../OverlayModal').default, status: require('../../../utils/overlayStatus'), RN,
    React: require('react'), TestRenderer, act: TestRenderer.act,
  };
}

afterEach(() => { jest.useRealTimers(); });

it('on Android registers first and opens the Modal after two frames; closes at once', () => {
  jest.useFakeTimers();
  const { OverlayModal, status, RN, React, TestRenderer, act } = load('android');
  const before = status.openOverlayCount();
  let r;
  act(() => { r = TestRenderer.create(React.createElement(OverlayModal, { visible: true, transparent: true, onRequestClose: () => {} })); });
  const modal = () => r.root.findAll(n => n.type === RN.Modal)[0];
  expect(status.openOverlayCount()).toBe(before + 1);
  expect(modal().props.visible).toBe(false);
  act(() => { jest.advanceTimersByTime(100); });
  expect(modal().props.visible).toBe(true);
  expect(modal().props.transparent).toBe(true);
  act(() => { r.update(React.createElement(OverlayModal, { visible: false, onRequestClose: () => {} })); });
  expect(modal().props.visible).toBe(false);
  expect(status.openOverlayCount()).toBe(before);
  act(() => { r.unmount(); });
});

it('on iOS opens at once', () => {
  const { OverlayModal, RN, React, TestRenderer, act } = load('ios');
  let r;
  act(() => { r = TestRenderer.create(React.createElement(OverlayModal, { visible: true, onRequestClose: () => {} })); });
  expect(r.root.findAll(n => n.type === RN.Modal)[0].props.visible).toBe(true);
  act(() => { r.unmount(); });
});
