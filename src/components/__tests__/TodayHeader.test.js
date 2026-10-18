// C-04: the Today header (brand strip, ring states, greeting wrap rule, beat row, sticky bar).
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

jest.mock('@expo/vector-icons', () => ({ Ionicons: (props) => require('react').createElement('Ionicons', props) }));
jest.mock('react-native-svg', () => {
  const R = require('react');
  const C = (name) => (props) => R.createElement(name, props, props.children);
  return { __esModule: true, default: C('Svg'), Circle: C('Circle') };
});

const TodayHeader = require('../TodayHeader').default;
const { TodayStickyBar, dayLine } = require('../TodayHeader');
const { themes } = require('../../theme/colors');
const { size } = require('../../theme/tokens');

global.IS_REACT_ACT_ENVIRONMENT = true;

const theme = themes.light;
const dark = themes.dark;
const beats = [
  { key: '2026-10-12', status: 'done', today: false },
  { key: '2026-10-13', status: 'rest', today: false },
  { key: '2026-10-14', status: 'missed', today: false },
  { key: '2026-10-15', status: 'open', today: true },
];
const onStripLayout = jest.fn();
const base = { onStripLayout, theme, isDark: false, date: 'Thursday, October 15', greeting: 'Good evening', name: 'Claude', state: 'progress', completed: 2, total: 4, streak: 11, beats, compact: false };

function render(props) {
  let r;
  act(() => { r = TestRenderer.create(<TodayHeader {...base} {...props} />); });
  return r;
}
const texts = (r) => r.root.findAll(n => typeof n.type === 'string' && n.type === 'Text').map(n => [].concat(n.props.children).join(''));
const ring = (r) => r.root.findAll(n => n.props && n.props.strokeDasharray !== undefined && n.type === 'Circle');
const circles = (r) => r.root.findAll(n => n.type === 'Circle');
const svg = (r) => r.root.findAll(n => n.type === 'Svg')[0].props;

describe('dayLine', () => {
  it('reads progress, day complete with the streak, and rest days that hold the streak', () => {
    expect(dayLine({ state: 'progress', completed: 2, total: 4, streak: 11 })).toBe('2 of 4 done · 2 to go');
    expect(dayLine({ state: 'complete', completed: 4, total: 4, streak: 12 })).toBe('Day complete · 12-day streak');
    expect(dayLine({ state: 'complete', completed: 4, total: 4, streak: 0 })).toBe('Day complete');
    expect(dayLine({ state: 'rest', completed: 0, total: 0, streak: 12 })).toBe('Rest day · 12-day streak holds');
    expect(dayLine({ state: 'rest', completed: 0, total: 0, streak: 0 })).toBe('Rest day');
    // Nothing done yet: the first-run nudge (plan §1.2 8b).
    expect(dayLine({ state: 'progress', completed: 0, total: 4, streak: 0 })).toBe('Tap a habit to start your day');
  });
});

describe('TodayHeader strip', () => {
  it('shows the date, the greeting with the name on one line, the count and the day line', () => {
    const r = render();
    const all = texts(r);
    expect(all).toContain('Thursday, October 15');
    expect(all).toContain('Good evening, Claude');
    expect(all).toContain('2/4');
    expect(all).toContain('habits');
    expect(all).toContain('2 of 4 done · 2 to go');
  });

  it('uses the 88 pt ring, and the 76 pt ring with no caption when compact', () => {
    expect(svg(render()).width).toBe(size.ringToday);
    const c = render({ compact: true });
    expect(svg(c).width).toBe(size.ringTodayCompact);
    expect(texts(c)).not.toContain('habits');
    // The spoken label keeps "habits".
    const label = c.root.findAll(n => n.props && n.props.accessibilityRole === 'progressbar')[0].props.accessibilityLabel;
    expect(label).toBe('2 of 4 habits done today');
  });

  it('progress: green arc on the solid indigo track', () => {
    const cs = circles(render());
    expect(cs[0].props.stroke).toBe(theme.brandTrack);
    expect(cs[0].props.strokeDasharray).toBeUndefined();
    expect(cs[1].props.stroke).toBe(theme.success);
  });

  it('empty (0 done): a dashed brandInk track and no arc', () => {
    const cs = circles(render({ completed: 0 }));
    expect(cs).toHaveLength(1);
    expect(cs[0].props.stroke).toBe(theme.brandInk);
    expect(cs[0].props.strokeDasharray).toBe('5 5');
  });

  it('complete: a full gold arc with a check and "4 of 4"', () => {
    const r = render({ state: 'complete', completed: 4, total: 4, streak: 12 });
    const cs = circles(r);
    expect(cs[1].props.stroke).toBe(theme.signature);
    expect(cs[1].props.strokeDashoffset).toBeCloseTo(0);
    expect(r.root.findAll(n => n.type === 'Ionicons' && n.props.name === 'checkmark')).toHaveLength(1);
    expect(texts(r)).toEqual(expect.arrayContaining(['4 of 4', 'Day complete · 12-day streak']));
  });

  it('rest day: a dashed ring with a moon and "rest"', () => {
    const r = render({ state: 'rest', completed: 0, total: 0, streak: 12 });
    expect(circles(r)[0].props.strokeDasharray).toBe('5 5');
    expect(r.root.findAll(n => n.type === 'Ionicons' && n.props.name === 'moon-outline')).toHaveLength(1);
    expect(texts(r)).toEqual(expect.arrayContaining(['rest', 'Rest day · 12-day streak holds']));
  });

  it('no strip before the first habit', () => {
    const r = render({ state: null });
    expect(r.root.findAll(n => n.type === 'Svg')).toHaveLength(0);
  });

  it('the strip is brandSurface in both themes, with the level-1 shadow in light only', () => {
    const strip = (r) => r.root.findAll(n => n.props && n.props.onLayout === onStripLayout)[0];
    const flat = (r) => Object.assign({}, ...[].concat(strip(r).props.style).filter(Boolean));
    expect(flat(render()).backgroundColor).toBe('#E0E7FF');
    expect(flat(render()).shadowOpacity).toBe(0.06);
    const d = flat(render({ theme: dark, isDark: true }));
    expect(d.backgroundColor).toBe('#1E1B4B');
    expect(d.shadowOpacity).toBeUndefined();
  });

  it('beat row: one mark per day with a spoken summary; outlines use beatOutline', () => {
    const r = render();
    const row = r.root.findAll(n => n.props && typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Last '))[0];
    expect(row.props.accessibilityLabel).toBe('Last 4 days: 1 complete, 1 rest, 1 missed');
    const one = render({ beats: [{ key: '2026-10-15', status: 'open', today: true }] });
    expect(one.root.findAll(n => n.props && typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Last '))[0].props.accessibilityLabel).toBe('Last 1 day: 0 complete, 0 rest, 0 missed');
    const outlined = r.root.findAll(n => n.type === 'View' && [].concat(n.props.style).some(s => s && s.borderColor === theme.beatOutline));
    expect(outlined.length).toBe(3); // rest, missed, open today
  });

  it('streak chip: flame plus the count, read as "11-day streak"; hidden at 0', () => {
    const r = render();
    expect(r.root.findAll(n => n.type === 'Ionicons' && n.props.name === 'flame')).toHaveLength(1);
    expect(r.root.findAll(n => n.props && n.props.accessibilityLabel === '11-day streak').length).toBeGreaterThan(0);
    expect(render({ streak: 0 }).root.findAll(n => n.type === 'Ionicons' && n.props.name === 'flame')).toHaveLength(0);
  });
});

describe('greeting wrap rule', () => {
  const layout = (node, height) => act(() => { node.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 300, height } } }); });
  const measurers = (r) => r.root.findAll(n => n.type === 'Text' && typeof n.props.onLayout === 'function');

  it('keeps greeting and name on one line when they fit', () => {
    const r = render({ name: 'Max' });
    const [full, one] = measurers(r);
    layout(full, 32); layout(one, 32);
    expect(texts(r)).toContain('Good evening, Max');
  });

  it('moves the name to its own line, one line with tail truncation, when it would wrap', () => {
    const r = render({ name: 'Maximilian Mustermann-Schmidt' });
    const [full, one] = measurers(r);
    layout(full, 64); layout(one, 32);
    const visible = r.root.findAll(n => n.type === 'Text' && typeof n.props.onLayout !== 'function');
    const nameText = visible.find(n => [].concat(n.props.children).join('') === 'Maximilian Mustermann-Schmidt');
    expect(nameText.props.numberOfLines).toBe(1);
    expect(nameText.props.ellipsizeMode).toBe('tail');
    expect(texts(r)).toContain('Good evening,');
    // One element for screen readers, with the full greeting.
    expect(r.root.findAll(n => n.props && n.props.accessibilityLabel === 'Good evening, Maximilian Mustermann-Schmidt' && n.props.accessibilityRole === 'header').length).toBeGreaterThan(0);
  });

  it('with no name there is nothing to measure', () => {
    const r = render({ name: null });
    expect(measurers(r)).toHaveLength(0);
    expect(texts(r)).toContain('Good evening');
  });
});

describe('TodayStickyBar', () => {
  it('shows the small ring, the count, the greeting and the streak, and scrolls to top on press', () => {
    const onPress = jest.fn();
    let r;
    act(() => { r = TestRenderer.create(<TodayStickyBar theme={theme} state="progress" completed={2} total={4} greeting="Good evening" streak={11} onPress={onPress} a11yLabel="2 of 4 habits done today" />); });
    expect(r.root.findAll(n => n.type === 'Svg')[0].props.width).toBe(size.ringCollapsed);
    expect(texts(r)).toEqual(expect.arrayContaining(['2/4', 'Good evening', '11']));
    // The 28 pt ring draws no count of its own (the count sits beside it).
    expect(texts(r).filter(x => x === '2/4')).toHaveLength(1);
    const button = r.root.findAll(n => n.props && n.props.accessibilityRole === 'button')[0];
    expect(button.props.accessibilityHint).toBe('Scrolls back to the top');
    act(() => { button.props.onPress(); });
    expect(onPress).toHaveBeenCalled();
  });

  it('renders nothing without a strip state', () => {
    let r;
    act(() => { r = TestRenderer.create(<TodayStickyBar theme={theme} state={null} />); });
    expect(r.toJSON()).toBeNull();
  });
});
