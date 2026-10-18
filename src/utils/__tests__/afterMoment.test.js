// C-06a carry: saves, sync, the widget and notification refreshes wait out the check-off moment.
const { AppState } = require('react-native');

let appStateHandler = null;
jest.spyOn(AppState, 'addEventListener').mockImplementation((name, fn) => { appStateHandler = fn; return { remove() {} }; });

const { afterMoment, flushMoment, pendingAfterMoment, __resetAfterMomentForTests } = require('../afterMoment');

let busyUntil = 0;
const busyFor = () => Math.max(0, busyUntil - Date.now());

beforeEach(() => { jest.useFakeTimers(); __resetAfterMomentForTests(); busyUntil = 0; });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test('outside a moment the work runs at once', () => {
  const fn = jest.fn();
  afterMoment('save:x', fn, { busyFor });
  expect(fn).toHaveBeenCalledTimes(1);
  expect(pendingAfterMoment()).toBe(0);
});

test('inside a moment it waits until the moment is over; the same key keeps only the latest', () => {
  busyUntil = Date.now() + 1500;
  const saves = [];
  for (let i = 1; i <= 10; i++) afterMoment('save:completions', () => saves.push(i), { busyFor });
  const track = jest.fn();
  afterMoment(null, track, { busyFor });
  afterMoment(null, track, { busyFor });
  jest.advanceTimersByTime(1499);
  expect(saves).toEqual([]);
  jest.advanceTimersByTime(1);
  expect(saves).toEqual([10]);
  expect(track).toHaveBeenCalledTimes(2); // un-keyed jobs never coalesce
});

test('another tap extends the wait', () => {
  busyUntil = Date.now() + 1500;
  const fn = jest.fn();
  afterMoment('widget', fn, { busyFor });
  jest.advanceTimersByTime(1000);
  busyUntil = Date.now() + 1500; // a new tap
  jest.advanceTimersByTime(600);
  expect(fn).not.toHaveBeenCalled();
  jest.advanceTimersByTime(900);
  expect(fn).toHaveBeenCalledTimes(1);
});

test('backgrounding the app runs everything queued at once', () => {
  busyUntil = Date.now() + 1500;
  const fn = jest.fn();
  afterMoment('save:habits', fn, { busyFor });
  expect(appStateHandler).toBeInstanceOf(Function);
  appStateHandler('background');
  expect(fn).toHaveBeenCalledTimes(1);
  expect(pendingAfterMoment()).toBe(0);
});

test('flushMoment runs the queue, and a throwing job does not stop the rest', () => {
  busyUntil = Date.now() + 1500;
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const ok = jest.fn();
  afterMoment('a', () => { throw new Error('boom'); }, { busyFor });
  afterMoment('b', ok, { busyFor });
  flushMoment();
  expect(ok).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});
