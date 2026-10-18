// One-time tips (pure, tested). The "seen" flags live in settings.extras.hints (S-10,
// OR-merged across devices); the open counter that decides *when* a tip may first show is
// device-local (deviceSettings.appOpens), because it describes this install.

// A foreground after at least this long in the background counts as a new app open, so a
// phone that keeps the app alive for days still reaches its "2nd open".
export const NEW_OPEN_AFTER_MS = 30 * 60 * 1000;

/** The stored open counter after one more open (a missing or bad value starts at 0). */
export function nextAppOpens(prev) {
  const n = Number.isFinite(prev) && prev > 0 ? Math.floor(prev) : 0;
  return n + 1;
}

/** Whether a return to the foreground after `backgroundAt` counts as a new open. */
export function isNewOpen(backgroundAt, now) {
  return Number.isFinite(backgroundAt) && now - backgroundAt >= NEW_OPEN_AFTER_MS;
}

export function hintSeen(settings, hintId) {
  return settings?.extras?.hints?.[hintId] === true;
}

// C-03 (BTN-5): the "press and hold (or tap ⋯)" tip shows above the first Today card from the
// user's 2nd app open, while there is a card to try it on, until "Got it" (or until the user
// has opened a card's options, which shows they found them).
export const LONG_PRESS_HINT_FROM_OPEN = 2;
export function shouldShowLongPressHint({ settings, appOpens, cardCount }) {
  if (hintSeen(settings, 'longPress')) return false;
  if (!(cardCount > 0)) return false;
  return (Number(appOpens) || 0) >= LONG_PRESS_HINT_FROM_OPEN;
}
