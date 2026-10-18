// F-07: Chip, SegmentedControl, TextField and SectionLabel (plan §3, PRS-6, TYP-4).
// Render tests for selection states and their accessibility, the 150 ms fill, the 40 dp
// height with slop to the touch minimum, disabled taps, the TextField label / hint / error /
// counter wiring, plus the source check that no `textTransform: 'uppercase'` is left.
const fs = require('fs');
const path = require('path');
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const { Animated, Platform, StyleSheet } = require('react-native');

jest.mock('../../../utils/a11y', () => ({
  useReducedMotion: () => false,
  isReducedMotion: () => false,
  announce: jest.fn(),
}));
jest.mock('../../../services/feedback', () => ({
  __esModule: true,
  default: { play: jest.fn() },
  EVENTS: { refused: 'refused', selection: 'selection' },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: (props) => require('react').createElement('Ionicons', props) }));

const Chip = require('../Chip').default;
const SegmentedControl = require('../SegmentedControl').default;
const TextField = require('../TextField').default;
const { showCounter } = require('../TextField');
const SectionLabel = require('../SectionLabel').default;
const feedback = require('../../../services/feedback').default;
const { announce } = require('../../../utils/a11y');
const { themes } = require('../../../theme/colors');
const { duration } = require('../../../theme/motion');

global.IS_REACT_ACT_ENVIRONMENT = true;
const light = themes.light;
const originalOS = Platform.OS;

let timings;
beforeEach(() => {
  timings = [];
  feedback.play.mockClear();
  announce.mockClear();
  jest.spyOn(Animated, 'timing').mockImplementation((value, config) => {
    timings.push({ value, config });
    return { start: (cb) => { value.setValue(config.toValue); cb?.({ finished: true }); }, stop: jest.fn() };
  });
  jest.spyOn(Animated, 'spring').mockImplementation((value, config) => ({
    start: (cb) => { value.setValue(config.toValue); cb?.({ finished: true }); }, stop: jest.fn(),
  }));
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
const pressables = (r) => r.root.findAll(n => typeof n.props.onPressIn === 'function' && n.props.accessibilityRole && typeof n.type !== 'string');
const outer = (r) => pressables(r)[0];
const flat = (node) => StyleSheet.flatten(node.props.style) || {};
const tap = (node) => act(() => { node.props.onPress({}); });

describe('Chip', () => {
  it('announces selected, and a multi chip is a checkbox with checked and a ✓', () => {
    const r = render(<Chip label="Morning" selected theme={light} />);
    expect(outer(r).props.accessibilityRole).toBe('button');
    expect(outer(r).props.accessibilityState).toEqual({ selected: true });
    expect(r.root.findAll(n => n.props.testID === 'chip-check')).toHaveLength(0);

    const m = render(<Chip label="Mo" multi selected theme={light} />);
    expect(outer(m).props.accessibilityRole).toBe('checkbox');
    expect(outer(m).props.accessibilityState).toEqual({ checked: true, selected: true });
    expect(m.root.findAll(n => n.props.testID === 'chip-check').length).toBeGreaterThan(0);

    const n = render(<Chip label="Mo" multi showCheck={false} selected theme={light} />);
    expect(n.root.findAll(x => x.props.testID === 'chip-check')).toHaveLength(0);
  });

  it('plays selection and calls onPress', () => {
    const onPress = jest.fn();
    const r = render(<Chip label="Evening" onPress={onPress} theme={light} />);
    tap(outer(r));
    expect(feedback.play).toHaveBeenCalledWith('selection');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('fades its fill in over 150 ms when it becomes selected (PRS-6)', () => {
    const r = render(<Chip label="Anytime" selected={false} theme={light} />);
    expect(timings).toHaveLength(0); // the first render does not animate
    act(() => { r.update(<Chip label="Anytime" selected theme={light} />); });
    const fills = timings.filter(x => x.config.toValue === 1);
    expect(fills.length).toBe(2); // the fill layer and the border/label colours
    fills.forEach(x => expect(x.config.duration).toBe(150));
    expect(duration.selection).toBe(150);
    const fill = r.root.findAll(n => n.props.testID === 'selection-fill' && typeof n.type !== 'string')[0];
    expect(flat(fill).backgroundColor).toBe(light.selection);
  });

  it('is 40 tall with slop to 48 dp on Android and 44 pt on iOS', () => {
    Platform.OS = 'android';
    let r = render(<Chip label="Daily" theme={light} />);
    expect(flat(outer(r)).minHeight).toBe(40);
    expect(outer(r).props.hitSlop).toEqual({ top: 4, bottom: 4 });
    Platform.OS = 'ios';
    r = render(<Chip label="Daily" theme={light} />);
    expect(outer(r).props.hitSlop).toEqual({ top: 2, bottom: 2 });
  });

  it('disabled: no onPress, refused by default, disabledContainer fill', () => {
    const onPress = jest.fn();
    const r = render(<Chip label="Timed" disabled onPress={onPress} theme={light} />);
    tap(outer(r));
    expect(onPress).not.toHaveBeenCalled();
    expect(feedback.play).toHaveBeenCalledWith('refused');
    expect(outer(r).props.accessibilityState.disabled).toBe(true);
    const fill = r.root.findAll(n => n.props.testID === 'selection-fill' && typeof n.type !== 'string')[0];
    expect(flat(fill).backgroundColor).toBe(light.disabledContainer);
  });
});

describe('SegmentedControl', () => {
  // One node per option: the outermost composite carrying the option's testID.
  const pressables = (r) => ['a', 'b', 'c'].map(v => r.root.findAll(n => n.props.testID === `seg-${v}` && typeof n.props.onPressIn === 'function' && typeof n.type !== 'string')[0]);
  const OPTIONS = [{ value: 'a', label: '7d' }, { value: 'b', label: '30d' }, { value: 'c', label: '90d', disabled: true }];

  it('is a radiogroup of radios with checked, or a tablist of tabs with selected', () => {
    const r = render(<SegmentedControl testID="seg" options={OPTIONS} value="b" theme={light} accessibilityLabel="History" />);
    const group = r.root.findAll(n => n.props.accessibilityRole === 'radiogroup')[0];
    expect(group.props.accessibilityLabel).toBe('History');
    const segs = pressables(r);
    expect(segs.map(s => s.props.accessibilityRole)).toEqual(['radio', 'radio', 'radio']);
    expect(segs[1].props.accessibilityState).toEqual({ checked: true, selected: true });
    expect(segs[0].props.accessibilityState).toEqual({ checked: false, selected: false });
    expect(segs[2].props.accessibilityState.disabled).toBe(true);

    const tabs = render(<SegmentedControl testID="seg" role="tab" options={OPTIONS} value="a" theme={light} />);
    expect(tabs.root.findAll(n => n.props.accessibilityRole === 'tablist' && typeof n.type === 'string')).toHaveLength(1);
    expect(pressables(tabs)[0].props.accessibilityState).toEqual({ selected: true });
  });

  it('changes on another option with the selection haptic, ignores the current one', () => {
    const onChange = jest.fn();
    const r = render(<SegmentedControl testID="seg" options={OPTIONS} value="a" onChange={onChange} theme={light} />);
    tap(pressables(r)[0]);
    expect(onChange).not.toHaveBeenCalled();
    expect(feedback.play).not.toHaveBeenCalled();
    tap(pressables(r)[1]);
    expect(onChange).toHaveBeenCalledWith('b');
    expect(feedback.play).toHaveBeenCalledWith('selection');
  });

  it('a disabled option calls onDisabledPress (or plays refused), never onChange', () => {
    const onChange = jest.fn();
    const onDisabledPress = jest.fn();
    let r = render(<SegmentedControl testID="seg" options={OPTIONS} value="a" onChange={onChange} onDisabledPress={onDisabledPress} theme={light} />);
    tap(pressables(r)[2]);
    expect(onDisabledPress).toHaveBeenCalledWith('c');
    expect(onChange).not.toHaveBeenCalled();
    r = render(<SegmentedControl testID="seg" options={OPTIONS} value="a" onChange={onChange} theme={light} />);
    tap(pressables(r)[2]);
    expect(feedback.play).toHaveBeenCalledWith('refused');
  });

  it('each option is at least 40 dp tall with slop to 48 on Android (acceptance c)', () => {
    Platform.OS = 'android';
    const r = render(<SegmentedControl testID="seg" options={OPTIONS} value="a" theme={light} />);
    const seg = pressables(r)[0];
    expect(flat(seg).minHeight).toBeGreaterThanOrEqual(40);
    expect(flat(seg).minHeight + seg.props.hitSlop.top + seg.props.hitSlop.bottom).toBe(48);
  });

  it('wraps its options when they do not fit (LAY-6)', () => {
    const r = render(<SegmentedControl testID="seg" options={OPTIONS} value="a" theme={light} />);
    const group = r.root.findAll(n => n.props.accessibilityRole === 'radiogroup' && typeof n.type === 'string')[0];
    expect(flat(group).flexWrap).toBe('wrap');
  });
});

describe('TextField', () => {
  const input = (r) => r.root.findByType(require('react-native').TextInput);

  it('uses the label as the accessible name and the hint as the hint', () => {
    const r = render(<TextField label="Name" hint="Keep it short" value="" onChangeText={() => {}} theme={light} />);
    expect(input(r).props.accessibilityLabel).toBe('Name');
    expect(input(r).props.accessibilityHint).toBe('Keep it short');
  });

  it('shows an error in dangerText, reads it as the hint and announces it once', () => {
    const r = render(<TextField label="Email" value="x" onChangeText={() => {}} theme={light} error="Enter your email address." />);
    expect(input(r).props.accessibilityHint).toBe('Enter your email address.');
    expect(announce).toHaveBeenCalledTimes(1);
    act(() => { r.update(<TextField label="Email" value="xy" onChangeText={() => {}} theme={light} error="Enter your email address." />); });
    expect(announce).toHaveBeenCalledTimes(1);
    const field = r.root.findAll(n => typeof n.type === 'string' && flat(n).borderWidth === 2)[0];
    expect(flat(field).borderColor).toBe(light.dangerText);
  });

  it('draws a 2 px selectionBorder while focused', () => {
    const r = render(<TextField label="Name" value="" onChangeText={() => {}} theme={light} />);
    act(() => { input(r).props.onFocus({}); });
    const field = r.root.findAll(n => typeof n.type === 'string' && flat(n).borderWidth === 2)[0];
    expect(flat(field).borderColor).toBe(light.selectionBorder);
  });

  it('shows the counter from 80 % of maxLength', () => {
    expect(showCounter(31, 40)).toBe(false);
    expect(showCounter(32, 40)).toBe(true);
    expect(showCounter(5, undefined)).toBe(false);
    const r = render(<TextField label="Name" value={'a'.repeat(32)} maxLength={40} onChangeText={() => {}} theme={light} />);
    expect(r.root.findAll(n => n.props.children === '32/40').length).toBeGreaterThan(0);
  });
});

describe('SectionLabel', () => {
  it('is a header by default, plain text for a form group label', () => {
    let r = render(<SectionLabel label="Past challenges" theme={light} />);
    expect(r.root.findAll(n => n.props.accessibilityRole === 'header')).not.toHaveLength(0);
    r = render(<SectionLabel label="Type" theme={light} header={false} />);
    expect(r.root.findAll(n => n.props.accessibilityRole === 'header')).toHaveLength(0);
  });
});

describe('the uppercase sweep (TYP-4, acceptance a)', () => {
  const SRC = path.resolve(__dirname, '../../..');
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== '__tests__') walk(p); } else if (/\.(js|jsx|ts|tsx)$/.test(e.name)) files.push(p);
    }
  })(SRC);

  it('no file in src/ sets textTransform: uppercase', () => {
    const offenders = files.filter(f => /textTransform\s*:\s*['"]uppercase['"]/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders.map(f => path.relative(SRC, f))).toEqual([]);
  });

  it('no en section label is written in capitals', () => {
    const en = require('../../../i18n/locales/en.json');
    const caps = [];
    (function walk(o, k) {
      for (const [key, v] of Object.entries(o)) {
        const kk = k ? `${k}.${key}` : key;
        if (v && typeof v === 'object') walk(v, kk);
        else if (typeof v === 'string' && /^[^a-z]*[A-Z]{4,}[^a-z]*$/.test(v) && !/^(GROOV|AM\/PM)/.test(v)) caps.push(kk);
      }
    })(en, '');
    expect(caps).toEqual([]);
  });
});
