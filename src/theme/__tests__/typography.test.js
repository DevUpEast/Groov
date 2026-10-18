import { type, VARIANT_FACE, FACES, familyFor, textStyle, markFaceLoaded, resetLoadedFaces, bodyFor } from '../typography';

describe('type scale (§2.7)', () => {
  it('matches the spec sizes', () => {
    expect(type.display).toMatchObject({ fontSize: 34, lineHeight: 40, fontVariant: ['tabular-nums'] });
    expect(type.displayRing).toMatchObject({ fontSize: 28, lineHeight: 30, fontVariant: ['tabular-nums'] });
    expect(type.title).toMatchObject({ fontSize: 28, lineHeight: 34, fontWeight: '700' });
    expect(type.headline).toMatchObject({ fontSize: 20, lineHeight: 26, fontWeight: '600' });
    expect(type.callout).toMatchObject({ fontSize: 15, lineHeight: 20, fontWeight: '500' });
    expect(type.footnote).toMatchObject({ fontSize: 13, lineHeight: 18 });
    expect(type.caption).toMatchObject({ fontSize: 12, lineHeight: 16, fontWeight: '500' });
    expect(type.numericSmall).toMatchObject({ fontWeight: '600', fontVariant: ['tabular-nums'] });
  });

  it('uses 17/22 body on iOS and 16/24 elsewhere', () => {
    expect(bodyFor('ios').body).toMatchObject({ fontSize: 17, lineHeight: 22 });
    expect(bodyFor('android').body).toMatchObject({ fontSize: 16, lineHeight: 24 });
  });

  it('keeps titles in the system face by default (D-00) and Space Grotesk only for display numerals', () => {
    expect(VARIANT_FACE.title).toBe('system');
    expect(VARIANT_FACE.display).toBe('spaceGrotesk');
    expect(VARIANT_FACE.displayRing).toBe('spaceGrotesk');
    expect(VARIANT_FACE.numericSmall).toBeUndefined();
  });

  it('only puts Space Grotesk on variants of 24 pt and up', () => {
    for (const [variant, face] of Object.entries(VARIANT_FACE)) {
      if (face === 'spaceGrotesk') expect([variant, type[variant].fontSize >= 24]).toEqual([variant, true]);
    }
  });
});

describe('familyFor(text, locale, variant)', () => {
  beforeEach(() => { resetLoadedFaces(); markFaceLoaded('spaceGrotesk'); });
  afterAll(() => resetLoadedFaces());

  it('gives display numerals Space Grotesk in every locale, ja included', () => {
    expect(familyFor('3/4', 'en', 'displayRing')).toBe(FACES.spaceGrotesk);
    expect(familyFor('100%', 'de', 'display')).toBe(FACES.spaceGrotesk);
    expect(familyFor('12', 'ja', 'display')).toBe(FACES.spaceGrotesk);
  });

  it('keeps system variants in the system face', () => {
    expect(familyFor('Your Progress', 'en', 'title')).toBeNull();
    expect(familyFor('3', 'en', 'numericSmall')).toBeNull();
    expect(familyFor('Drink water', 'en', 'body')).toBeNull();
  });

  it('falls back to the system face for text outside Latin and Latin Extended', () => {
    expect(familyFor('12日', 'ja', 'display')).toBeNull();
    expect(familyFor('Привет', 'en', 'display')).toBeNull();
    expect(familyFor('Ελλάδα', 'en', 'display')).toBeNull();
    // Latin Extended and common punctuation stay in the face.
    expect(familyFor('Ångström · Łódź – Đ', 'pl', 'display')).toBe(FACES.spaceGrotesk);
  });

  it('keeps ja titles in the system face even after the title swap', () => {
    VARIANT_FACE.title = 'spaceGrotesk';
    try {
      expect(familyFor('Your Progress', 'en', 'title')).toBe(FACES.spaceGrotesk);
      expect(familyFor('Progress', 'ja', 'title')).toBeNull();
      expect(familyFor('進捗', 'ja', 'title')).toBeNull();
      expect(familyFor('Good evening, Иван', 'en', 'title')).toBeNull();
    } finally {
      VARIANT_FACE.title = 'system';
    }
  });

  it('uses the system face until the font has loaded (and after a timeout)', () => {
    resetLoadedFaces();
    expect(familyFor('3/4', 'en', 'displayRing')).toBeNull();
  });

  it('textStyle drops the weight on the custom face and keeps it on the system face', () => {
    const sg = textStyle('display', '12', 'en');
    expect(sg.fontFamily).toBe(FACES.spaceGrotesk);
    expect(sg.fontWeight).toBeUndefined();
    expect(textStyle('title', 'Habits', 'en')).toEqual(type.title);
  });
});
