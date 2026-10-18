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
