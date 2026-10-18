// F-05: motion tokens (§2.9), reduced motion (§4.3) and the literal ratchet that keeps
// durations and springs in src/theme/motion.js.
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const fs = require('fs');
const path = require('path');
const { Animated } = require('react-native');
const { sourceFiles, stripComments } = require('./ratchet');

global.IS_REACT_ACT_ENVIRONMENT = true;

const ROOT = path.resolve(__dirname, '../../..');

// AccessibilityInfo stand-in: the initial read resolves to `initialReduced`; the
// `reduceMotionChanged` handler is captured so a test can flip the OS setting.
let initialReduced = false;
let osHandler = null;
const remove = jest.fn();
beforeEach(() => {
  initialReduced = false;
  osHandler = null;
  remove.mockClear();
});
afterEach(() => { jest.restoreAllMocks(); });

// Fresh shared store, with the OS stubbed (one module registry, so Animated and React match).
function load() {
  const rn = require('react-native');
  const a11y = require('../../utils/a11y');
  a11y.__resetReducedMotionForTests();
  jest.spyOn(rn.AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => Promise.resolve(initialReduced));
  jest.spyOn(rn.AccessibilityInfo, 'addEventListener').mockImplementation((name, fn) => {
    if (name === 'reduceMotionChanged') osHandler = fn;
    return { remove };
  });
  // RN's jest setup already mocks these with jest.fn, which spyOn reuses: start the count over.
  rn.AccessibilityInfo.addEventListener.mockClear();
  return { motion: require('../motion'), a11y, rn };
}

describe('motion tokens match §2.9', () => {
  const { duration, beat, spring, easing } = require('../motion');

  it('durations', () => {
    expect(duration.press).toBe(100);
    expect(duration.state).toBe(200);
    expect(duration.value).toBe(300);
    expect(duration.enter).toBe(450);
    expect(duration.reduced).toBe(150);
    // Exits are ~30 % shorter: sheet exit 315, snackbar out 210.
    expect(duration.exit(duration.enter)).toBe(315);
    expect(duration.exit(duration.value)).toBe(210);
  });

  it('beats sit on the 120 bpm grid', () => {
    expect(beat.b16).toBe(125);
    expect(beat.b8).toBe(250);
    expect(beat.bDot8).toBe(375);
    expect(beat.b4).toBe(500);
    expect(beat.b4b8).toBe(beat.b4 + beat.b8);
    expect(beat.b4b8).toBe(750);
    expect(beat.b4b8b16).toBe(875);
    expect(beat.b32).toBe(62);
    // Every start offset except the motif spacing is a whole number of sixteenths.
    for (const [k, v] of Object.entries(beat)) {
      if (k === 'b32') continue;
      expect([k, v % 125]).toEqual([k, 0]);
    }
  });

  it('springs and their damping ratios', () => {
    expect(spring.snappy).toEqual({ stiffness: 400, damping: 32, mass: 1 });
    expect(spring.gentle).toEqual({ stiffness: 220, damping: 27, mass: 1 });
    expect(spring.celebrate).toEqual({ stiffness: 180, damping: 16, mass: 1 });
    const zeta = ({ stiffness, damping, mass }) => damping / (2 * Math.sqrt(stiffness * mass));
    expect(zeta(spring.snappy)).toBeCloseTo(0.8, 1);
    expect(zeta(spring.gentle)).toBeCloseTo(0.91, 2);
    expect(zeta(spring.celebrate)).toBeCloseTo(0.6, 1);
  });

  it('easing curves are functions with the right shape', () => {
    for (const fn of Object.values(easing)) {
      expect(typeof fn).toBe('function');
      expect(fn(0)).toBeCloseTo(0, 5);
      expect(fn(1)).toBeCloseTo(1, 5);
    }
    // Decelerating curves are past halfway at the midpoint; the accelerating one is not.
    expect(easing.standard(0.5)).toBeGreaterThan(0.5);
    expect(easing.emphasizedDecel(0.5)).toBeGreaterThan(0.5);
    expect(easing.emphasizedAccel(0.5)).toBeLessThan(0.5);
  });
});

describe('reduced motion (§4.3)', () => {
  it('reduced(spring.gentle) returns a 150 ms timing config', () => {
    const { reduced, spring, easing } = require('../motion');
    expect(reduced(spring.gentle)).toEqual({ duration: 150, easing: easing.standard });
  });

  it('timing() caps durations at 150 ms with the standard curve; full motion keeps the token', () => {
    const { timing, duration, easing } = require('../motion');
    const spy = jest.spyOn(Animated, 'timing');
    const v = new Animated.Value(0);
    timing(v, { toValue: 1, duration: duration.value, easing: easing.emphasizedDecel, delay: 125 }, true);
    expect(spy.mock.calls[0][1]).toMatchObject({ toValue: 1, duration: 150, easing: easing.standard, delay: 125, useNativeDriver: true });
    timing(v, { toValue: 1, duration: duration.press }, true);
    expect(spy.mock.calls[1][1].duration).toBe(100); // already shorter than 150
    timing(v, { toValue: 1, duration: duration.value, easing: easing.emphasizedDecel }, false);
    expect(spy.mock.calls[2][1]).toMatchObject({ duration: 300, easing: easing.emphasizedDecel });
    spy.mockRestore();
  });

  it('springTo() becomes a 150 ms timing when reduced, a token spring otherwise', () => {
    const { springTo, spring } = require('../motion');
    const t = jest.spyOn(Animated, 'timing');
    const s = jest.spyOn(Animated, 'spring');
    const v = new Animated.Value(0);
    springTo(v, spring.gentle, { toValue: 0 }, true);
    expect(s).not.toHaveBeenCalled();
    expect(t.mock.calls[0][1]).toMatchObject({ toValue: 0, duration: 150 });
    springTo(v, spring.snappy, { toValue: 0 }, false);
    expect(s.mock.calls[0][1]).toMatchObject({ toValue: 0, stiffness: 400, damping: 32, mass: 1 });
    expect(s.mock.calls[0][1].tension).toBeUndefined();
    t.mockRestore(); s.mockRestore();
  });

  it('sheets slide in full motion and fade (no translate) when reduced', () => {
    const { sheetMotionStyle, sheetOut, duration, SHEET_FADE_RANGE } = require('../motion');
    const v = new Animated.Value(0);
    expect(sheetMotionStyle(v, false)).toEqual({ transform: [{ translateY: v }] });
    const r = sheetMotionStyle(v, true);
    expect(r.transform).toBeUndefined();
    expect(typeof r.opacity.interpolate).toBe('function');
    // A drag to the 80 dp dismiss threshold visibly fades the sheet (M1).
    v.setValue(80);
    expect(r.opacity.__getValue()).toBeCloseTo(1 - 80 / SHEET_FADE_RANGE, 3);
    expect(r.opacity.__getValue()).toBeLessThan(0.7);
    v.setValue(SHEET_FADE_RANGE * 3);
    expect(r.opacity.__getValue()).toBe(0);
    v.setValue(0);
    const t = jest.spyOn(Animated, 'timing');
    sheetOut(v, 800, false);
    expect(t.mock.calls[0][1]).toMatchObject({ toValue: 800, duration: duration.exit(duration.enter) });
    // Reduced: closes to the fade range (opacity 0) in 150 ms, not to the screen edge.
    sheetOut(v, 800, true);
    expect(t.mock.calls[1][1]).toMatchObject({ toValue: SHEET_FADE_RANGE, duration: 150 });
    t.mockRestore();
  });
});

describe('useMotion() follows the OS setting', () => {
  function Probe({ out }) {
    const { useMotion } = require('../motion');
    out.current = useMotion();
    return null;
  }

  it('starts from the OS value and updates on reduceMotionChanged', async () => {
    initialReduced = false;
    const { a11y } = load();
    const out = { current: null };
    await act(async () => { TestRenderer.create(React.createElement(Probe, { out })); });
    expect(out.current.reduced).toBe(false);
    expect(out.current.duration.value).toBe(300);
    expect(typeof osHandler).toBe('function');

    await act(async () => { osHandler(true); });
    expect(out.current.reduced).toBe(true);
    expect(a11y.isReducedMotion()).toBe(true);
    // Durations are capped, beats are not (the gold ring still lands at 750, by a fade).
    expect(out.current.duration).toMatchObject({ press: 100, state: 150, value: 150, enter: 150, reduced: 150 });
    expect(out.current.duration.exit(450)).toBe(150);
    expect(out.current.beat.b4b8).toBe(750);

    await act(async () => { osHandler(false); });
    expect(out.current.reduced).toBe(false);
  });

  it('reads reduced motion already on at launch', async () => {
    initialReduced = true;
    load();
    const out = { current: null };
    await act(async () => { TestRenderer.create(React.createElement(Probe, { out })); });
    expect(out.current.reduced).toBe(true);
  });

  it('shares one OS subscription across consumers', async () => {
    const { rn } = load();
    const a = { current: null };
    const b = { current: null };
    await act(async () => {
      TestRenderer.create(React.createElement(React.Fragment, null,
        React.createElement(Probe, { out: a }), React.createElement(Probe, { out: b })));
    });
    const motionSubs = rn.AccessibilityInfo.addEventListener.mock.calls.filter(([name]) => name === 'reduceMotionChanged');
    expect(motionSubs).toHaveLength(1);
    await act(async () => { osHandler(true); });
    expect(a.current.reduced).toBe(true);
    expect(b.current.reduced).toBe(true);
  });
});

describe('literal ratchet: durations and springs come from src/theme/motion.js', () => {
  // sourceFiles() is src/**/*.js plus App.js outside src/theme/ and __tests__; the other
  // src/theme/ modules are scanned too, only motion.js itself is exempt.
  const themeDir = path.join(ROOT, 'src/theme');
  const themeFiles = fs.readdirSync(themeDir)
    .filter(f => /\.jsx?$/.test(f) && f !== 'motion.js')
    .map(f => `src/theme/${f}`);
  const files = sourceFiles().concat(themeFiles);
  const read = (f) => stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  const lineOf = (src, index) => src.slice(0, index).split('\n').length;

  // Whole-file regexes (`\s` spans newlines, so `duration:\n  220` is caught).
  const RULES = [
    ['spring params (tension/friction/stiffness/damping/bounciness/speed)', /\b(?:tension|friction|stiffness|damping|bounciness|speed)\s*:/g],
    ['duration: <number>', /\bduration\s*:\s*\d/g],
    ['delay: <number>', /\bdelay\s*:\s*\d/g],
    ['Animated.delay(<number>)', /Animated\s*\.\s*delay\s*\(\s*\d/g],
  ];

  function hitsFor(re, list = files) {
    const hits = [];
    for (const f of list) {
      const src = read(f);
      for (const m of src.matchAll(re)) hits.push(`${f}:${lineOf(src, m.index)}: ${m[0].replace(/\s+/g, ' ')}`);
    }
    return hits;
  }

  it.each(RULES)('no %s outside motion.js', (_, re) => {
    expect(hitsFor(re)).toEqual([]);
  });

  // setTimeout(fn, <number literal>): a timer whose delay is a bare number. Animation hand-offs
  // must use completion callbacks (sheetOut(...).start(cb)) or a motion token instead. The
  // timers below are not animation hand-offs; each is allowed by file and value, with a reason.
  const TIMER_ALLOWLIST = [
    ['src/components/TimePicker.web.js', 80, 'web wheel: scroll to the initial row after layout'],
    ['src/components/ui/Dialog.js', 0, 'iOS/web: focus the initial field on the next tick'],
    ['src/screens/SettingsScreen.js', 2000, 'dev tools: window for the 7-tap unlock'],
    ['src/screens/TodayScreen.js', 600, "reward modal waits for AppContext's load-time archiving"],
    ['src/screens/TodayScreen.js', 800, 'store review prompt after a milestone closes (not motion)'],
    ['src/screens/TodayScreen.js', 800, 'store review prompt after the trophy closes (not motion)'],
    ['src/services/backup.js', 1000, 'web: revoke the download URL once the browser has it'],
  ];

  // Finds each setTimeout( ... ) call and returns its last top-level argument.
  function timerLiterals(src) {
    const out = [];
    const re = /\bsetTimeout\s*\(/g;
    let m;
    while ((m = re.exec(src))) {
      let depth = 1;
      let i = m.index + m[0].length;
      let lastComma = -1;
      let quote = null;
      for (; i < src.length && depth > 0; i++) {
        const c = src[i];
        if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
        if (c === '"' || c === "'" || c === '`') quote = c;
        else if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
        else if (c === ',' && depth === 1) lastComma = i;
      }
      if (lastComma < 0) continue;
      const arg = src.slice(lastComma + 1, i - 1).trim();
      if (/^\d+$/.test(arg)) out.push({ ms: Number(arg), line: lineOf(src, m.index) });
    }
    return out;
  }

  it('no setTimeout with a literal delay outside the allowlist', () => {
    const found = [];
    for (const f of files) for (const { ms, line } of timerLiterals(read(f))) found.push({ f, ms, line });
    const allowed = TIMER_ALLOWLIST.map(([f, ms]) => ({ f, ms }));
    const unexpected = [];
    for (const hit of found) {
      const k = allowed.findIndex(a => a.f === hit.f && a.ms === hit.ms);
      if (k >= 0) allowed.splice(k, 1);
      else unexpected.push(`${hit.f}:${hit.line}: setTimeout(…, ${hit.ms})`);
    }
    expect(unexpected).toEqual([]);
    // Stale entries must be removed so the list cannot hide a new timer later.
    expect(allowed).toEqual([]);
  });

  it('the scanners see App.js and src/theme, and catch each form', () => {
    expect(files).toContain('App.js');
    expect(files).toContain('src/theme/tokens.js');
    expect(files).not.toContain('src/theme/motion.js');
    const count = (re, text) => (text.match(re) || []).length;
    const [spring, dur, delay, aDelay] = RULES.map(r => new RegExp(r[1].source, 'g'));
    expect(count(spring, 'Animated.spring(v, { tension: 65, friction: 11 })')).toBe(2);
    expect(count(spring, '{ bounciness: 8, speed: 12 }')).toBe(2);
    expect(count(dur, '{ duration: 220, useNativeDriver: true }')).toBe(1);
    expect(count(dur, '{ duration:\n    220 }')).toBe(1);
    expect(count(dur, '{ duration: duration.state }')).toBe(0);
    expect(count(delay, '{ delay: 125 }')).toBe(1);
    expect(count(aDelay, 'Animated.delay(600)')).toBe(1);
    expect(count(aDelay, 'Animated.delay(beat.b16)')).toBe(0);
    expect(timerLiterals('setTimeout(() => { f(a, b); }, 250); setTimeout(g, X); setTimeout(h, n + 5);'))
      .toEqual([{ ms: 250, line: 1 }]);
    expect(timerLiterals('setTimeout(() => {\n  x();\n},\n  400);')).toEqual([{ ms: 400, line: 1 }]);
  });
});
