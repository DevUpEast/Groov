// Render tests for the shared ActionSheet (S-03), plus source checks for the Android back wiring.
const fs = require('fs');
const path = require('path');
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const { Modal, Platform, View, Text, StyleSheet, ActionSheetIOS } = require('react-native');

jest.mock('../../../context/AppContext', () => {
  const { themes } = jest.requireActual('../../../theme/colors');
  return { useApp: () => ({ theme: themes.light }) };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../services/feedback', () => ({ __esModule: true, default: { play: jest.fn() }, EVENTS: { longPress: 'longPress' } }));

const ActionSheet = require('../ActionSheet').default;
const feedback = require('../../../services/feedback').default;

global.IS_REACT_ACT_ENVIRONMENT = true;

const originalOS = Platform.OS;
afterEach(() => {
  Platform.OS = originalOS;
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

function render(props) {
  let renderer;
  act(() => { renderer = TestRenderer.create(React.createElement(ActionSheet, props)); });
  return renderer;
}
const modalOf = (r) => r.root.findAll(n => n.type === Modal)[0];
const buttons = (r) => r.root.findAll(
  n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && typeof n.type !== 'string',
);
const labels = (r) => [...new Set(buttons(r).map(b => b.props.accessibilityLabel))];

const makeOptions = () => [
  { label: 'Skip today', onPress: jest.fn() },
  { label: 'Mark done yesterday', onPress: jest.fn() },
  { label: 'Add a note', onPress: jest.fn() },
];

describe('ActionSheet (Android)', () => {
  beforeEach(() => { Platform.OS = 'android'; });

  it('lists every option plus a Cancel row, under a header title', () => {
    const r = render({ visible: true, title: 'Read', message: 'Pick', options: makeOptions(), onCancel: jest.fn() });
    expect(labels(r)).toEqual(['Skip today', 'Mark done yesterday', 'Add a note', 'Cancel']);
    const header = r.root.findAll(n => n.props.accessibilityRole === 'header')[0];
    expect(header.props.children).toBe('Read');
    expect(r.root.findAll(n => n.type === View && n.props.accessibilityViewIsModal).length).toBe(1);
  });

  it('closes on back (onRequestClose), scrim, Cancel and the escape gesture', () => {
    const onCancel = jest.fn();
    const r = render({ visible: true, title: 'T', options: makeOptions(), onCancel });
    act(() => { modalOf(r).props.onRequestClose(); });
    act(() => { r.root.findByProps({ testID: 'sheet-scrim' }).props.onPress(); });
    act(() => { buttons(r).find(b => b.props.accessibilityLabel === 'Cancel').props.onPress(); });
    const panel = r.root.findAll(n => n.type === View && n.props.accessibilityViewIsModal)[0];
    act(() => { panel.props.onAccessibilityEscape(); });
    expect(onCancel).toHaveBeenCalledTimes(4);
  });

  it('closes, then runs the chosen option only', () => {
    const order = [];
    const options = makeOptions();
    options[1].onPress.mockImplementation(() => order.push('option'));
    const onCancel = jest.fn(() => order.push('close'));
    const r = render({ visible: true, title: 'T', options, onCancel });
    act(() => { buttons(r).find(b => b.props.accessibilityLabel === 'Mark done yesterday').props.onPress(); });
    expect(order).toEqual(['close', 'option']);
    expect(options[0].onPress).not.toHaveBeenCalled();
    expect(options[2].onPress).not.toHaveBeenCalled();
  });

  it('draws a destructive option in the danger colour, still a named button', () => {
    const { themes } = jest.requireActual('../../../theme/colors');
    const options = [...makeOptions(), { label: 'Delete', onPress: jest.fn(), destructive: true }];
    const r = render({ visible: true, title: 'T', options, onCancel: jest.fn() });
    const row = buttons(r).find(b => b.props.accessibilityLabel === 'Delete');
    expect(row.props.accessibilityRole).toBe('button');
    const color = (n) => StyleSheet.flatten(n.props.style).color;
    expect(color(row.findAll(n => n.type === Text)[0])).toBe(themes.light.danger);
    const plain = buttons(r).find(b => b.props.accessibilityLabel === 'Skip today');
    expect(color(plain.findAll(n => n.type === Text)[0])).toBe(themes.light.text);
  });

  it('runs an option at most once per open, and re-arms when reopened', () => {
    const options = makeOptions();
    const props = { title: 'T', options, onCancel: jest.fn() };
    const r = render({ ...props, visible: true });
    const press = (label) => act(() => { buttons(r).find(b => b.props.accessibilityLabel === label).props.onPress(); });
    press('Skip today');
    press('Skip today');
    press('Add a note');
    expect(options[0].onPress).toHaveBeenCalledTimes(1);
    expect(options[2].onPress).not.toHaveBeenCalled();
    act(() => { r.update(React.createElement(ActionSheet, { ...props, visible: false })); });
    act(() => { r.update(React.createElement(ActionSheet, { ...props, visible: true })); });
    press('Skip today');
    expect(options[0].onPress).toHaveBeenCalledTimes(2);
  });

  it('plays the longPress feedback when it opens, not while hidden', () => {
    const r = render({ visible: false, title: 'T', options: makeOptions(), onCancel: jest.fn() });
    expect(feedback.play).not.toHaveBeenCalled();
    act(() => { r.update(React.createElement(ActionSheet, { visible: true, title: 'T', options: makeOptions(), onCancel: jest.fn() })); });
    expect(feedback.play).toHaveBeenCalledTimes(1);
    expect(feedback.play).toHaveBeenCalledWith('longPress');
  });
});

describe('ActionSheet (C-03): haptic and afterClose', () => {
  beforeEach(() => { Platform.OS = 'android'; });
  const Sheet = require('../Sheet').default;

  it('haptic={false} (opened from a plain button) plays nothing on open', () => {
    render({ visible: true, haptic: false, title: 'T', options: makeOptions(), onCancel: jest.fn() });
    expect(feedback.play).not.toHaveBeenCalled();
  });

  it('an afterClose option runs once the sheet has gone, not in the tap', () => {
    const options = [...makeOptions(), { label: 'Habit details', onPress: jest.fn(), afterClose: true }];
    const onCancel = jest.fn();
    const props = { title: 'T', options, onCancel };
    const r = render({ ...props, visible: true });
    act(() => { buttons(r).find(b => b.props.accessibilityLabel === 'Habit details').props.onPress(); });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(options[3].onPress).not.toHaveBeenCalled();
    act(() => { r.update(React.createElement(ActionSheet, { ...props, visible: false })); });
    act(() => { r.root.findAll(n => n.type === Sheet)[0].props.onDismiss(); });
    expect(options[3].onPress).toHaveBeenCalledTimes(1);
  });
});

describe('ActionSheet (iOS)', () => {
  it('uses the native sheet with Cancel as cancelButtonIndex and routes the choice', () => {
    Platform.OS = 'ios';
    const show = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => {});
    const options = makeOptions();
    const onCancel = jest.fn();
    const r = render({ visible: true, title: 'T', message: 'M', options, onCancel });
    expect(modalOf(r)).toBeUndefined();
    expect(show).toHaveBeenCalledTimes(1);
    const [config, callback] = show.mock.calls[0];
    expect(config.options).toEqual(['Skip today', 'Mark done yesterday', 'Add a note', 'Cancel']);
    expect(config.cancelButtonIndex).toBe(3);
    act(() => { callback(2); });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(options[2].onPress).toHaveBeenCalledTimes(1);
    // A fresh open: the Cancel index only hides the sheet.
    const r2 = render({ visible: true, title: 'T', options, onCancel });
    const cancelCallback = show.mock.calls[1][1];
    act(() => { cancelCallback(3); });
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(options[0].onPress).not.toHaveBeenCalled();
    act(() => { r2.unmount(); });
  });
});

describe('ActionSheet (iOS) destructive and repeat callbacks', () => {
  it('passes destructiveButtonIndex and ignores a second callback', () => {
    Platform.OS = 'ios';
    const show = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => {});
    const options = [makeOptions()[0], { label: 'Delete', onPress: jest.fn(), destructive: true }];
    render({ visible: true, title: 'T', options, onCancel: jest.fn() });
    const [config, callback] = show.mock.calls[0];
    expect(config.destructiveButtonIndex).toEqual([1]);
    expect(config.cancelButtonIndex).toBe(2);
    act(() => { callback(1); });
    act(() => { callback(1); });
    expect(options[1].onPress).toHaveBeenCalledTimes(1);
  });

  it('omits destructiveButtonIndex when no option is destructive', () => {
    Platform.OS = 'ios';
    const show = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => {});
    render({ visible: true, title: 'T', options: makeOptions(), onCancel: jest.fn() });
    expect(show.mock.calls[0][0].destructiveButtonIndex).toBeUndefined();
  });
});

describe('Android back wiring (source checks)', () => {
  const root = path.join(__dirname, '..', '..', '..', '..');
  const app = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
  const card = fs.readFileSync(path.join(root, 'src', 'components', 'HabitCard.js'), 'utf8');
  const picker = fs.readFileSync(path.join(root, 'src', 'components', 'TimePicker.js'), 'utf8');

  it('App returns to Today on back from another tab and lets Today exit', () => {
    expect(app).toMatch(/BackHandler\.addEventListener\('hardwareBackPress'/);
    expect(app).toMatch(/if \(activeIndexRef\.current === 0\) return false;[\s\S]{0,200}?goToTab\(0, \{ interrupt: true \}\);\s*return true;/);
    // A running slide is stopped rather than the press swallowed.
    expect(app).toMatch(/if \(interrupt && isAnimating\.current[^)]*\) \{\s*translateX\.stopAnimation\(\);[\s\S]{0,120}?isAnimating\.current = false;/);
  });

  it('hides inactive tab slots from TalkBack and VoiceOver', () => {
    expect(app).toMatch(/importantForAccessibility=\{activeIndex === i \? 'auto' : 'no-hide-descendants'\}/);
    expect(app).toMatch(/accessibilityElementsHidden=\{activeIndex !== i\}/);
    expect(app).toMatch(/aria-hidden=\{activeIndex !== i\}/);
  });

  it('HabitCard uses the ActionSheet instead of a multi-button Alert', () => {
    expect(card).not.toMatch(/Alert\.alert/);
    expect(card).toMatch(/<ActionSheet\b/);
  });

  it('every Modal in the app handles back via onRequestClose (TimePicker included)', () => {
    const files = [];
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== '__tests__') walk(p); } else if (p.endsWith('.js')) files.push(p);
    });
    walk(path.join(root, 'src'));
    files.push(path.join(root, 'App.js'));
    const missing = [];
    let tagCount = 0;
    files.forEach((f) => {
      // OverlayModal (F-02) only forwards its props to Modal; its callers are checked instead.
      if (f.endsWith('OverlayModal.js')) return;
      const src = fs.readFileSync(f, 'utf8');
      // Each opening tag runs up to the first '>' that ends a line (an arrow '=>' never does here).
      (src.match(/<(?:Overlay)?Modal\b[\s\S]*?>\s*\n/g) || []).forEach((tag) => {
        tagCount += 1;
        if (!/onRequestClose=/.test(tag)) missing.push(path.relative(root, f));
      });
    });
    // 8 Modal tags since F-10 moved the sheets onto ui/Sheet; a broken regex or path must not
    // pass by matching nothing.
    expect(tagCount).toBeGreaterThanOrEqual(8);
    expect(missing).toEqual([]);
    expect(picker).toMatch(/<(?:Overlay)?Modal[^>]*onRequestClose=\{onClose\}/);
  });
});
