import { createContext, useContext } from 'react';

// The current theme on its own small context (F-06 review m2). AppProvider provides a memoized
// { theme, themeName }, so the ui primitives (PressableScale, Button, IconButton, about 269
// sites after Z-01b) re-render on a theme change only, not on every app-state change, and do
// not import AppContext's storage / sync / widget graph. Null outside the provider.
export const ThemeContext = createContext(null);

export function useThemeContext() {
  return useContext(ThemeContext);
}
