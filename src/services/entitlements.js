import { Platform } from 'react-native';
import { supabase } from '../utils/supabase';
import { t } from '../i18n';

// Groov Pro (#40). Source of truth for entitlement is `profiles.is_pro`, which the
// RevenueCat webhook (supabase/functions/revenuecat-webhook) flips on purchase,
// renewal and expiry. The client also asks RevenueCat directly when the SDK is
// configured so a fresh purchase unlocks immediately.
//
// Everything degrades gracefully without keys: purchases show a "coming soon"
// message and the app behaves as free tier.

// Plan copy is translated on read so the paywall follows the active locale.
export const PLANS = [
  { id: 'yearly', rcPackage: '$rc_annual', get title() { return t('paywall.plans.yearly.title'); }, get price() { return t('paywall.plans.yearly.price'); }, get note() { return t('paywall.plans.yearly.note'); }, get badge() { return t('paywall.plans.yearly.badge'); } },
  { id: 'lifetime', rcPackage: '$rc_lifetime', get title() { return t('paywall.plans.lifetime.title'); }, get price() { return t('paywall.plans.lifetime.price'); }, get note() { return t('paywall.plans.lifetime.note'); }, badge: null },
];

export const FREE_LIMITS = {
  habits: 5,          // active habits
  reminders: 1,       // global reminders (per-habit reminders stay free)
};

export const PRO_FEATURES = [
  { emoji: '♾️', key: 'unlimited', get text() { return t('paywall.features.unlimited'); } },
  { emoji: '🔔', key: 'reminders', get text() { return t('paywall.features.reminders'); } },
  { emoji: '✨', key: 'ai', get text() { return t('paywall.features.ai'); } },
  { emoji: '🎨', key: 'free', get text() { return t('paywall.features.free'); } },
];

const ENTITLEMENT_ID = 'pro';
const RC_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  default: null,
}) || '';

export const purchasesConfigured = RC_KEY.length > 0 && Platform.OS !== 'web';

let Purchases = null;
function sdk() {
  if (!purchasesConfigured) return null;
  if (!Purchases) {
    try { Purchases = require('react-native-purchases').default; } catch { Purchases = null; }
  }
  return Purchases;
}

let configuredFor = null;
export async function configurePurchases(userId) {
  const P = sdk();
  if (!P || !userId || configuredFor === userId) return;
  try {
    await P.configure({ apiKey: RC_KEY, appUserID: userId });
    configuredFor = userId;
  } catch (e) {
    if (__DEV__) console.warn('[purchases] configure failed:', e?.message);
  }
}

// Cloud flag (works everywhere, including web and without RevenueCat).
export async function fetchIsProFromCloud(userId) {
  if (!userId) return false;
  const { data } = await supabase.from('profiles').select('is_pro').eq('user_id', userId).maybeSingle();
  return !!data?.is_pro;
}

async function rcIsPro() {
  const P = sdk();
  if (!P || !configuredFor) return null;
  try {
    const info = await P.getCustomerInfo();
    return !!info?.entitlements?.active?.[ENTITLEMENT_ID];
  } catch { return null; }
}

export async function checkPro(userId) {
  const [cloud, rc] = await Promise.all([fetchIsProFromCloud(userId), rcIsPro()]);
  return !!(cloud || rc);
}

// Returns { ok: true } on purchase, { ok: false, cancelled } otherwise.
export async function purchasePlan(planId) {
  const P = sdk();
  if (!P || !configuredFor) {
    const e = new Error(t('paywall.errors.notConfigured'));
    e.code = 'not_configured';
    throw e;
  }
  const plan = PLANS.find(p => p.id === planId);
  const offerings = await P.getOfferings();
  const pkg = offerings?.current?.availablePackages?.find(p => p.identifier === plan?.rcPackage)
    || offerings?.current?.availablePackages?.[0];
  if (!pkg) throw new Error(t('paywall.errors.noProducts'));
  try {
    const { customerInfo } = await P.purchasePackage(pkg);
    return { ok: !!customerInfo?.entitlements?.active?.[ENTITLEMENT_ID] };
  } catch (e) {
    if (e?.userCancelled) return { ok: false, cancelled: true };
    throw e;
  }
}

export async function restorePurchases() {
  const P = sdk();
  if (!P || !configuredFor) return false;
  const info = await P.restorePurchases();
  return !!info?.entitlements?.active?.[ENTITLEMENT_ID];
}
