// The overlay counter App.js reads to switch the status bar to light icons under a scrim (F-02).
const { overlayOpened, anyOverlayOpen } = require('../overlayStatus');

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
});
