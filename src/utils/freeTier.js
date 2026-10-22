// Free-tier gate (launch hardening). Groov Pro is sold only once RevenueCat keys are set
// (`purchasesConfigured` in src/services/entitlements.js). Until then there is nothing to
// buy, so no limit applies and no paywall entry point is shown: a limit with no way past
// it would block a free user, and a "coming soon" paywall is an incomplete feature
// (App Store guideline 2.1). No SDK or Supabase import, so screens and jest can use it.
import { Platform } from 'react-native';

// The RevenueCat public key for this platform (EAS / .env.local), '' when not set.
export const RC_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  default: null,
}) || '';

export const purchasesConfigured = RC_KEY.length > 0 && Platform.OS !== 'web';

// True when the user may add one more item (`count` is how many there are now).
export function freeTierAllows({ configured, isPro, count, limit }) {
  if (!configured || isPro) return true;
  return (count || 0) < limit;
}

// True when a paywall entry point (upgrade row, "See Groov Pro" link, the sheet) may show.
export function paywallAvailable({ configured }) {
  return !!configured;
}

// The AI quota error from the edge functions ends with a Pro upsell ("Groov Pro raises this
// limit."). Without purchases there is nothing to upsell, so that sentence is dropped.
export function stripProUpsell(message, { configured }) {
  if (!message || configured) return message || '';
  return message
    .split(/(?<=\.)\s+/)
    .filter(sentence => !/\bPro\b/.test(sentence))
    .join(' ')
    .trim();
}
