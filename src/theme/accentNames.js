// Temporary (S-06): names the legacy habit colour dots for screen readers by mapping each
// legacy hex to one of the 7 accent ids that C-01 ships (plan §2.3 LEGACY_ACCENT_MAP).
// C-01 replaces this file with resolveAccent() in src/theme/accents.js (F-01 moved the data there).
// Pure module: no React Native imports.

import { ACCENT_IDS, LEGACY_ACCENT_MAP } from './accents';

export { ACCENT_IDS, LEGACY_ACCENT_MAP };

// Accent id for a stored habit colour, or null for "no colour" / an unknown value.
export function accentIdFor(hex) {
  if (typeof hex !== 'string') return null;
  return LEGACY_ACCENT_MAP[hex.toUpperCase()] ?? null;
}
