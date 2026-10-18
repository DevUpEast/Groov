// The overlay counter App.js reads to switch the status bar to light icons under a scrim (F-02).
const { overlayOpened, anyOverlayOpen, anyHeavyOverlayOpen, setOverlayChangesStatusBar, overlayChangesStatusBar, statusBarStyle } = require('../overlayStatus');

describe('overlayStatus', () => {
  it('is open while any overlay is registered, and a double close counts once', () => {
    expect(anyOverlayOpen()).toBe(false);
    const closeA = overlayOpened();
    const closeB = overlayOpened();
    expect(anyOverlayOpen()).toBe(true);
    closeA();
    closeA();
    expect(anyOverlayOpen()).toBe(true);
    closeB();
    expect(anyOverlayOpen()).toBe(false);
  });

  it('tracks heavy (celebration) scrims separately; only they can change the status bar', () => {
    const normal = overlayOpened();
    expect(anyOverlayOpen()).toBe(true);
    expect(anyHeavyOverlayOpen()).toBe(false);
    const heavy = overlayOpened({ heavy: true });
    expect(anyHeavyOverlayOpen()).toBe(true);
    heavy(); heavy();
    expect(anyHeavyOverlayOpen()).toBe(false);
    expect(anyOverlayOpen()).toBe(true);
    normal();
    expect(anyOverlayOpen()).toBe(false);
    setOverlayChangesStatusBar(true);
    expect(overlayChangesStatusBar(true)).toBe(true);
    expect(overlayChangesStatusBar(false)).toBe(false);
    expect(overlayChangesStatusBar()).toBe(false);
    setOverlayChangesStatusBar(false);
    expect(overlayChangesStatusBar(true)).toBe(false);
  });

  it('status bar: theme icons on every tab, light under a heavy scrim and on onboarding', () => {
    expect(statusBarStyle({ hasOnboarded: true, themeName: 'light', heavyOverlayOpen: false })).toBe('dark');
    expect(statusBarStyle({ hasOnboarded: true, themeName: 'light', heavyOverlayOpen: true })).toBe('light');
    expect(statusBarStyle({ hasOnboarded: true, themeName: 'dark', heavyOverlayOpen: false })).toBe('light');
    expect(statusBarStyle({ hasOnboarded: false, themeName: 'light', heavyOverlayOpen: false })).toBe('light');
  });
});
