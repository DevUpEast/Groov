// Counts the scrimmed overlays (Dialog, BottomSheet, ActionSheet, NoteModal, ...) that are open,
// so App.js can switch the status bar to light icons while a scrim darkens the screen (F-02).
// On dark Today the hero is the light action colour (#818CF8) with ink status icons; under a
// scrim it turns dark and ink icons drop to about 1.6:1.
import { useEffect, useSyncExternalStore } from 'react';

let open = 0;
const listeners = new Set();
const emit = () => listeners.forEach(l => l());

export function overlayOpened() {
  open += 1;
  emit();
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    open = Math.max(0, open - 1);
    emit();
  };
}

export const anyOverlayOpen = () => open > 0;
export const openOverlayCount = () => open;

// Whether opening an overlay would change the status-bar style right now (dark mode on a
// screen whose icons are ink, i.e. dark Today). App.js keeps it current; OverlayModal only
// defers the Android open when it is true, so every other sheet opens at once.
let changesStatusBar = false;
export function setOverlayChangesStatusBar(value) { changesStatusBar = !!value; }
export const overlayChangesStatusBar = () => changesStatusBar;

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Registers an overlay while `visible` is true.
export function useOverlayStatus(visible) {
  useEffect(() => (visible ? overlayOpened() : undefined), [visible]);
}

// True while any registered overlay is open.
export function useAnyOverlayOpen() {
  return useSyncExternalStore(subscribe, anyOverlayOpen, anyOverlayOpen);
}
