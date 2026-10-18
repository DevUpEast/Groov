// The display-face loader (src/theme/fonts.js): bounded wait, no mid-session face swap.
let mockLoad;
jest.mock('expo-font', () => ({ loadAsync: (...args) => mockLoad(...args) }));

function freshModules() {
  let fonts; let typography;
  jest.isolateModules(() => {
    typography = require('../typography');
    fonts = require('../fonts');
  });
  return { fonts, typography };
}

const flush = () => new Promise(r => jest.requireActual('timers').setImmediate(r));

describe('loadAppFonts', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('marks Space Grotesk loaded when the font arrives before the timeout', async () => {
    mockLoad = jest.fn(() => Promise.resolve());
    const { fonts, typography } = freshModules();
    await fonts.loadAppFonts(1000);
    expect(mockLoad).toHaveBeenCalledWith({ [typography.FACES.spaceGrotesk]: expect.anything() });
    expect(typography.isFaceLoaded('spaceGrotesk')).toBe(true);
    expect(typography.familyFor('3/4', 'en', 'displayRing')).toBe(typography.FACES.spaceGrotesk);
  });

  it('resolves at the timeout and ignores a late load (the session stays on the system face)', async () => {
    let finish;
    mockLoad = jest.fn(() => new Promise(r => { finish = r; }));
    const { fonts, typography } = freshModules();
    const done = fonts.loadAppFonts(1000);
    jest.advanceTimersByTime(1000);
    await done;
    expect(typography.isFaceLoaded('spaceGrotesk')).toBe(false);
    finish();
    await flush();
    expect(typography.isFaceLoaded('spaceGrotesk')).toBe(false);
    expect(typography.familyFor('3/4', 'en', 'displayRing')).toBeNull();
  });

  it('falls back to the system face when the load fails, without waiting for the timeout', async () => {
    mockLoad = jest.fn(() => Promise.reject(new Error('bad asset')));
    const { fonts, typography } = freshModules();
    await fonts.loadAppFonts(60000);
    expect(typography.isFaceLoaded('spaceGrotesk')).toBe(false);
    expect(typography.familyFor('12', 'en', 'display')).toBeNull();
  });

  it('loads once however often it is called', async () => {
    mockLoad = jest.fn(() => Promise.resolve());
    const { fonts } = freshModules();
    const a = fonts.loadAppFonts(1000);
    const b = fonts.loadAppFonts(1000);
    expect(a).toBe(b);
    await a;
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });
});
