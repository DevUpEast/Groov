import * as Sentry from '@sentry/react-native';

// Crash reporting. Everything here is a no-op until a DSN is provided through
// EXPO_PUBLIC_SENTRY_DSN (in .env.local or the eas.json build profile env), so the
// app builds and runs identically with or without a Sentry project.
//
// Deliberately minimal: no PII, no session replay, light performance sampling. The
// privacy policy (docs/privacy.html) describes exactly this.

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';

export const sentryEnabled = DSN.length > 0;

export function initSentry() {
  if (!sentryEnabled) return;
  Sentry.init({
    dsn: DSN,
    environment: __DEV__ ? 'development' : 'production',
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    enableNativeFramesTracking: false,
    // Dev builds already surface errors in the red box; keep the quota for real users.
    enabled: !__DEV__,
  });
}

export function captureException(error, context) {
  if (!sentryEnabled) return;
  try { Sentry.captureException(error, context); } catch {}
}

// Attach the signed-in user id (no email) so crashes can be correlated per account.
export function setSentryUser(userId) {
  if (!sentryEnabled) return;
  try { Sentry.setUser(userId ? { id: userId } : null); } catch {}
}

// Sentry.wrap adds touch-event breadcrumbs and the native error handler.
export function wrapRoot(Component) {
  return sentryEnabled ? Sentry.wrap(Component) : Component;
}
