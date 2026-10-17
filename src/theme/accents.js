// Habit accents (plan §2.3): 7 curated hues with light and dark fills and opaque tints.
// Data only for now (F-01). C-01 adds resolveAccent(hex, themeName) and moves every render
// site onto it; until then src/theme/accentNames.js names the legacy dots from this map.
// Pure module: no React Native imports.

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
