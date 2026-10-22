// Which kind of build this is (launch hardening). EAS sets EXPO_PUBLIC_APP_ENV per build
// profile in eas.json: development | preview | production. A local `expo start` is
// __DEV__; any other build without the variable counts as production, so a store build
// can never expose the dev tools by accident. A local release APK that needs the dev
// tools sets EXPO_PUBLIC_APP_ENV=preview in .env.local.

export function resolveAppEnv(value, dev) {
  const v = (value || '').trim().toLowerCase();
  if (v === 'development' || v === 'preview' || v === 'production') return v;
  return dev ? 'development' : 'production';
}

// Dev tools (Settings → Dev tools, the simulated date, the feedback log, test buttons)
// exist only outside production.
export function devToolsAllowedFor(env, dev) {
  return !!dev || env !== 'production';
}

export const APP_ENV = resolveAppEnv(process.env.EXPO_PUBLIC_APP_ENV, typeof __DEV__ !== 'undefined' && __DEV__);
export const devToolsAllowed = devToolsAllowedFor(APP_ENV, typeof __DEV__ !== 'undefined' && __DEV__);
