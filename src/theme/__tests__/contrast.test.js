import { contrastRatio, relativeLuminance, parseColor, mix, flatten, hueOf } from '../contrast';

const r2 = (n) => Number(n.toFixed(2));

describe('contrast (plan §7.1)', () => {
  it('matches the WCAG formula on known pairs', () => {
    expect(r2(contrastRatio('#FFFFFF', '#4F46E5'))).toBe(6.29);
    expect(r2(contrastRatio('#FFFFFF', '#818CF8'))).toBe(2.98);
    expect(r2(contrastRatio('#A5B4FC', '#F8FAFC'))).toBe(1.91);
    expect(r2(contrastRatio('#EF4444', '#FFFFFF'))).toBe(3.76);
    expect(r2(contrastRatio('#000000', '#FFFFFF'))).toBe(21);
    expect(contrastRatio('#123456', '#123456')).toBe(1);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#4F46E5', '#FFFFFF')).toBeCloseTo(contrastRatio('#FFFFFF', '#4F46E5'), 10);
  });

  it('parses hex (3, 6, 8 digits) and rgb()/rgba()', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255, 1]);
    expect(parseColor('#0F172A')).toEqual([15, 23, 42, 1]);
    expect(parseColor('#00000080')[3]).toBeCloseTo(128 / 255, 5);
    expect(parseColor('rgba(15,23,42,0.40)')).toEqual([15, 23, 42, 0.4]);
    expect(parseColor('rgb(1, 2, 3)')).toEqual([1, 2, 3, 1]);
    expect(parseColor('rgba(256,0,0,1)')).toBeNull();
    expect(parseColor('teal')).toBeNull();
    expect(() => relativeLuminance('nope')).toThrow();
  });

  it('composites rgba colours before measuring', () => {
    // Black at 50 % over white is #808080.
    expect(flatten('rgba(0,0,0,0.5)', '#FFFFFF')).toBe('#808080');
    expect(contrastRatio('#FFFFFF', 'rgba(0,0,0,0.5)', '#FFFFFF')).toBeCloseTo(contrastRatio('#FFFFFF', '#808080'), 10);
    // A translucent foreground is composited over the background.
    expect(contrastRatio('rgba(255,255,255,0.7)', '#4F46E5')).toBeCloseTo(contrastRatio(mix('#FFFFFF', '#4F46E5', 0.7), '#4F46E5'), 10);
  });

  it('pre-mixes opaque tints', () => {
    expect(mix('#F97316', '#FFFFFF', 0)).toBe('#FFFFFF');
    expect(mix('#F97316', '#FFFFFF', 1)).toBe('#F97316');
    expect(mix('#F97316', '#FFFFFF', 0x1f / 255)).toBe('#FEEEE3');
    expect(mix('#C2410C', '#FFFFFF', 0.14)).toBe('#F6E4DD'); // coral light tint (§2.3)
  });

  it('reports hue, null for greys', () => {
    expect(hueOf('#FF0000')).toBe(0);
    expect(Math.round(hueOf('#4F46E5'))).toBe(243);
    expect(hueOf('#808080')).toBeNull();
  });
});
