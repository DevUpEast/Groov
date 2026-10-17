import { mixHex } from '../color';

describe('mixHex', () => {
  it('returns the endpoints at alpha 0 and 1', () => {
    expect(mixHex('#F97316', '#FFFFFF', 0)).toBe('#FFFFFF');
    expect(mixHex('#F97316', '#FFFFFF', 1)).toBe('#F97316');
  });

  it('matches what the old 1F (12%) suffix composited to over white', () => {
    // 0x1F / 255 = 0.1216; orange over white
    expect(mixHex('#F97316', '#FFFFFF', 0x1f / 255)).toBe('#FEEEE3');
  });

  it('always returns an opaque 6-digit hex', () => {
    expect(mixHex('#a855f7', '#1E293B', 0.12)).toMatch(/^#[0-9A-F]{6}$/);
    expect(mixHex('#fff', '#000', 0.5)).toBe('#808080');
  });

  it('clamps alpha and falls back to the background on bad input', () => {
    expect(mixHex('#000000', '#FFFFFF', 2)).toBe('#000000');
    expect(mixHex('#000000', '#FFFFFF', -1)).toBe('#FFFFFF');
    expect(mixHex(null, '#FFFFFF', 0.5)).toBe('#FFFFFF');
    expect(mixHex('rgba(0,0,0,1)', '#1E293B', 0.5)).toBe('#1E293B');
  });
});
