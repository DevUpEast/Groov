// Render tests for the shared Dialog (S-04), plus a source check that Settings uses it.
const fs = require('fs');
const path = require('path');
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const { Modal, Platform, View } = require('react-native');

jest.mock('../../../context/AppContext', () => {
  const { themes } = jest.requireActual('../../../theme/colors');
  return { useApp: () => ({ theme: themes.light }) };
});

const Dialog = require('../Dialog').default;

global.IS_REACT_ACT_ENVIRONMENT = true;

const originalOS = Platform.OS;
afterEach(() => {
  Platform.OS = originalOS;
  jest.useRealTimers();
});

function render(props) {
  let renderer;
  act(() => { renderer = TestRenderer.create(React.createElement(Dialog, props)); });
  return renderer;
}
const modalOf = (r) => r.root.findAll(n => n.type === Modal)[0];
const pressable = (r, label) => r.root.findAll(
  n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
)[0];

describe('Dialog', () => {
  it('is a transparent fade Modal that covers the status and navigation bars', () => {
    const m = modalOf(render({ visible: true, onClose: jest.fn(), title: 'T' })).props;
    expect(m.visible).toBe(true);
    expect(m.transparent).toBe(true);
    expect(m.animationType).toBe('fade');
    expect(m.statusBarTranslucent).toBe(true);
    expect(m.navigationBarTranslucent).toBe(true);
  });

  it('closes on Android back (onRequestClose) when dismissable', () => {
    const onClose = jest.fn();
    const r = render({ visible: true, onClose, title: 'T' });
    act(() => { modalOf(r).props.onRequestClose(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores back, scrim and escape when not dismissable', () => {
    const onClose = jest.fn();
    const r = render({ visible: true, onClose, title: 'T', dismissable: false });
    act(() => { modalOf(r).props.onRequestClose(); });
    act(() => { r.root.findByProps({ testID: 'dialog-scrim' }).props.onPress(); });
    const card = r.root.findAll(n => n.type === View && n.props.accessibilityViewIsModal)[0];
    act(() => { card.props.onAccessibilityEscape(); });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on a scrim press and on the accessibility escape gesture', () => {
    const onClose = jest.fn();
    const r = render({ visible: true, onClose, title: 'T' });
    act(() => { r.root.findByProps({ testID: 'dialog-scrim' }).props.onPress(); });
    const card = r.root.findAll(n => n.type === View && n.props.accessibilityViewIsModal)[0];
    act(() => { card.props.onAccessibilityEscape(); });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('is announced as a modal with a header title', () => {
    const r = render({ visible: true, onClose: jest.fn(), title: 'Display Name', body: 'Sub' });
    expect(r.root.findAll(n => n.props.accessibilityViewIsModal === true).length).toBeGreaterThan(0);
    const header = r.root.findAll(n => n.props.accessibilityRole === 'header')[0];
    expect(header.props.children).toBe('Display Name');
  });

  it('runs action presses, in order, with roles and names; loading disables and relabels', () => {
    const cancel = jest.fn();
    const save = jest.fn();
    const actions = [
      { key: 'c', label: 'Cancel', onPress: cancel },
      { key: 's', label: 'Save', variant: 'primary', onPress: save },
    ];
    const r = render({ visible: true, onClose: jest.fn(), title: 'T', actions });
    const buttons = r.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function');
    expect([...new Set(buttons.map(b => b.props.accessibilityLabel))]).toEqual(['Cancel', 'Save']);
    act(() => { pressable(r, 'Cancel').props.onPress(); });
    act(() => { pressable(r, 'Save').props.onPress(); });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);

    act(() => {
      r.update(React.createElement(Dialog, {
        visible: true, onClose: jest.fn(), title: 'T',
        actions: [actions[0], { ...actions[1], loading: true, loadingLabel: 'Saving…' }],
      }));
    });
    const busy = pressable(r, 'Save');
    expect(busy.props.disabled).toBe(true);
    expect(busy.props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(r.root.findAll(n => n.props.children === 'Saving…').length).toBeGreaterThan(0);
  });

  it('focuses initialFocusRef after onShow on Android, retrying once if focus did not land', () => {
    Platform.OS = 'android';
    jest.useFakeTimers();
    let focused = false;
    const field = { focus: jest.fn(() => { if (field.focus.mock.calls.length >= 2) focused = true; }), isFocused: () => focused };
    const r = render({ visible: true, onClose: jest.fn(), title: 'T', initialFocusRef: { current: field } });
    act(() => { modalOf(r).props.onShow(); });
    act(() => { jest.advanceTimersByTime(149); });
    expect(field.focus).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(1); });
    expect(field.focus).toHaveBeenCalledTimes(1);
    act(() => { jest.advanceTimersByTime(150); });
    expect(field.focus).toHaveBeenCalledTimes(2);
    act(() => { jest.advanceTimersByTime(1000); });
    expect(field.focus).toHaveBeenCalledTimes(2);
  });

  it('does not retry when the first Android focus landed', () => {
    Platform.OS = 'android';
    jest.useFakeTimers();
    const field = { focus: jest.fn(), isFocused: () => true };
    const r = render({ visible: true, onClose: jest.fn(), title: 'T', initialFocusRef: { current: field } });
    act(() => { modalOf(r).props.onShow(); });
    act(() => { jest.advanceTimersByTime(1000); });
    expect(field.focus).toHaveBeenCalledTimes(1);
  });

  it('focuses right after onShow on iOS', () => {
    Platform.OS = 'ios';
    jest.useFakeTimers();
    const field = { focus: jest.fn(), isFocused: () => true };
    const r = render({ visible: true, onClose: jest.fn(), title: 'T', initialFocusRef: { current: field } });
    act(() => { modalOf(r).props.onShow(); });
    act(() => { jest.advanceTimersByTime(0); });
    expect(field.focus).toHaveBeenCalledTimes(1);
  });

  it('fires onDismiss through the Modal on iOS', () => {
    Platform.OS = 'ios';
    const onDismiss = jest.fn();
    const r = render({ visible: true, onClose: jest.fn(), onDismiss, title: 'T' });
    act(() => { r.update(React.createElement(Dialog, { visible: false, onClose: jest.fn(), onDismiss, title: 'T' })); });
    expect(onDismiss).not.toHaveBeenCalled(); // waits for the native dismissal
    act(() => { modalOf(r).props.onDismiss(); });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('fires onDismiss once after close on Android, and not on first render', () => {
    Platform.OS = 'android';
    const onDismiss = jest.fn();
    const r = render({ visible: false, onClose: jest.fn(), onDismiss, title: 'T' });
    expect(modalOf(r).props.onDismiss).toBeUndefined();
    act(() => { r.update(React.createElement(Dialog, { visible: true, onClose: jest.fn(), onDismiss, title: 'T' })); });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => { r.update(React.createElement(Dialog, { visible: false, onClose: jest.fn(), onDismiss, title: 'T' })); });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    act(() => { r.update(React.createElement(Dialog, { visible: false, onClose: jest.fn(), onDismiss, title: 'T' })); });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsScreen dialogs', () => {
  const settings = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'screens', 'SettingsScreen.js'), 'utf8');

  it('uses Dialog for all four overlays and no longer has the absolute overlay', () => {
    expect((settings.match(/<Dialog\b/g) || []).length).toBe(4);
    expect(settings).not.toMatch(/devModal/);
    expect(settings).not.toMatch(/zIndex: 999/);
  });

  it('shows the reset-success and dev-unlock alerts only from onDismiss', () => {
    expect(settings).not.toMatch(/Alert\.alert\(t\('settings\.resetModal\.success/);
    expect(settings).not.toMatch(/Alert\.alert\(t\('settings\.dev\.unlocked/);
    expect((settings.match(/onDismiss=\{flushAfterDialogAlert\}/g) || []).length).toBe(2);
  });
});
