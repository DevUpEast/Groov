// WCAG 2.x contrast helpers for the token test and the design preview (plan §2.1).
// Accepts #RGB, #RRGGBB, #RRGGBBAA and rgb()/rgba(). Translucent colours are composited
// over the colour beneath them before luminance is taken.
// Pure module: no React Native imports.

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGBA = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(0|1|0?\.\d+|1\.0+))?\s*\)$/i;

// [r, g, b, a] with r/g/b 0-255 and a 0-1, or null.
export function parseColor(input) {
  const s = String(input ?? '').trim();
  let m = s.match(HEX);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  }
  m = s.match(RGBA);
  if (m) {
    const rgb = [m[1], m[2], m[3]].map(Number);
    if (rgb.some(v => v > 255)) return null;
    return [...rgb, m[4] === undefined ? 1 : Number(m[4])];
  }
  return null;
}

export function isRgba(input) {
  return RGBA.test(String(input ?? '').trim());
}

const hex2 = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0').toUpperCase();
export const toHex = ([r, g, b]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

function req(c) {
  const p = parseColor(c);
  if (!p) throw new Error(`contrast: unparseable colour ${JSON.stringify(c)}`);
  return p;
}

// Composite `fg` at `t` (0-1, times fg's own alpha) over the opaque `bg`; returns #RRGGBB.
// This is the opaque pre-mix tinted surfaces use instead of hex-alpha suffixes (CHK-8).
export function mix(fg, bg, t = 1) {
  const f = req(fg);
  const b = req(bg);
  const a = Math.min(1, Math.max(0, Number(t))) * f[3];
  return toHex([0, 1, 2].map(i => f[i] * a + b[i] * (1 - a)));
}

// Resolve a possibly translucent colour to opaque hex over `backdrop` (default white).
export function flatten(color, backdrop = '#FFFFFF') {
  const c = req(color);
  if (c[3] >= 1) return toHex(c);
  return mix(color, flatten(backdrop), 1);
}

const channel = (v) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export function relativeLuminance(color) {
  const [r, g, b] = req(flatten(color));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

// Contrast ratio of `fg` on `bg` (1-21). A translucent `bg` is first composited over
// `backdrop`; a translucent `fg` is then composited over that result.
export function contrastRatio(fg, bg, backdrop = '#FFFFFF') {
  const base = flatten(bg, backdrop);
  const top = flatten(fg, base);
  const l1 = relativeLuminance(top);
  const l2 = relativeLuminance(base);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// HSL hue in degrees (0-360), or null for a neutral grey.
export function hueOf(color) {
  const [r, g, b] = req(color).slice(0, 3).map(v => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return null;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}
