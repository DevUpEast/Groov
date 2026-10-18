// Loads the bundled display face (Space Grotesk Bold, assets/fonts/) through expo-font before
// the first paint (App.js gates on it together with the locale).
//
// The wait is bounded: if the font has not loaded within FONT_TIMEOUT_MS (a slow web
// connection, a broken asset), the app starts in the system face and stays in it for the
// session, so numerals never swap faces mid-use. A late load is ignored on purpose.
import * as Font from 'expo-font';
import { FACES, markFaceLoaded } from './typography';

export const FONT_TIMEOUT_MS = 2500;

let pending = null;

export function loadAppFonts(timeoutMs = FONT_TIMEOUT_MS) {
  if (pending) return pending;
  let timedOut = false;
  const load = Font.loadAsync({
    [FACES.spaceGrotesk]: require('../../assets/fonts/SpaceGrotesk_700Bold.ttf'),
  })
    .then(() => { if (!timedOut) markFaceLoaded('spaceGrotesk'); })
    .catch(() => {});
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => { timedOut = true; resolve(); }, timeoutMs);
  });
  pending = Promise.race([load, timeout]).finally(() => clearTimeout(timer));
  return pending;
}
