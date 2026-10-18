// F-06: PressableScale, Button and IconButton (plan §3, §2.2, §2.9, §2.10).
// Render tests for the press states, disabled + onDisabledPress, accessibility props, the
// hitSlop touch minimum and the reduced-motion path, plus source checks on the adopted sites.
const fs = require('fs');
const path = require('path');
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const { Animated, Platform, StyleSheet } = require('react-native');

let mockReduced = false;
jest.mock('../../../utils/a11y', () => ({
  useReducedMotion: () => mockReduced,
  isReducedMotion: () => mockReduced,
  announce: jest.fn(),
}));
jest.mock('../../../services/feedback', () => ({
  __esModule: true,
  default: { play: jest.fn() },
  EVENTS: { refused: 'refused', selection: 'selection' },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: (props) => require('react').createElement('Ionicons', props) }));

const PressableScaleModule = require('../PressableScale');
const PressableScale = PressableScaleModule.default;
const { hitSlopFor, PRESS_SCALE } = PressableScaleModule;
const Button = require('../Button').default;
const IconButton = require('../IconButton').default;
const feedback = require('../../../services/feedback').default;
const { themes } = require('../../../theme/colors');
const { duration, spring } = require('../../../theme/motion');

global.IS_REACT_ACT_ENVIRONMENT = true;

const light = themes.light;
const dark = themes.dark;
const originalOS = Platform.OS;

// Run every Animated animation to completion synchronously, recording what was asked for.
let timings;
let springs;
beforeEach(() => {
  mockReduced = false;
  timings = [];
  springs = [];
  feedback.play.mockClear();
  jest.spyOn(Animated, 'timing').mockImplementation((value, config) => {
    timings.push({ value, config });
    return { start: (cb) => { value.setValue(config.toValue); cb?.({ finished: true }); }, stop: jest.fn() };
  });
  jest.spyOn(Animated, 'spring').mockImplementation((value, config) => {
    springs.push({ value, config });
    return { start: (cb) => { value.setValue(config.toValue); cb?.({ finished: true }); }, stop: jest.fn() };
  });
});
afterEach(() => {
  Platform.OS = originalOS;
  jest.restoreAllMocks();
});

function render(el) {
  let r;
  act(() => { r = TestRenderer.create(el); });
  return r;
}
// The outer pressable: the element that received our handlers.
const pressableOf = (r) => r.root.findAll(n => typeof n.props.onPressIn === 'function' && n.props.accessibilityRole)[0];
const flatStyle = (node) => StyleSheet.flatten(node.props.style) || {};
const scaleOf = (node) => (flatStyle(node).transform || []).find(t => t.scale)?.scale;
const overlayOf = (r) => r.root.findAll(n => n.props.testID === 'press-overlay')[0];
const pressIn = (r) => act(() => { pressableOf(r).props.onPressIn({}); });
const pressOut = (r) => act(() => { pressableOf(r).props.onPressOut({}); });
const press = (r) => act(() => { pressableOf(r).props.onPress({}); });

describe('PressableScale: press states', () => {
  it('scales to 0.97 over duration.press and shows the pressed overlay at once (iOS)', () => {
    Platform.OS = 'ios';
    const r = render(<PressableScale accessibilityLabel="Card" onPress={jest.fn()} style={{ borderRadius: 16 }} />);
    const node = pressableOf(r);
    expect(scaleOf(node).__getValue()).toBe(1);
    expect(overlayOf(r).props.style).toEqual(expect.arrayContaining([expect.objectContaining({ backgroundColor: light.pressedOverlay })]));

    pressIn(r);
    expect(scaleOf(pressableOf(r)).__getValue()).toBe(PRESS_SCALE);
    const scaleTiming = timings.find(t => t.config.toValue === PRESS_SCALE);
    expect(scaleTiming.config.duration).toBe(duration.press);
    // The overlay is set, not tweened, on press-in: visible on the next frame.
    expect(StyleSheet.flatten(overlayOf(r).props.style).opacity.__getValue()).toBe(1);
    // The overlay follows the control's radius.
    expect(StyleSheet.flatten(overlayOf(r).props.style).borderRadius).toBe(16);

    pressOut(r);
    expect(springs).toHaveLength(1);
    expect(springs[0].config).toMatchObject({ toValue: 1, ...spring.snappy });
    expect(scaleOf(pressableOf(r)).__getValue()).toBe(1);
    expect(StyleSheet.flatten(overlayOf(r).props.style).opacity.__getValue()).toBe(0);
  });

  it('merges pressedStyle only while held', () => {
    const r = render(<PressableScale accessibilityLabel="Go" onPress={jest.fn()} style={{ backgroundColor: 'a' }} pressedStyle={{ backgroundColor: 'b' }} />);
    expect(flatStyle(pressableOf(r)).backgroundColor).toBe('a');
    pressIn(r);
    expect(flatStyle(pressableOf(r)).backgroundColor).toBe('b');
    pressOut(r);
    expect(flatStyle(pressableOf(r)).backgroundColor).toBe('a');
  });

  it('uses a foreground ripple in theme.ripple on Android, and no overlay', () => {
    Platform.OS = 'android';
    const r = render(<PressableScale accessibilityLabel="Tab" onPress={jest.fn()} theme={dark} />);
    expect(pressableOf(r).props.android_ripple).toEqual({ color: dark.ripple, borderless: false, foreground: true });
    expect(overlayOf(r)).toBeUndefined();
  });

  it('runs onPress and onLongPress', () => {
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    const r = render(<PressableScale accessibilityLabel="Card" onPress={onPress} onLongPress={onLongPress} delayLongPress={350} />);
    press(r);
    act(() => { pressableOf(r).props.onLongPress({}); });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(pressableOf(r).props.delayLongPress).toBe(350);
  });
});

describe('PressableScale: cancelled press', () => {
  it('a press cancelled by a scroll or pager swipe (pressOut, no onPress) resets scale and overlay', () => {
    Platform.OS = 'ios';
    const onPress = jest.fn();
    const r = render(<PressableScale accessibilityLabel="Card" onPress={onPress} pressedStyle={{ backgroundColor: 'b' }} />);
    pressIn(r);
    expect(scaleOf(pressableOf(r)).__getValue()).toBe(PRESS_SCALE);
    // Pressability fires onPressOut on RESPONDER_TERMINATED without onPress.
    pressOut(r);
    expect(onPress).not.toHaveBeenCalled();
    expect(scaleOf(pressableOf(r)).__getValue()).toBe(1);
    expect(StyleSheet.flatten(overlayOf(r).props.style).opacity.__getValue()).toBe(0);
    expect(flatStyle(pressableOf(r)).backgroundColor).toBeUndefined();
  });

  it('uses the dark pressedOverlay on a dark theme', () => {
    Platform.OS = 'ios';
    const r = render(<PressableScale accessibilityLabel="Card" onPress={jest.fn()} theme={dark} />);
    expect(StyleSheet.flatten(overlayOf(r).props.style).backgroundColor).toBe(dark.pressedOverlay);
  });

  it('reads the theme from ThemeContext when no prop is passed', () => {
    Platform.OS = 'ios';
    const { ThemeContext } = require('../../../theme/ThemeContext');
    const r = render(
      <ThemeContext.Provider value={{ theme: dark, themeName: 'dark' }}>
        <PressableScale accessibilityLabel="Card" onPress={jest.fn()} />
      </ThemeContext.Provider>,
    );
    expect(StyleSheet.flatten(overlayOf(r).props.style).backgroundColor).toBe(dark.pressedOverlay);
  });

  it('clips a bounded Android ripple to a rounded outline', () => {
    Platform.OS = 'android';
    const r = render(<PressableScale accessibilityLabel="Go" onPress={jest.fn()} style={{ borderRadius: 8 }} />);
    expect(flatStyle(pressableOf(r)).overflow).toBe('hidden');
    const square = render(<PressableScale accessibilityLabel="Tab" onPress={jest.fn()} />);
    expect(flatStyle(pressableOf(square)).overflow).toBeUndefined();
  });

  it('runs onDisabledLongPress on a long press while disabled', () => {
    const onDisabledLongPress = jest.fn();
    const r = render(<PressableScale accessibilityLabel="Minus" disabled onLongPress={jest.fn()} onDisabledLongPress={onDisabledLongPress} />);
    act(() => { pressableOf(r).props.onLongPress({}); });
    expect(onDisabledLongPress).toHaveBeenCalledTimes(1);
  });
});

describe('PressableScale: reduced motion', () => {
  it('never scales; the overlay is the feedback (iOS)', () => {
    mockReduced = true;
    Platform.OS = 'ios';
    const r = render(<PressableScale accessibilityLabel="Card" onPress={jest.fn()} />);
    expect(scaleOf(pressableOf(r))).toBeUndefined();
    pressIn(r);
    expect(scaleOf(pressableOf(r))).toBeUndefined();
    expect(timings.some(t => t.config.toValue === PRESS_SCALE)).toBe(false);
    expect(StyleSheet.flatten(overlayOf(r).props.style).opacity.__getValue()).toBe(1);
    pressOut(r);
    expect(springs).toHaveLength(0);
    // The overlay fade is capped at duration.reduced.
    expect(timings.every(t => t.config.duration <= duration.reduced)).toBe(true);
  });

  it('adds the overlay on Android too, next to the ripple', () => {
    mockReduced = true;
    Platform.OS = 'android';
    const r = render(<PressableScale accessibilityLabel="Card" onPress={jest.fn()} />);
    expect(overlayOf(r)).toBeDefined();
    expect(pressableOf(r).props.android_ripple).toBeDefined();
    expect(scaleOf(pressableOf(r))).toBeUndefined();
  });
});

describe('disabled with onDisabledPress', () => {
  it('PressableScale: no onPress, no press visuals, calls onDisabledPress, stays focusable', () => {
    Platform.OS = 'android';
    const onPress = jest.fn();
    const onDisabledPress = jest.fn();
    const r = render(<PressableScale accessibilityLabel="Save" onPress={onPress} onLongPress={jest.fn()} disabled onDisabledPress={onDisabledPress} />);
    const node = pressableOf(r);
    expect(node.props.accessibilityState).toEqual({ disabled: true });
    // Not passed to Pressable as `disabled`, so the press still reaches onDisabledPress and the
    // control stays in the focus order.
    expect(node.props.disabled).toBeUndefined();
    expect(node.props.focusable).not.toBe(false);
    expect(node.props.onLongPress).toBeUndefined();
    expect(node.props.android_ripple).toBeUndefined();
    pressIn(r);
    expect(scaleOf(pressableOf(r)).__getValue()).toBe(1);
    press(r);
    expect(onPress).not.toHaveBeenCalled();
    expect(onDisabledPress).toHaveBeenCalledTimes(1);
  });

  it('Button: a disabled tap plays `refused` by default', () => {
    const onPress = jest.fn();
    const r = render(<Button label="Add Habit" onPress={onPress} disabled />);
    press(r);
    expect(onPress).not.toHaveBeenCalled();
    expect(feedback.play).toHaveBeenCalledWith('refused');
  });

  it('Button: onDisabledPress replaces the default refused', () => {
    const onDisabledPress = jest.fn();
    const r = render(<Button label="Add Habit" onPress={jest.fn()} disabled onDisabledPress={onDisabledPress} />);
    press(r);
    expect(onDisabledPress).toHaveBeenCalledTimes(1);
    expect(feedback.play).not.toHaveBeenCalled();
  });

  it('Button: disabled reads disabledContainer / onDisabled', () => {
    const r = render(<Button label="Add Habit" onPress={jest.fn()} disabled theme={light} />);
    expect(flatStyle(pressableOf(r)).backgroundColor).toBe(light.disabledContainer);
    const label = r.root.findAll(n => n.props.children === 'Add Habit' && n.props.style)[0];
    expect(StyleSheet.flatten(label.props.style).color).toBe(light.onDisabled);
  });

  it('IconButton: disabled is announced, still pressable for refused', () => {
    const onPress = jest.fn();
    const r = render(<IconButton icon="remove" accessibilityLabel="Remove one" onPress={onPress} disabled />);
    expect(pressableOf(r).props.accessibilityState).toEqual({ disabled: true });
    press(r);
    expect(onPress).not.toHaveBeenCalled();
    expect(feedback.play).toHaveBeenCalledWith('refused');
  });

  it('enabled presses stay silent (press has no haptic in §2.10)', () => {
    const r = render(<Button label="Save" onPress={jest.fn()} />);
    press(r);
    const i = render(<IconButton icon="close" accessibilityLabel="Close" onPress={jest.fn()} />);
    press(i);
    expect(feedback.play).not.toHaveBeenCalled();
  });
});

describe('Button variants', () => {
  it('primary: action fill with onAction label, actionPressed while held (dark: ink on #818CF8)', () => {
    const r = render(<Button label="Save" onPress={jest.fn()} theme={dark} />);
    expect(flatStyle(pressableOf(r)).backgroundColor).toBe(dark.action);
    const label = r.root.findAll(n => n.props.children === 'Save' && n.props.style)[0];
    expect(StyleSheet.flatten(label.props.style).color).toBe(dark.onAction);
    pressIn(r);
    expect(flatStyle(pressableOf(r)).backgroundColor).toBe(dark.actionPressed);
  });

  it('secondary: 1.5 px controlBorder outline, link label', () => {
    const r = render(<Button label="Later" variant="secondary" onPress={jest.fn()} theme={light} />);
    const s = flatStyle(pressableOf(r));
    expect(s.borderWidth).toBe(1.5);
    expect(s.borderColor).toBe(light.controlBorder);
  });

  it('destructive: dangerText, or dangerFill / onDanger when filled', () => {
    const t = render(<Button label="Delete" variant="destructive" onPress={jest.fn()} theme={light} />);
    expect(StyleSheet.flatten(t.root.findAll(n => n.props.children === 'Delete' && n.props.style)[0].props.style).color).toBe(light.dangerText);
    const f = render(<Button label="Delete" variant="destructive" filled onPress={jest.fn()} theme={light} />);
    expect(flatStyle(pressableOf(f)).backgroundColor).toBe(light.dangerFill);
  });

  it('loading: busy, presses ignored, label kept for width', () => {
    const onPress = jest.fn();
    const r = render(<Button label="Save" onPress={onPress} loading />);
    expect(pressableOf(r).props.accessibilityState).toEqual({ busy: true });
    press(r);
    expect(onPress).not.toHaveBeenCalled();
    expect(r.root.findAll(n => n.props.children === 'Save').length).toBeGreaterThan(0);
  });
});

describe('accessibility props', () => {
  it('Button: role button, name = label (or accessibilityLabel for icon-only)', () => {
    const r = render(<Button label="Save" onPress={jest.fn()} accessibilityHint="Saves" />);
    expect(pressableOf(r).props).toMatchObject({ accessibilityRole: 'button', accessibilityLabel: 'Save', accessibilityHint: 'Saves' });
    const icon = render(<Button icon="add" accessibilityLabel="Add your first habit" onPress={jest.fn()} />);
    expect(pressableOf(icon).props.accessibilityLabel).toBe('Add your first habit');
  });

  it('IconButton: role button and its label', () => {
    const r = render(<IconButton icon="close" accessibilityLabel="Close" onPress={jest.fn()} />);
    expect(pressableOf(r).props).toMatchObject({ accessibilityRole: 'button', accessibilityLabel: 'Close' });
  });

  it('PressableScale: defaults to role button and passes role/state through (tabs)', () => {
    const r = render(<PressableScale accessibilityLabel="Today" />);
    expect(pressableOf(r).props.accessibilityRole).toBe('button');
    const tab = render(<PressableScale accessibilityRole="tab" accessibilityState={{ selected: true }} accessibilityLabel="Today" />);
    expect(pressableOf(tab).props).toMatchObject({ accessibilityRole: 'tab', accessibilityState: { selected: true } });
  });
});

describe('hitSlop: the touch minimum', () => {
  it('hitSlopFor = max(0, (touchMin - visual) / 2) per axis', () => {
    expect(hitSlopFor(40, 40, 48)).toEqual({ top: 4, bottom: 4, left: 4, right: 4 });
    expect(hitSlopFor(40, 40, 44)).toEqual({ top: 2, bottom: 2, left: 2, right: 2 });
    expect(hitSlopFor(36, 36, 48)).toEqual({ top: 6, bottom: 6, left: 6, right: 6 });
    expect(hitSlopFor(60, 32, 48)).toEqual({ top: 8, bottom: 8, left: 0, right: 0 });
  });

  const effective = (node) => {
    const s = flatStyle(node);
    const h = node.props.hitSlop;
    return { w: s.width + h.left + h.right, h: s.height + h.top + h.bottom };
  };

  it('IconButton reaches 44 pt on iOS', () => {
    Platform.OS = 'ios';
    const IB = IconButton;
    const r = render(<IB icon="close" accessibilityLabel="Close" onPress={jest.fn()} />);
    expect(effective(pressableOf(r))).toEqual({ w: 44, h: 44 });
  });

  it('IconButton reaches 48 dp on Android, from the 40 default and the 36 counter size', () => {
    Platform.OS = 'android';
    const IB = IconButton;
    const r = render(<IB icon="close" accessibilityLabel="Close" onPress={jest.fn()} />);
    expect(effective(pressableOf(r))).toEqual({ w: 48, h: 48 });
    expect(pressableOf(r).props.android_ripple).toMatchObject({ borderless: true, radius: 24 });
    const c = render(<IB icon="add" size={36} accessibilityLabel="Add one" onPress={jest.fn()} />);
    expect(effective(pressableOf(c))).toEqual({ w: 48, h: 48 });
  });

  it('Button sm (40) gets vertical slop to the minimum; md is already 48', () => {
    Platform.OS = 'android';
    const B = Button;
    const sm = render(<B label="Edit" size="sm" onPress={jest.fn()} />);
    expect(flatStyle(pressableOf(sm)).minHeight).toBe(40);
    expect(pressableOf(sm).props.hitSlop).toEqual({ top: 4, bottom: 4 });
    const md = render(<B label="Save" onPress={jest.fn()} />);
    expect(flatStyle(pressableOf(md)).minHeight).toBe(48);
    expect(pressableOf(md).props.hitSlop).toBeUndefined();
  });
});

describe('source checks', () => {
  const root = path.join(__dirname, '..', '..', '..', '..');
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  const walk = (dir, out = []) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== '__tests__') walk(p, out); } else if (p.endsWith('.js')) out.push(p);
    });
    return out;
  };

  // Each `<IconButton ...>` opening tag (props may contain `>` inside braces, so balance them).
  function iconButtonTags(src) {
    const tags = [];
    let i = src.indexOf('<IconButton');
    while (i >= 0) {
      let depth = 0;
      let j = i + 1;
      for (; j < src.length; j += 1) {
        const c = src[j];
        if (c === '{') depth += 1;
        else if (c === '}') depth -= 1;
        else if (c === '>' && depth === 0) break;
      }
      tags.push(src.slice(i, j + 1));
      i = src.indexOf('<IconButton', j);
    }
    return tags;
  }

  it('every <IconButton in the app has an accessibilityLabel (BTN-1, acceptance d)', () => {
    const files = walk(path.join(root, 'src')).concat([path.join(root, 'App.js')]);
    const missing = [];
    let count = 0;
    files.forEach((f) => {
      iconButtonTags(fs.readFileSync(f, 'utf8')).forEach((tag) => {
        count += 1;
        if (!/accessibilityLabel=/.test(tag)) missing.push(`${path.relative(root, f)}: ${tag.slice(0, 80)}`);
      });
    });
    expect(count).toBeGreaterThanOrEqual(7);
    expect(missing).toEqual([]);
  });

  it('the check catches an unlabelled IconButton', () => {
    const tags = iconButtonTags('<IconButton icon="close" onPress={() => { if (a > b) go(); }} />');
    expect(tags).toHaveLength(1);
    expect(/accessibilityLabel=/.test(tags[0])).toBe(false);
  });

  it('the F-06 call sites use the shared pressables', () => {
    const card = read('src/components/HabitCard.js');
    expect(card).not.toMatch(/TouchableOpacity/);
    expect(card).toMatch(/<PressableScale\b/);
    expect(iconButtonTags(card)).toHaveLength(4); // ⋯ (C-03), timer, −, +
    expect(fs.existsSync(path.join(root, 'src/components/SheetHeader.js'))).toBe(false); // F-10: deleted
    expect(read('src/components/UndoToast.js')).not.toMatch(/TouchableOpacity/);
    const app = read('App.js');
    expect(app).toMatch(/<PressableScale[\s\S]{0,400}accessibilityRole="tab"/);
    const habits = read('src/screens/HabitsScreen.js');
    const row = habits.slice(habits.indexOf('function HabitRow('), habits.indexOf('function ArchivedRow('));
    expect(iconButtonTags(row)).toHaveLength(3); // bell, edit, archive
    expect(habits).toMatch(/<Button\b[\s\S]{0,200}onPress=\{onSave\}[\s\S]{0,80}disabled=\{!form\.name\.trim\(\)\}/);
    const today = read('src/screens/TodayScreen.js');
    expect(today).toMatch(/<Button\b[\s\S]{0,120}icon="add"/);
    expect(today).toMatch(/<PressableScale\b\s+onPress=\{handleMarkRest\}/);
    const progress = read('src/screens/ProgressScreen.js');
    // F-07: the period pills became SegmentedControls (40 dp, slop to the touch minimum).
    expect((progress.match(/<SegmentedControl\b/g) || []).length).toBe(2);
  });

  it('no ui pressable imports expo-haptics (feedback.play only)', () => {
    ['PressableScale', 'Button', 'IconButton'].forEach((n) => {
      expect(read(`src/components/ui/${n}.js`)).not.toMatch(/expo-haptics/);
    });
  });
});

describe('IconButton disabled variant (C-02a)', () => {
  it('drops a caller fill and turns an outline into the disabledContainer hairline', () => {
    const r = render(<IconButton icon="remove" accessibilityLabel="Remove one" theme={light} disabled
      style={{ borderWidth: 1.5, borderColor: light.controlBorder, backgroundColor: light.action }} />);
    const s = flatStyle(pressableOf(r));
    expect(s.backgroundColor).toBe('transparent');
    expect(s.borderColor).toBe(light.disabledContainer);
    expect(s.borderWidth).toBe(1.5);
    expect(r.root.findAll(n => n.type === 'Ionicons')[0].props.color).toBe(light.textTertiary);
  });

  it('enabled keeps the caller style', () => {
    const r = render(<IconButton icon="add" accessibilityLabel="Add one" theme={dark}
      style={{ borderWidth: 1.5, borderColor: dark.controlBorder }} />);
    expect(flatStyle(pressableOf(r)).borderColor).toBe(dark.controlBorder);
  });
});

describe('Android borderless ripple and a theme switch (C-02a S1)', () => {
  // A child that counts its mounts: a remount of the Pressable remounts it too.
  let mounts = 0;
  function Probe() { React.useEffect(() => { mounts += 1; }, []); return null; }
  const el = (theme) => (
    <IconButton icon="add" accessibilityLabel="Add one" theme={theme}
      style={{ borderWidth: 1.5, backgroundColor: theme.action }}><Probe /></IconButton>
  );

  it('remounts on Android when the ripple colour changes, so the new fill and border apply', () => {
    Platform.OS = 'android';
    mounts = 0;
    const r = render(el(light));
    expect(mounts).toBe(1);
    act(() => { r.update(el(light)); });
    expect(mounts).toBe(1); // same theme: no remount
    act(() => { r.update(el(dark)); });
    expect(mounts).toBe(2);
    expect(flatStyle(pressableOf(r)).backgroundColor).toBe(dark.action);
  });

  it('never remounts on iOS (the colours apply in place there)', () => {
    Platform.OS = 'ios';
    mounts = 0;
    const r = render(el(light));
    act(() => { r.update(el(dark)); });
    expect(mounts).toBe(1);
  });
});

describe('PressableScale: stateChange (C-07, C-06b carry S2)', () => {
  afterEach(() => { Platform.OS = originalOS; mockReduced = false; });
  it('Android: no ripple and no overlay in full motion; the scale stays', () => {
    Platform.OS = 'android';
    const r = render(<PressableScale accessibilityLabel="Card" onPress={jest.fn()} stateChange />);
    expect(pressableOf(r).props.android_ripple).toBeUndefined();
    expect(overlayOf(r)).toBeUndefined();
    pressIn(r);
    expect(scaleOf(pressableOf(r)).__getValue()).toBe(PRESS_SCALE);
  });
  it('iOS: no overlay in full motion', () => {
    Platform.OS = 'ios';
    const r = render(<PressableScale accessibilityLabel="Card" onPress={jest.fn()} stateChange />);
    expect(overlayOf(r)).toBeUndefined();
  });
  it('reduced motion: the overlay is the press feedback, still no ripple', () => {
    Platform.OS = 'android';
    mockReduced = true;
    const r = render(<PressableScale accessibilityLabel="Card" onPress={jest.fn()} stateChange />);
    expect(pressableOf(r).props.android_ripple).toBeUndefined();
    expect(overlayOf(r)).toBeDefined();
  });
});
