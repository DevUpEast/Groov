import { useSyncExternalStore } from 'react';
import { loadData, saveData } from './storage';

// Device-local developer flags (plan C-06a; formalised by S-10). Stored under the AsyncStorage
// key `devFlags`, never in settings, so a cloud pull or a settings sync never changes them.
// Settings → Dev tools shows a switch for each. Every flag has a default that is in force
// until the stored value has loaded (and when nothing is stored).
//
// - `choreography`: the C-06a check-off timeline (useCheckoffMoment: beats, cancellation,
//   no snackbar for single checks). Off = the pre-C-06a behaviour, the rollback switch for
//   C-06b / C-07.
// - `frameLog`: release builds also write each check-off animation's first and last frame to
//   the Feedback log (src/hooks/useTween.js; dev builds always do). For timing checks only.

export const DEV_FLAG_KEY = 'devFlags';
export const DEV_FLAG_DEFAULTS = Object.freeze({ choreography: true, frameLog: false });

let flags = { ...DEV_FLAG_DEFAULTS };
let loading = null;
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => { try { fn(); } catch {} });
}

/** Read the stored flags once (idempotent); resolves to the current flags. */
export function loadDevFlags() {
  if (!loading) {
    loading = loadData(DEV_FLAG_KEY).then((stored) => {
      if (stored && typeof stored === 'object') {
        const next = { ...flags };
        Object.keys(DEV_FLAG_DEFAULTS).forEach((k) => { if (typeof stored[k] === 'boolean') next[k] = stored[k]; });
        flags = next;
        emit();
      }
      return flags;
    }).catch(() => flags);
  }
  return loading;
}

export function getDevFlag(name) {
  return flags[name] ?? DEV_FLAG_DEFAULTS[name];
}

export function setDevFlag(name, value) {
  if (!(name in DEV_FLAG_DEFAULTS)) return;
  flags = { ...flags, [name]: !!value };
  emit();
  saveData(DEV_FLAG_KEY, flags);
}

function subscribe(fn) {
  listeners.add(fn);
  loadDevFlags();
  return () => listeners.delete(fn);
}

/** The live value of one flag; re-renders when it changes. */
export function useDevFlag(name) {
  return useSyncExternalStore(subscribe, () => getDevFlag(name), () => getDevFlag(name));
}

export function __resetDevFlagsForTests() {
  flags = { ...DEV_FLAG_DEFAULTS };
  loading = null;
  listeners.clear();
}
