// Privacy-friendly product analytics (Aptabase). A handful of counted events with no
// user identifiers, no free text and no habit names, so nothing here is personal.
// Everything is a no-op until EXPO_PUBLIC_APTABASE_KEY is set (eas.json / .env.local).

const KEY = process.env.EXPO_PUBLIC_APTABASE_KEY || '';
export const analyticsEnabled = KEY.length > 0;

let aptabase = null;

export function initAnalytics() {
  if (!analyticsEnabled || aptabase) return;
  try {
    // Lazy require keeps the SDK out of the bundle's startup path when unused.
    aptabase = require('@aptabase/react-native');
    aptabase.init(KEY, { appVersion: require('expo-constants').default?.expoConfig?.version });
  } catch (e) {
    aptabase = null;
    if (__DEV__) console.warn('[analytics] init failed:', e?.message);
  }
}

// Event names are the product vocabulary; props must be small enums/numbers only.
export function track(event, props) {
  if (!aptabase) return;
  try { aptabase.trackEvent(event, props); } catch {}
}

export const Events = {
  HABIT_CREATED: 'habit_created',         // { type, schedule, timeOfDay }
  COMPLETION: 'completion',               // { type }
  CHALLENGE_CREATED: 'challenge_created', // { days, linked }
  CHALLENGE_COMPLETED: 'challenge_completed', // { tier }
  ONBOARDING_COMPLETED: 'onboarding_completed', // { starters }
  MILESTONE: 'milestone',                 // { days }
  BACKUP_EXPORTED: 'backup_exported',
  BACKUP_RESTORED: 'backup_restored',     // { mode }
  SHARE_CARD: 'share_card',               // { kind }
  PAYWALL_VIEWED: 'paywall_viewed',       // reserved for #40
};
