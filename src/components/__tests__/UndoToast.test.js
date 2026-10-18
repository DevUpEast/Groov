// F-05 M4: the toast's exit animation plays. The last toast stays rendered (and untouchable)
// until its duration.exit(value) fade/slide finishes, then unmounts.
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;
const { Animated } = require('react-native');

let mockReduced = false;
jest.mock('../../utils/a11y', () => ({ useReducedMotion: () => mockReduced, isReducedMotion: () => mockReduced, announce: jest.fn() }));

const UndoToast = require('../UndoToast').default;
const { themes } = require('../../theme/colors');

global.IS_REACT_ACT_ENVIRONMENT = true;

// Run every Animated animation to completion synchronously, recording the configs.
let configs;
beforeEach(() => {
  mockReduced = false;
  configs = [];
  jest.spyOn(Animated, 'timing').mockImplementation((value, config) => {
    configs.push(config);
    return {
      start: (cb) => { value.setValue(config.toValue); cb?.({ finished: true }); },
      stop: jest.fn(),
    };
  });
  jest.useFakeTimers();
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

const theme = themes.light;
const toast = { id: 1, message: 'Drink water done' };
const el = (t) => React.createElement(UndoToast, { toast: t, onUndo: jest.fn(), onHide: jest.fn(), theme });
const texts = (r) => r.root.findAll(n => typeof n.props.children === 'string').map(n => n.props.children);

it('keeps the last toast on screen until the exit animation finishes', () => {
  // Hold the exit open so the in-between state can be inspected.
  const pending = [];
  const finishExit = () => pending.splice(0).forEach(f => f());
  let r;
  act(() => { r = TestRenderer.create(el(toast)); });
  expect(texts(r)).toContain('Drink water done');

  Animated.timing.mockImplementation((value, config) => {
    configs.push(config);
    return {
      start: (cb) => { pending.push(() => { value.setValue(config.toValue); cb?.({ finished: true }); }); },
      stop: jest.fn(),
    };
  });
  configs = [];
  act(() => { r.update(el(null)); });
  // Still rendered, ignoring touches and hidden from screen readers while it leaves.
  expect(texts(r)).toContain('Drink water done');
  const wrap = r.root.findAll(n => n.props.accessibilityLiveRegion === 'polite')[0];
  expect(wrap.props.pointerEvents).toBe('none');
  // Exit = duration.exit(duration.value) = 210 ms, opacity and slide.
  expect(configs.map(c => c.duration)).toEqual([210, 210]);
  expect(configs.map(c => c.toValue).sort()).toEqual([0, 80]);

  act(() => { finishExit(); });
  expect(r.toJSON()).toBeNull();
});

it('fades out in 150 ms without sliding under reduced motion', () => {
  mockReduced = true;
  let r;
  act(() => { r = TestRenderer.create(el(toast)); });
  configs = [];
  act(() => { r.update(el(null)); });
  expect(configs).toHaveLength(1);
  expect(configs[0]).toMatchObject({ toValue: 0, duration: 150 });
  expect(r.toJSON()).toBeNull();
});
