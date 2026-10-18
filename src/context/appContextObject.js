import { createContext, useContext } from 'react';

// The app context object on its own, so light modules (the src/components/ui primitives) can
// read it without importing AppContext.js and its storage, sync and widget graph.
export const AppContext = createContext(null);

// The context value or null: for shared UI primitives that may also render outside the
// provider (the crash screen, components tested without it).
export function useOptionalApp() {
  return useContext(AppContext);
}
