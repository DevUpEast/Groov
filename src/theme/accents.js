// Habit accents (plan §2.3): 7 curated hues with light and dark fills and opaque tints.
// Every render site reads a habit's colour through resolveAccent(habit.color, themeName)
// (C-01). Storage rule: a pick stores the accent's light-fill hex (never an id), so older app
// versions, which render `habit.color` raw, keep working. Legacy and unknown hexes are
// remapped at read time only; a stored colour is never rewritten.
// Pure module: no React Native imports.

import { hueOf, parseColor } from './contrast';

// Light tint = the light fill at 14 % over #FFFFFF; dark tint = the dark fill at 22 % over
// #1E293B (both pre-mixed and opaque, CHK-8). `hue` is the light / dark hue in degrees
// (null for the neutral slate).
export const ACCENTS = {
  coral:   { hue: [17, 17],   light: { fill: '#C2410C', tint: '#F6E4DD' }, dark: { fill: '#FF8A5B', tint: '#503E42' } },
  lime:    { hue: [86, 83],   light: { fill: '#4D7C0F', tint: '#E6EDDD' }, dark: { fill: '#A3E635', tint: '#3B533A' } },
  teal:    { hue: [175, 172], light: { fill: '#0F766E', tint: '#DDECEB' }, dark: { fill: '#2DD4BF', tint: '#214F58' } },
  sky:     { hue: [200, 198], light: { fill: '#0284C7', tint: '#DCEEF7' }, dark: { fill: '#38BDF8', tint: '#244A65' } },
  magenta: { hue: [293, 292], light: { fill: '#C026D3', tint: '#F6E1F9' }, dark: { fill: '#E879F9', tint: '#4A3B65' } },
  pink:    { hue: [333, 329], light: { fill: '#DB2777', tint: '#FAE1EC' }, dark: { fill: '#F472B6', tint: '#4D3956' } },
  slate:   { hue: null,       light: { fill: '#475569', tint: '#E5E7EA' }, dark: { fill: '#CBD5E1', tint: '#444F60' } },
};

// The check glyph drawn on an accent fill: white in light, ink in dark.
export const ACCENT_ON_FILL = { light: '#FFFFFF', dark: '#0F172A' };

export const ACCENT_IDS = Object.keys(ACCENTS);

// A new custom habit defaults to sky (§2.3).
export const DEFAULT_ACCENT_ID = 'sky';

// Read-time map from the legacy HABIT_COLORS hexes to accent ids; stored hex is never rewritten.
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

// The hex a pick of `id` stores (the light fill, upper case).
export function storedHexFor(id) {
  return (ACCENTS[id] ?? ACCENTS[DEFAULT_ACCENT_ID]).light.fill;
}

// The colour a new custom habit starts with.
export const DEFAULT_ACCENT_HEX = storedHexFor(DEFAULT_ACCENT_ID);

const FILL_TO_ID = {};
for (const id of ACCENT_IDS) {
  FILL_TO_ID[ACCENTS[id].light.fill] = id;
  FILL_TO_ID[ACCENTS[id].dark.fill] = id;
}

// HSL saturation (0-1) of an opaque colour.
function saturationOf(rgb) {
  const [r, g, b] = rgb.map(v => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return 0;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

const hueDistance = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

// Accent id for a stored habit colour:
// - a curated fill (light or dark) is itself;
// - a legacy HABIT_COLORS hex goes through LEGACY_ACCENT_MAP;
// - any other hex goes to the nearest allowed hue (neutrals, saturation < 25 %, go to slate);
// - null, an empty value or something unparseable is the default (sky).
export function accentIdFor(color) {
  if (typeof color !== 'string' || !color.trim()) return DEFAULT_ACCENT_ID;
  const key = color.trim().toUpperCase();
  if (FILL_TO_ID[key]) return FILL_TO_ID[key];
  if (LEGACY_ACCENT_MAP[key]) return LEGACY_ACCENT_MAP[key];
  const rgb = parseColor(key);
  if (!rgb) return DEFAULT_ACCENT_ID;
  const hue = hueOf(key);
  if (hue === null || saturationOf(rgb.slice(0, 3)) < 0.25) return 'slate';
  let best = DEFAULT_ACCENT_ID;
  let bestD = Infinity;
  for (const id of ACCENT_IDS) {
    const h = ACCENTS[id].hue;
    if (!h) continue;
    const d = hueDistance(hue, h[0]);
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}

// The colours a habit draws with in `themeName` ('light' | 'dark'):
// - fill: the done check fill, counter "+" when done, stripe, done-card border;
// - onFill: the ✓ / + glyph on the fill;
// - tint: the opaque done-card background;
// - ring: the unchecked 2 px ring (>= 3:1 on the card surface, CHK-2).
export function resolveAccent(color, themeName = 'light') {
  const id = accentIdFor(color);
  const mode = themeName === 'dark' ? 'dark' : 'light';
  const v = ACCENTS[id][mode];
  return { id, fill: v.fill, onFill: ACCENT_ON_FILL[mode], tint: v.tint, ring: v.fill };
}
