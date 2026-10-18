// Groov type scale (plan §2.7). The single source of every text size, line height, weight and
// face. Consumers render text through <AppText variant="..."> (src/components/ui/AppText.js),
// or spread `type.<variant>` into a StyleSheet and pick the face with `familyFor`.
//
// Faces:
// - `system`: the platform font (San Francisco, Roboto, the browser's system-ui).
// - `spaceGrotesk`: Space Grotesk Bold (OFL 1.1, assets/fonts/), display numerals only. One
//   static Bold file is shipped, so a variant on this face never sets fontWeight (the face is
//   the weight; a weight on top would make Android and the browser fake a heavier bold).
//
// To set titles in Space Grotesk (the D-00 alternative, >= 24 pt only), change
// `VARIANT_FACE.title` from 'system' to 'spaceGrotesk'. Nothing else needs to move.
//
// Rules (src/theme/__tests__/typography.test.js, typeFloor.test.js):
// - no size below `caption` (12): the 12 pt floor;
// - Space Grotesk only at 24 pt and up;
// - text with characters outside Latin and Latin Extended, and every `ja` string that is not
//   a display numeral, falls back to the system face (`familyFor`).
//
// Pure module: no React Native imports (the Android / iOS body size is chosen by `bodyFor`).

export const FACES = {
  system: null,
  spaceGrotesk: 'SpaceGrotesk_700Bold',
};

// Which face each variant uses. `title` is the one-line swap.
export const VARIANT_FACE = {
  display: 'spaceGrotesk',
  displayRing: 'spaceGrotesk',
  title: 'system',
};

// Variants that only ever hold numbers (they keep their face in every locale).
const NUMERAL_VARIANTS = new Set(['display', 'displayRing']);

const TABULAR = ['tabular-nums'];

// The system-face weights; a Space Grotesk variant drops its weight (see above).
export const type = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '700', fontVariant: TABULAR },
  displayRing: { fontSize: 28, lineHeight: 30, fontWeight: '700', fontVariant: TABULAR },
  // 15-20 pt counters, chips and small stats (system 600, tabular). Size at the call site.
  numericSmall: { fontSize: 16, lineHeight: 20, fontWeight: '600', fontVariant: TABULAR },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  headline: { fontSize: 20, lineHeight: 26, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  callout: { fontSize: 15, lineHeight: 20, fontWeight: '500' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  footnoteStrong: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
};

// iOS body is 17 / 22; Android (and web) 16 / 24.
export function bodyFor(os) {
  return os === 'ios'
    ? { body: { ...type.body, fontSize: 17, lineHeight: 22 }, bodyStrong: { ...type.bodyStrong, fontSize: 17, lineHeight: 22 } }
    : { body: type.body, bodyStrong: type.bodyStrong };
}

// The smallest size any text may use.
export const TYPE_FLOOR = type.caption.fontSize;

// Spread into a style to make digits the same width (counters, timers, stats).
export const numeric = { fontVariant: TABULAR };

// Latin-1, Latin Extended (A, B, Additional), General Punctuation, Arrows and the minus sign.
// Anything else (Cyrillic, Greek, CJK, emoji) is outside what Space Grotesk covers, so a
// string containing it renders in the system face.
const OUTSIDE_LATIN = /[^\u0000-ɏḀ-ỿ -⁯←-⇿−]/u;

// Faces that have finished loading (src/theme/fonts.js marks them). Until a face is marked,
// and for the whole session if loading timed out, its variants render in the system face, so
// the app never draws a fallback glyph that later jumps to the real one.
const loaded = new Set();
export function markFaceLoaded(face) { loaded.add(face); }
export function resetLoadedFaces() { loaded.clear(); }
export function isFaceLoaded(face) { return loaded.has(face); }

// The fontFamily for `text` in `variant` under `locale`, or null for the system face.
export function familyFor(text, locale, variant) {
  const face = VARIANT_FACE[variant] || 'system';
  if (face === 'system' || !loaded.has(face)) return null;
  const str = text == null ? '' : String(text);
  if (OUTSIDE_LATIN.test(str)) return null;
  // Japanese titles and labels stay in the system face; display numerals keep Space Grotesk.
  if (locale && /^ja\b/i.test(locale) && !NUMERAL_VARIANTS.has(variant)) return null;
  return FACES[face];
}

// The full style for a variant: the scale entry plus the face, without a weight on a custom
// face. `text` and `locale` feed the fallback rules.
export function textStyle(variant, text, locale) {
  const base = type[variant] || type.body;
  const fontFamily = familyFor(text, locale, variant);
  if (!fontFamily) return base;
  const { fontWeight, ...rest } = base;
  return { ...rest, fontFamily };
}
