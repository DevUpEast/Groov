import {
  nextAppOpens, isNewOpen, hintSeen, shouldShowLongPressHint, NEW_OPEN_AFTER_MS,
} from '../hints';
import { mergeExtras, withHint } from '../settings';

describe('app opens (C-03)', () => {
  it('counts up from a missing or bad value', () => {
    expect(nextAppOpens(undefined)).toBe(1);
    expect(nextAppOpens(null)).toBe(1);
    expect(nextAppOpens('x')).toBe(1);
    expect(nextAppOpens(-3)).toBe(1);
    expect(nextAppOpens(1)).toBe(2);
    expect(nextAppOpens(7)).toBe(8);
  });

  it('a return to the foreground is a new open only after 30 min in the background', () => {
    const t0 = 1_000_000;
    expect(isNewOpen(null, t0)).toBe(false);
    expect(isNewOpen(t0, t0 + NEW_OPEN_AFTER_MS - 1)).toBe(false);
    expect(isNewOpen(t0, t0 + NEW_OPEN_AFTER_MS)).toBe(true);
  });
});

describe('long-press hint (C-03)', () => {
  const none = { extras: {} };
  it('waits for the 2nd open and a card to try it on', () => {
    expect(shouldShowLongPressHint({ settings: none, appOpens: 1, cardCount: 3 })).toBe(false);
    expect(shouldShowLongPressHint({ settings: none, appOpens: undefined, cardCount: 3 })).toBe(false);
    expect(shouldShowLongPressHint({ settings: none, appOpens: 2, cardCount: 0 })).toBe(false);
    expect(shouldShowLongPressHint({ settings: none, appOpens: 2, cardCount: 1 })).toBe(true);
    expect(shouldShowLongPressHint({ settings: none, appOpens: 9, cardCount: 1 })).toBe(true);
  });

  it('shows once: never again after "Got it"', () => {
    const seen = { extras: withHint(none, 'longPress') };
    expect(hintSeen(seen, 'longPress')).toBe(true);
    expect(shouldShowLongPressHint({ settings: seen, appOpens: 5, cardCount: 3 })).toBe(false);
  });

  it('stays dismissed after a cloud pull that lacks it (OR-merged hints)', () => {
    const local = withHint(none, 'longPress');
    const cloud = { hints: { challengeTip: true } };
    const merged = { extras: mergeExtras(cloud, local) };
    expect(shouldShowLongPressHint({ settings: merged, appOpens: 5, cardCount: 3 })).toBe(false);
    // and a pull that carries it dismisses it on this device too
    const pulled = { extras: mergeExtras({ hints: { longPress: true } }, {}) };
    expect(shouldShowLongPressHint({ settings: pulled, appOpens: 5, cardCount: 3 })).toBe(false);
  });
});
