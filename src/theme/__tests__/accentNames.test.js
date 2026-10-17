import { ACCENT_IDS, LEGACY_ACCENT_MAP, accentIdFor } from '../accentNames';
import en from '../../i18n/locales/en.json';

describe('accentNames (S-06)', () => {
  it('maps every legacy hex to a shipped accent id', () => {
    for (const id of Object.values(LEGACY_ACCENT_MAP)) expect(ACCENT_IDS).toContain(id);
  });

  it('has an English name for every accent id', () => {
    for (const id of ACCENT_IDS) expect(typeof en.habits.colors[id]).toBe('string');
  });

  it('resolves case-insensitively and returns null for none or unknown', () => {
    expect(accentIdFor('#ef4444')).toBe('coral');
    expect(accentIdFor('#14B8A6')).toBe('teal');
    expect(accentIdFor(null)).toBeNull();
    expect(accentIdFor('#123456')).toBeNull();
  });
});
