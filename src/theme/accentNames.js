// Temporary (S-06): names the legacy habit colour dots for screen readers by mapping each
// legacy hex to one of the 7 accent ids that C-01 ships (plan §2.3 LEGACY_ACCENT_MAP).
// C-01 replaces this file with resolveAccent() in src/theme/accents.js.
// Pure module: no React Native imports.

export const ACCENT_IDS = ['coral', 'lime', 'teal', 'sky', 'magenta', 'pink', 'slate'];

export const LEGACY_ACCENT_MAP = {
  '#EF4444': 'coral',
  '#F97316': 'coral',
  '#EAB308': 'lime',
  '#22C55E': 'teal',
  '#14B8A6': 'teal',
  '#3B82F6': 'sky',
  '#A855F7': 'magenta',
  '#6366F1': 'sky',
  '#EC4899': 'pink',
};

// Accent id for a stored habit colour, or null for "no colour" / an unknown value.
export function accentIdFor(hex) {
  if (typeof hex !== 'string') return null;
  return LEGACY_ACCENT_MAP[hex.toUpperCase()] ?? null;
}
