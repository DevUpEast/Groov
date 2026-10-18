// The completions map as it stands after the last write, ahead of React (C-06a). A check-off
// handler that runs before the next render reads it, so rapid taps each count from the one
// before (ten quick water taps make ten). Every completions write goes through `update`
// (the same updater React gets), and `sync(state)` adopts React's state whenever its
// identity changes (a render after any setter, a pull, a reset). Pure: no React here.

export function createLiveCompletions(initial = {}) {
  let state = initial;
  let current = initial;
  return {
    /** Called in render with React's state: a new identity replaces the live map. */
    sync(next) {
      if (next !== state) { state = next; current = next; }
      return current;
    },
    get() { return current; },
    /** Apply a write (an updater fn, or a whole map) and return the new live map. */
    update(fnOrValue) {
      current = typeof fnOrValue === 'function' ? fnOrValue(current) : fnOrValue;
      return current;
    },
  };
}
