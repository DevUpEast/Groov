import React, { useContext, useEffect, useReducer, useRef } from 'react';
import { AppState } from 'react-native';
import { MOMENT_MS } from './beats';

/**
 * One pager tab (C-07, STATE m4 perf carry). Every useApp consumer re-renders on every app
 * state change, and all five tabs stay mounted, so a check-off on Today used to re-render
 * Progress, Challenges, Habits and Settings too, inside the first 300 ms of the moment
 * (about 130 ms of JS per tap on the release emulator build; about 50 ms without them).
 *
 * `createTabScope(Context)` returns `TabScope({ active, Screen })`, which re-provides
 * `Context` to `Screen`:
 * - the active tab gets the live value;
 * - an inactive tab keeps the value it last had; it catches up MOMENT_MS (1.5 s, one check-off
 *   moment) after the first change it missed, so a swipe that peeks at it shows data at most
 *   that old, and once it becomes active it gets the live value (usually it has caught up
 *   already, so nothing re-renders then);
 * - a theme change (`themeName`) reaches every tab at once, and so does everything when the
 *   app leaves the foreground.
 * `Screen` must be memoised (App.js wraps each screen in React.memo), so that only the
 * context can re-render it.
 */
export function createTabScope(Context) {
  function TabScope({ active, Screen }) {
    const live = useContext(Context);
    const shown = useRef(live);
    const liveRef = useRef(live);
    liveRef.current = live;
    const timer = useRef(null);
    const [, catchUp] = useReducer((x) => x + 1, 0);
    if (active || shown.current?.themeName !== live?.themeName) shown.current = live;
    useEffect(() => {
      if (active) { clearTimeout(timer.current); timer.current = null; return; }
      if (shown.current === live || timer.current) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        shown.current = liveRef.current;
        catchUp();
      }, MOMENT_MS);
    });
    useEffect(() => {
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active' || shown.current === liveRef.current) return;
        clearTimeout(timer.current);
        timer.current = null;
        shown.current = liveRef.current;
        catchUp();
      });
      return () => { sub.remove(); clearTimeout(timer.current); };
    }, []);
    return (
      <Context.Provider value={shown.current}>
        <Screen />
      </Context.Provider>
    );
  }
  return React.memo(TabScope);
}
