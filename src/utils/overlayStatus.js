// Counts the scrimmed overlays (Dialog, BottomSheet, ActionSheet, NoteModal, ...) that are open,
// and separately the heavy-scrim ones (TrophyCelebration, ChallengeRewardModal: the 70 % black
// `celebrationScrim`), so App.js can pick status-bar icons that stay readable over them.
//
// Since C-04 every tab starts on the theme `bg`, so the status bar follows the theme: ink icons
// in light, light icons in dark. A normal scrim (0.40 slate) keeps ink icons readable, so only a
// heavy scrim changes the style: in light mode App.js switches to light icons while one is open
// (ink on ~#4D4D4D would be about 2.5:1).
import { useEffect, useSyncExternalStore } from 'react';

let open = 0;
let heavyOpen = 0;
const listeners = new Set();
const emit = () => listeners.forEach(l => l());

// Registers an open overlay; `heavy` marks a heavy (celebration) scrim. Returns the close
// function, which is safe to call twice.
export function overlayOpened({ heavy = false } = {}) {
  open += 1;
  if (heavy) heavyOpen += 1;
  emit();
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    open = Math.max(0, open - 1);
    if (heavy) heavyOpen = Math.max(0, heavyOpen - 1);
    emit();
  };
}

export const anyOverlayOpen = () => open > 0;
export const anyHeavyOverlayOpen = () => heavyOpen > 0;
export const openOverlayCount = () => open;

// Whether opening a heavy-scrim overlay would change the status-bar style right now (light mode
// after onboarding, where the icons are ink). App.js keeps it current during render.
// OverlayModal defers the Android open only then: the Modal's dialog window copies the
// activity's status-bar appearance once, when it is created, so the activity must already have
// the new style. Normal scrims never change the style, so they always open at once.
let heavyChangesStatusBar = false;
export function setOverlayChangesStatusBar(value) { heavyChangesStatusBar = !!value; }
export const overlayChangesStatusBar = (heavy = false) => !!heavy && heavyChangesStatusBar;

// The status-bar style App.js renders: light on the onboarding brand ground and under a heavy
// scrim, otherwise the theme's (ink icons on the light bg, light icons on the dark one).
export function statusBarStyle({ hasOnboarded, themeName, heavyOverlayOpen }) {
  if (!hasOnboarded || heavyOverlayOpen) return 'light';
  return themeName === 'dark' ? 'light' : 'dark';
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Registers an overlay while `visible` is true.
export function useOverlayStatus(visible, { heavy = false } = {}) {
  useEffect(() => (visible ? overlayOpened({ heavy }) : undefined), [visible, heavy]);
}

// True while any registered overlay is open.
export function useAnyOverlayOpen() {
  return useSyncExternalStore(subscribe, anyOverlayOpen, anyOverlayOpen);
}

// True while a heavy-scrim overlay is open (App.js: light status-bar icons).
export function useAnyHeavyOverlayOpen() {
  return useSyncExternalStore(subscribe, anyHeavyOverlayOpen, anyHeavyOverlayOpen);
}
