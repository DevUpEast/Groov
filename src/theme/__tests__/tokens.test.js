import { palette, pairs, data, accents, accentOnFill, RGBA_ROLES, brand, space, radius, size, elevation, TEXT, LARGE } from '../tokens';
import { themes, LEGACY_KEYS } from '../colors';
import { contrastRatio, relativeLuminance, isRgba } from '../contrast';

const HEX6 = /^#[0-9A-F]{6}$/;
const resolve = (theme, key) => {
  if (key.startsWith('data.')) return data[theme][key.slice(5)];
  if (key in palette[theme]) return palette[theme][key];
  return key;
};
const r2 = (n) => Number(n.toFixed(2));

describe('tokens (plan §2)', () => {
  it('declares the same role keys in light and dark', () => {
    expect(Object.keys(palette.dark).sort()).toEqual(Object.keys(palette.light).sort());
    expect(Object.keys(data.dark).sort()).toEqual(Object.keys(data.light).sort());
  });

  it('keeps every opaque role 6-digit upper-case hex and every rgba role rgba', () => {
    for (const theme of ['light', 'dark']) {
      for (const [k, v] of Object.entries(palette[theme])) {
        if (k === 'celebration') continue;
        if (RGBA_ROLES.includes(k)) expect([theme, k, isRgba(v)]).toEqual([theme, k, true]);
        else expect([theme, k, v]).toEqual([theme, k, expect.stringMatching(HEX6)]);
      }
      for (const v of Object.values(data[theme])) expect(v).toMatch(HEX6);
      expect(palette[theme].celebration.length).toBeGreaterThan(0);
      for (const v of palette[theme].celebration) expect(v).toMatch(HEX6);
    }
    for (const v of Object.values(brand)) expect(v).toMatch(HEX6);
  });

  it('only uses opaque hex colours in pairs, except an rgba background with a backdrop', () => {
    for (const p of pairs) {
      expect([p.name, resolve(p.theme, p.fg)]).toEqual([p.name, expect.stringMatching(HEX6)]);
      const bg = resolve(p.theme, p.bg);
      if (p.on) {
        expect(isRgba(bg)).toBe(true);
        expect(resolve(p.theme, p.on)).toMatch(HEX6);
      } else {
        expect([p.name, bg]).toEqual([p.name, expect.stringMatching(HEX6)]);
      }
    }
  });

  it('resolves every pair to a declared role (no typos)', () => {
    for (const p of pairs) {
      for (const k of [p.fg, p.bg, p.on].filter(Boolean)) {
        const ok = k.startsWith('data.') ? k.slice(5) in data[p.theme] : k in palette[p.theme];
        expect([p.theme, p.name, k, ok]).toEqual([p.theme, p.name, k, true]);
      }
    }
  });

  it('meets the threshold for every declared pair (4.5 text, 3 large text and non-text)', () => {
    const failures = [];
    for (const p of pairs) {
      const r = contrastRatio(resolve(p.theme, p.fg), resolve(p.theme, p.bg), p.on ? resolve(p.theme, p.on) : undefined);
      expect([TEXT, LARGE, null]).toContain(p.min);
      if (p.min && r < p.min) failures.push(`${p.theme} ${p.name}: ${r.toFixed(2)} < ${p.min}`);
      // The §2.5 table value, so the documented ratio and the code cannot drift apart.
      if (r2(r) !== p.ratio) failures.push(`${p.theme} ${p.name}: computed ${r.toFixed(2)}, table says ${p.ratio}`);
    }
    expect(failures).toEqual([]);
  });

  it('covers the acceptance pairs (F-01 a-d)', () => {
    const ratio = (theme, fg, bg) => r2(contrastRatio(palette[theme][fg], palette[theme][bg]));
    expect(ratio('dark', 'toastAction', 'toast')).toBe(5.01); // (b) dark Undo
    expect(ratio('light', 'tabInactive', 'surface')).toBe(4.76); // (c) light inactive tab
    expect(palette.dark.dangerFill).toBe('#F87171'); // (d) dark timer stop
    expect(palette.dark.onDanger).toBe('#0F172A');
    expect(ratio('dark', 'onDanger', 'dangerFill')).toBe(6.45);
    // The beat-outline pair (D-00 r6) is declared for both themes, and controlBorder on the
    // light strip would fail, which is why the strip has its own role.
    expect(pairs.filter(p => p.fg === 'beatOutline' && p.bg === 'brandSurface').map(p => p.theme).sort()).toEqual(['dark', 'light']);
    expect(contrastRatio(palette.light.controlBorder, palette.light.brandSurface)).toBeLessThan(LARGE);
    // Dark CTA: white on #818CF8 fails, the ink label passes (§1.4).
    expect(contrastRatio('#FFFFFF', palette.dark.action)).toBeLessThan(TEXT);
    expect(contrastRatio(palette.dark.onAction, palette.dark.action)).toBeGreaterThanOrEqual(TEXT);
  });

  it('orders the data ramp by luminance (light: partial lighter; dark: perfect lighter)', () => {
    expect(relativeLuminance(data.light.partial)).toBeGreaterThan(relativeLuminance(data.light.perfect));
    expect(relativeLuminance(data.dark.partial)).toBeLessThan(relativeLuminance(data.dark.perfect));
  });

  it('gives every accent a fill that passes 3:1 on its surface and its tint, and a passing check glyph', () => {
    for (const [id, a] of Object.entries(accents)) {
      for (const theme of ['light', 'dark']) {
        expect(a[theme].fill).toMatch(HEX6);
        expect(a[theme].tint).toMatch(HEX6);
        const ctx = `${id} ${theme}`;
        expect([ctx, contrastRatio(a[theme].fill, palette[theme].surface) >= LARGE]).toEqual([ctx, true]);
        expect([ctx, contrastRatio(a[theme].fill, a[theme].tint) >= LARGE]).toEqual([ctx, true]);
        expect([ctx, contrastRatio(accentOnFill[theme], a[theme].fill) >= LARGE]).toEqual([ctx, true]);
      }
    }
  });

  it('declares the §2.6 spacing, radius and size scales', () => {
    expect(space).toEqual({ xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48, gutter: 20, sectionCompact: 16 });
    expect(radius).toMatchObject({ control: 8, card: 16, sheet: 24, pill: 999 });
    expect(size).toMatchObject({ ringToday: 88, ringTodayStroke: 8, ringTodayCompact: 76, ringTodayCompactStroke: 7, ringTodayCompactBelow: 700 });
    expect(elevation.brandStrip.elevation).toBe(2);
    expect(elevation.sheet.elevation).toBe(8);
    expect(elevation.dialog.elevation).toBe(12);
  });
});

describe('colors.js legacy adapter (plan §2.1)', () => {
  it('exposes every role token and every legacy key in both themes', () => {
    for (const theme of ['light', 'dark']) {
      for (const k of Object.keys(palette[theme])) expect(themes[theme][k]).toEqual(palette[theme][k]);
      for (const k of LEGACY_KEYS) expect([theme, k, themes[theme][k]]).toEqual([theme, k, expect.any(String)]);
    }
    expect(Object.keys(themes.dark).sort()).toEqual(Object.keys(themes.light).sort());
  });

  it('maps legacy keys to their nearest role', () => {
    for (const theme of ['light', 'dark']) {
      const t = themes[theme];
      const p = palette[theme];
      expect(t.textMuted).toBe(p.textSecondary);
      expect(t.primary).toBe(p.action);
      expect(t.success).toBe(p.successText);
      expect(t.danger).toBe(p.dangerText);
      expect(t.warning).toBe(p.textSecondary);
      expect(t.tabBar).toBe(p.surface);
      expect(t.tabBarBorder).toBe(p.border);
      expect(t.tabIconActive).toBe(p.tabActive);
      expect(t.tabIconInactive).toBe(p.tabInactive);
      expect(t.progressBarBg).toBe(p.track);
    }
    // F-02: primaryLight is `selection` in both themes (the dark #1E1B4B override is gone;
    // every selection fill is paired with onSelection), and onPrimary is onAction.
    for (const theme of ['light', 'dark']) {
      expect(themes[theme].primaryLight).toBe(palette[theme].selection);
      expect(themes[theme].onPrimary).toBe(palette[theme].onAction);
      expect(contrastRatio(themes[theme].onSelection, themes[theme].primaryLight)).toBeGreaterThanOrEqual(TEXT);
      expect(contrastRatio(themes[theme].textMuted, themes[theme].primaryLight)).toBeGreaterThanOrEqual(TEXT);
    }
    // Text/icon meaning of primary: light #4F46E5, dark stays #818CF8.
    expect(themes.light.primary).toBe('#4F46E5');
    expect(themes.dark.primary).toBe('#818CF8');
  });

  it('keeps every adapter colour hex (no alpha suffix can be appended) or a declared rgba role', () => {
    for (const theme of ['light', 'dark']) {
      for (const [k, v] of Object.entries(themes[theme])) {
        if (k === 'celebration') continue;
        if (RGBA_ROLES.includes(k)) continue;
        expect([theme, k, v]).toEqual([theme, k, expect.stringMatching(HEX6)]);
      }
    }
  });
});

describe('F-02 role pairs kept outside `pairs`', () => {
  it('derives onAccent from ACCENT_ON_FILL (one source for the accent glyph)', () => {
    expect(palette.light.onAccent).toBe(accentOnFill.light);
    expect(palette.dark.onAccent).toBe(accentOnFill.dark);
  });

  it('passes onTier (ink) on every challenge-tier colour in TIER_STYLES', () => {
    // TIER_STYLES lives in AppContext until X-02 moves it into tokens; read its hexes from source.
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../context/AppContext.js'), 'utf8');
    const block = src.slice(src.indexOf('TIER_STYLES'), src.indexOf('};', src.indexOf('TIER_STYLES')));
    const borders = [...block.matchAll(/border:\s*'(#[0-9A-Fa-f]{6})'/g)].map(m => m[1]);
    expect(borders.length).toBe(4);
    for (const theme of ['light', 'dark']) {
      for (const b of borders) expect([theme, b, contrastRatio(palette[theme].onTier, b) >= TEXT]).toEqual([theme, b, true]);
    }
  });
});
