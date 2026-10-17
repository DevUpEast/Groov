// Colour helpers (pure).

const HEX6 = /^#([0-9a-f]{6})$/i;
const HEX3 = /^#([0-9a-f]{3})$/i;

function toRgb(hex) {
  const s = String(hex || '').trim();
  let m = s.match(HEX6);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  m = s.match(HEX3);
  if (m) return m[1].split('').map(c => parseInt(c + c, 16));
  return null;
}

const hex2 = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');

// Pre-mix `fg` at `alpha` (0-1) over the opaque `bg` and return an opaque #RRGGBB.
// Android draws a card's elevation shadow through a translucent fill (CHK-8), so tinted
// cards use this instead of an `${hex}1F` suffix. Unparseable input returns `bg`.
export function mixHex(fg, bg, alpha) {
  const f = toRgb(fg);
  const b = toRgb(bg);
  if (!b) return bg;
  if (!f) return bg;
  const a = Math.min(1, Math.max(0, Number(alpha) || 0));
  return `#${f.map((c, i) => hex2(c * a + b[i] * (1 - a))).join('').toUpperCase()}`;
}
