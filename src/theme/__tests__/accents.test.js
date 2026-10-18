// C-01 (plan §2.3, §7): the curated habit accents, resolveAccent and the legacy map.
import {
  ACCENTS, ACCENT_IDS, ACCENT_ON_FILL, DEFAULT_ACCENT_ID, DEFAULT_ACCENT_HEX, LEGACY_ACCENT_MAP,
  accentIdFor, resolveAccent, storedHexFor,
} from '../accents';
import { palette, data } from '../tokens';
import { contrastRatio, hueOf, mix, parseColor } from '../contrast';
import en from '../../i18n/locales/en.json';

const THEMES = ['light', 'dark'];
const SURFACE = { light: palette.light.surface, dark: palette.dark.surface };
const BG = { light: palette.light.bg, dark: palette.dark.bg };

// CIE L*a*b* (D65) and ΔE76.
function lab(hex) {
  const [r, g, b] = parseColor(hex).slice(0, 3).map(v => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const deltaE = (a, b) => { const p = lab(a); const q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const pairs = (ids) => ids.flatMap((a, i) => ids.slice(i + 1).map(b => [a, b]));
const inBand = (h, lo, hi) => (lo <= hi ? h >= lo && h <= hi : h >= lo || h <= hi);

describe('accent data (§2.3)', () => {
  it('has the 7 curated ids, sky as the default, and a name for each', () => {
    expect(ACCENT_IDS).toEqual(['coral', 'lime', 'teal', 'sky', 'magenta', 'pink', 'slate']);
    expect(DEFAULT_ACCENT_ID).toBe('sky');
    expect(DEFAULT_ACCENT_HEX).toBe('#0284C7');
    for (const id of ACCENT_IDS) expect(typeof en.habits.colors[id]).toBe('string');
  });

  it('pre-mixes the tints: light fill at 14 % over white, dark fill at 22 % over #1E293B', () => {
    // ±1 per channel: the plan table was rounded once.
    const close = (x, y) => parseColor(x).slice(0, 3).every((v, i) => Math.abs(v - parseColor(y)[i]) <= 1);
    for (const id of ACCENT_IDS) {
      const a = ACCENTS[id];
      expect(close(a.light.tint, mix(a.light.fill, '#FFFFFF', 0.14))).toBe(true);
      expect(close(a.dark.tint, mix(a.dark.fill, '#1E293B', 0.22))).toBe(true);
    }
  });

  it('keeps every hue out of the signature, danger and brand bands (neutrals exempt)', () => {
    for (const id of ACCENT_IDS) {
      if (ACCENTS[id].hue === null) continue; // slate
      for (const mode of THEMES) {
        const h = hueOf(ACCENTS[id][mode].fill);
        expect(inBand(h, 25, 55)).toBe(false);   // signature ±15° around 40°
        expect(inBand(h, 350, 10)).toBe(false);  // danger ±10° around 0°
        expect(inBand(h, 213, 273)).toBe(false); // brand indigo ±30° around 243°
        expect(Math.abs(h - ACCENTS[id].hue[mode === 'light' ? 0 : 1])).toBeLessThan(1.5);
      }
    }
  });

  // Frozen, rest and caution states are drawn in controlBorder (cells) plus a glyph (§2.4).
  // The slate fill is the textSecondary value by design (§2.3 table), so text roles are not compared.
  it('never equals or neighbours success, and differs from the frozen and caution colours', () => {
    for (const mode of THEMES) {
      const p = palette[mode];
      for (const id of ACCENT_IDS) {
        const fill = ACCENTS[id][mode].fill;
        expect(deltaE(fill, p.success)).toBeGreaterThanOrEqual(20);
        for (const other of [p.success, p.controlBorder, p.signature, p.dangerFill, p.dangerText, data[mode].heatFrozen, data[mode].heatPartial]) {
          expect(fill).not.toBe(other);
        }
      }
    }
  });

  it('separates the dark tints by ΔE76 >= 8 and the light tints by >= 5', () => {
    for (const [a, b] of pairs(ACCENT_IDS)) {
      expect(deltaE(ACCENTS[a].dark.tint, ACCENTS[b].dark.tint)).toBeGreaterThanOrEqual(8);
      expect(deltaE(ACCENTS[a].light.tint, ACCENTS[b].light.tint)).toBeGreaterThanOrEqual(5);
    }
  });
});

describe('CHK-2: check-state contrast (>= 3:1 non-text)', () => {
  for (const mode of THEMES) {
    describe(mode, () => {
      for (const id of ACCENT_IDS) {
        const r = resolveAccent(storedHexFor(id), mode);
        it(`${id}: the unchecked ring passes on the card surface and the screen background`, () => {
          expect(contrastRatio(r.ring, SURFACE[mode])).toBeGreaterThanOrEqual(3);
          expect(contrastRatio(r.ring, BG[mode])).toBeGreaterThanOrEqual(3);
        });
        it(`${id}: the done fill passes on the surface and on its own tint`, () => {
          expect(contrastRatio(r.fill, SURFACE[mode])).toBeGreaterThanOrEqual(3);
          expect(contrastRatio(r.fill, r.tint)).toBeGreaterThanOrEqual(3.4);
        });
        it(`${id}: the ✓ glyph passes on the fill`, () => {
          expect(r.onFill).toBe(ACCENT_ON_FILL[mode]);
          expect(contrastRatio(r.onFill, r.fill)).toBeGreaterThanOrEqual(3);
        });
        it(`${id}: text and textSecondary read on the done tint`, () => {
          expect(contrastRatio(palette[mode].textSecondary, r.tint)).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(palette[mode].text, r.tint)).toBeGreaterThanOrEqual(4.5);
        });
      }
    });
  }

  it('matches the plan table on white and #1E293B', () => {
    expect(contrastRatio(ACCENTS.sky.light.fill, '#FFFFFF')).toBeCloseTo(4.1, 1);
    expect(contrastRatio(ACCENTS.coral.dark.fill, '#1E293B')).toBeCloseTo(6.3, 1);
  });
});

describe('resolveAccent / accentIdFor', () => {
  it('resolves every legacy hex through LEGACY_ACCENT_MAP, case-insensitively', () => {
    for (const [hex, id] of Object.entries(LEGACY_ACCENT_MAP)) {
      expect(accentIdFor(hex)).toBe(id);
      expect(accentIdFor(hex.toLowerCase())).toBe(id);
      expect(resolveAccent(hex, 'dark').fill).toBe(ACCENTS[id].dark.fill);
    }
  });

  it('resolves every curated fill (light or dark) to itself', () => {
    for (const id of ACCENT_IDS) {
      expect(accentIdFor(ACCENTS[id].light.fill)).toBe(id);
      expect(accentIdFor(ACCENTS[id].dark.fill)).toBe(id);
      expect(accentIdFor(storedHexFor(id))).toBe(id);
    }
  });

  it('maps null, empty and unparseable values to the default accent', () => {
    for (const v of [null, undefined, '', '  ', 'blue', 42, '#12']) expect(accentIdFor(v)).toBe('sky');
    expect(resolveAccent(null, 'light')).toEqual({ id: 'sky', fill: '#0284C7', onFill: '#FFFFFF', tint: '#DCEEF7', ring: '#0284C7' });
  });

  it('maps an unknown hex to the nearest allowed hue, and greys to slate', () => {
    expect(accentIdFor('#DC2626')).toBe('coral');   // red, 0°
    expect(accentIdFor('#F59E0B')).toBe('coral');   // amber, 38° (signature band): coral 17° is nearest
    expect(accentIdFor('#10B981')).toBe('teal');    // emerald, 160°
    expect(accentIdFor('#8B5CF6')).toBe('magenta'); // violet, 258°
    expect(accentIdFor('#2563EB')).toBe('sky');     // blue, 221°
    expect(accentIdFor('#F43F5E')).toBe('pink');    // rose, 350°
    expect(accentIdFor('#808080')).toBe('slate');
    expect(accentIdFor('#64748B')).toBe('slate');
  });

  it('stores 6-digit upper-case hex for every pick (old app versions render it raw)', () => {
    for (const id of ACCENT_IDS) expect(storedHexFor(id)).toMatch(/^#[0-9A-F]{6}$/);
    expect(storedHexFor('nope')).toBe(DEFAULT_ACCENT_HEX);
  });
});

describe('suggest-habit palette', () => {
  it('offers exactly the 7 stored accent hexes', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../../supabase/functions/suggest-habit/index.ts'), 'utf8');
    const block = src.slice(src.indexOf('const ACCENT_HEX'), src.indexOf('const ACCENT_LIST'));
    for (const id of ACCENT_IDS) expect(block).toContain(`${id}: '${storedHexFor(id)}'`);
    expect(block.match(/#[0-9A-F]{6}/g)).toHaveLength(7);
    expect(src).not.toMatch(/#EF4444|#F97316|#EAB308|#22C55E|#14B8A6|#3B82F6|#A855F7|#EC4899/);
  });
});
