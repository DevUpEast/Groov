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

jest.mock('../../../services/feedback', () => ({
  __esModule: true, default: { play: jest.fn() }, EVENTS: { destructiveConfirm: 'destructiveConfirm' },
}));

const Dialog = require('../Dialog').default;
const feedback = require('../../../services/feedback').default;

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

describe('Dialog actions (F-02)', () => {
  const { themes } = jest.requireActual('../../../theme/colors');
  const theme = themes.light;
  const flat = (style) => Object.assign({}, ...[].concat(style).flat(Infinity).filter(Boolean));
  const btn = (r, label) => pressable(r, label);
  const labelColor = (r, label) => flat(btn(r, label).findAll(n => n.type === require('react-native').Text)[0].props.style).color;

  it('draws primary as action/onAction and destructive as dangerFill/onDanger, per action', () => {
    const actions = [
      { label: 'Cancel', onPress: jest.fn() },
      { label: 'Delete', variant: 'destructive', onPress: jest.fn() },
      { label: 'Save', variant: 'primary', onPress: jest.fn() },
    ];
    const r = render({ visible: true, onClose: jest.fn(), title: 'T', actions });
    expect(flat(btn(r, 'Save').props.style).backgroundColor).toBe(theme.action);
    expect(labelColor(r, 'Save')).toBe(theme.onAction);
    expect(flat(btn(r, 'Delete').props.style).backgroundColor).toBe(theme.dangerFill);
    expect(labelColor(r, 'Delete')).toBe(theme.onDanger);
    expect(flat(btn(r, 'Cancel').props.style).backgroundColor).toBeUndefined();
    expect(flat(btn(r, 'Cancel').props.style).borderColor).toBe(theme.controlBorder);
  });

  it('keeps the legacy `destructive` prop: primary actions turn destructive', () => {
    const r = render({ visible: true, onClose: jest.fn(), title: 'T', destructive: true, actions: [{ label: 'Go', variant: 'primary', onPress: jest.fn() }] });
    expect(flat(btn(r, 'Go').props.style).backgroundColor).toBe(theme.dangerFill);
  });

  it('dims every disabled action, secondary included', () => {
    const r = render({ visible: true, onClose: jest.fn(), title: 'T', actions: [
      { label: 'Cancel', disabled: true, onPress: jest.fn() },
      { label: 'Save', variant: 'primary', disabled: true, onPress: jest.fn() },
    ] });
    expect(flat(btn(r, 'Cancel').props.style).opacity).toBeLessThan(1);
    expect(flat(btn(r, 'Save').props.style).opacity).toBeLessThan(1);
  });

  it('stacks three actions or a long label, main action on top; two short ones stay in a row', () => {
    const { shouldStack, STACK_LABEL_CHARS } = require('../Dialog');
    const short = [{ label: 'Cancel' }, { label: 'Save' }];
    expect(shouldStack(short)).toBe(false);
    expect(shouldStack([...short, { label: 'Later' }])).toBe(true);
    expect(shouldStack([{ label: 'Abbrechen' }, { label: 'Alle Daten zurücksetzen' }])).toBe(true);
    expect('Alle Daten zurücksetzen'.length).toBeGreaterThan(STACK_LABEL_CHARS);
    expect(shouldStack(short, 'stack')).toBe(true);
    expect(shouldStack([...short, { label: 'x' }], 'row')).toBe(false);

    const r = render({ visible: true, onClose: jest.fn(), title: 'T', actions: [
      { label: 'Cancel', onPress: jest.fn() }, { label: 'Not now', onPress: jest.fn() }, { label: 'Save', variant: 'primary', onPress: jest.fn() },
    ] });
    expect(r.root.findAll(n => n.props.testID === 'dialog-actions-stacked').length).toBeGreaterThan(0);
    const order = [...new Set(r.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function').map(b => b.props.accessibilityLabel))];
    expect(order).toEqual(['Save', 'Not now', 'Cancel']);
  });

  it('sits on the overlay surface (level 3)', () => {
    const r = render({ visible: true, onClose: jest.fn(), title: 'T' });
    const card = r.root.findAll(n => n.type === View && n.props.accessibilityViewIsModal)[0];
    expect(flat(card.props.style).backgroundColor).toBe(theme.overlay);
  });

  it('registers as an open overlay while visible (status bar, F-02)', () => {
    const { anyOverlayOpen, openOverlayCount } = require('../../../utils/overlayStatus');
    const before = openOverlayCount(); // earlier tests leave their dialogs mounted
    const r = render({ visible: true, onClose: jest.fn(), title: 'T' });
    expect(anyOverlayOpen()).toBe(true);
    expect(openOverlayCount()).toBe(before + 1);
    act(() => { r.update(React.createElement(Dialog, { visible: false, onClose: jest.fn(), title: 'T' })); });
    expect(openOverlayCount()).toBe(before);
    act(() => { r.unmount(); });
  });
});

describe('SettingsScreen dialogs', () => {
  const settings = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'screens', 'SettingsScreen.js'), 'utf8');

  it('uses Dialog for all four overlays (plus the F-04a dev Feedback log) and no longer has the absolute overlay', () => {
    expect((settings.match(/<Dialog\b/g) || []).length).toBe(5);
    expect(settings).not.toMatch(/devModal/);
    expect(settings).not.toMatch(/zIndex: 999/);
  });

  it('shows the reset-success and dev-unlock alerts only from onDismiss', () => {
    expect(settings).not.toMatch(/Alert\.alert\(t\('settings\.resetModal\.success/);
    expect(settings).not.toMatch(/Alert\.alert\(t\('settings\.dev\.unlocked/);
    expect((settings.match(/onDismiss=\{flushAfterDialogAlert\}/g) || []).length).toBe(2);
  });
});

describe('Dialog destructiveConfirm haptic (F-04a)', () => {
  beforeEach(() => feedback.play.mockClear());
  const actions = (variant) => [{ label: 'Cancel', onPress: jest.fn() }, { label: 'Delete', variant, onPress: jest.fn() }];

  it('plays once per open when an action is destructive, never while hidden', () => {
    const r = render({ visible: false, onClose: jest.fn(), title: 'T', actions: actions('destructive') });
    expect(feedback.play).not.toHaveBeenCalled();
    act(() => { r.update(React.createElement(Dialog, { visible: true, onClose: jest.fn(), title: 'T', actions: actions('destructive') })); });
    expect(feedback.play).toHaveBeenCalledTimes(1);
    expect(feedback.play).toHaveBeenCalledWith('destructiveConfirm');
    act(() => { r.update(React.createElement(Dialog, { visible: true, onClose: jest.fn(), title: 'T2', actions: actions('destructive') })); });
    expect(feedback.play).toHaveBeenCalledTimes(1);
    act(() => { r.update(React.createElement(Dialog, { visible: false, onClose: jest.fn(), title: 'T', actions: actions('destructive') })); });
    act(() => { r.update(React.createElement(Dialog, { visible: true, onClose: jest.fn(), title: 'T', actions: actions('destructive') })); });
    expect(feedback.play).toHaveBeenCalledTimes(2);
  });

  it('plays for the legacy destructive shorthand and when mounted open', () => {
    render({ visible: true, destructive: true, onClose: jest.fn(), title: 'T', actions: actions('primary') });
    expect(feedback.play).toHaveBeenCalledTimes(1);
  });

  it('stays silent for a non-destructive dialog', () => {
    render({ visible: true, onClose: jest.fn(), title: 'T', actions: actions('primary') });
    expect(feedback.play).not.toHaveBeenCalled();
  });
});
