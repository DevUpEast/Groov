// C-06a: useCheckoffMoment plays the planned beats through feedback.play with explicit delays
// from the tap, cancels on un-check and on unmount, and hands visual beats to onBeat.
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

global.IS_REACT_ACT_ENVIRONMENT = true;

const handles = [];
jest.mock('../../services/feedback', () => ({
  __esModule: true,
  default: {
    play: jest.fn(() => { const h = { cancel: jest.fn() }; handles.push(h); return h; }),
  },
}));
jest.mock('../../utils/a11y', () => ({ useReducedMotion: () => mockReduced }));
let mockReduced = false;

const feedback = require('../../services/feedback').default;
const useCheckoffMoment = require('../useCheckoffMoment').default;
const { KINDS } = require('../../utils/beats');

function mount(onBeat) {
  let api;
  function Probe() { api = useCheckoffMoment({ onBeat }); return null; }
  let r;
  act(() => { r = TestRenderer.create(React.createElement(Probe)); });
  return { api: () => api, r };
}

beforeEach(() => { jest.useFakeTimers(); feedback.play.mockClear(); handles.length = 0; mockReduced = false; });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('a check plays each feedback item with its beat as the delay and the tap time as `at`', () => {
  const { api } = mount();
  const tapAt = Date.now() - 40;
  api().run({ kind: KINDS.check, habitId: 'w', tone: { n: 2 }, claimedIds: ['c1'], dayComplete: true, tapAt });
  expect(feedback.play.mock.calls).toEqual([
    ['habit.done', { tone: { n: 2 }, delay: 0, at: tapAt }],
    ['challenge.claimed', { delay: 250, at: tapAt }],
    ['day.complete', { delay: 750, at: tapAt }],
  ]);
});

test('visual beats reach onBeat at their offset from the tap', () => {
  const seen = [];
  const { api } = mount((item) => seen.push([item.beat, Date.now()]));
  const t0 = Date.now();
  api().run({ kind: KINDS.check, habitId: 'w', dayComplete: true, tapAt: t0 });
  expect(seen.map(s => s[0])).toEqual(['confirm']);
  jest.advanceTimersByTime(875);
  expect(seen.map(([b, t]) => [b, t - t0])).toEqual([
    ['confirm', 0], ['progress', 125], ['creditDeparts', 500], ['resolution', 750], ['streakTick', 875],
  ]);
});

test('reduced motion: no credit flight, the visual beats are 150 ms; feedback unchanged', () => {
  mockReduced = true;
  const seen = [];
  const { api } = mount((item) => seen.push(item));
  api().run({ kind: KINDS.check, habitId: 'w', dayComplete: true });
  jest.advanceTimersByTime(1000);
  expect(seen.map(i => i.beat)).toEqual(['confirm', 'progress', 'resolution', 'streakTick']);
  seen.forEach(i => expect(i.duration).toBe(150));
  expect(feedback.play.mock.calls.map(c => c[0])).toEqual(['habit.done', 'day.complete']);
});

test('an un-check inside the window cancels the pending day.complete and motif', () => {
  const seen = [];
  const { api } = mount((item) => seen.push(item.beat));
  api().run({ kind: KINDS.check, habitId: 'w', claimedIds: ['c1'], dayComplete: true });
  const [, claim, day] = handles;
  jest.advanceTimersByTime(200);
  api().run({ kind: KINDS.uncheck, habitId: 'w', unclaimedIds: ['c1'] });
  expect(claim.cancel).toHaveBeenCalled();
  expect(day.cancel).toHaveBeenCalled();
  jest.advanceTimersByTime(1000);
  expect(seen).not.toContain('resolution');
  expect(feedback.play.mock.calls.map(c => c[0])).toEqual(['habit.done', 'challenge.claimed', 'day.complete', 'habit.undone']);
});

test('unmount cancels everything still pending', () => {
  const { api, r } = mount();
  api().run({ kind: KINDS.check, habitId: 'w', dayComplete: true });
  act(() => { r.unmount(); });
  handles.forEach(h => expect(h.cancel).toHaveBeenCalled());
});
