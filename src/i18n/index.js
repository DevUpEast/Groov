// Localization (#39). One i18n-js instance for the whole app.
//
//   t(key, params)      translate; `%{name}` interpolation, `{ one, other }` plurals via `count`
//   getLocale()         active locale code ('en' | 'es' | 'de' | 'fr' | 'pt-BR' | 'ja')
//   setLocale(code)     switch at runtime and persist the choice (null = follow the device)
//   initLocale()        apply the persisted choice; awaited before the first paint
//   useLocale()         hook that re-renders the caller when the locale changes
//
// The device locale (expo-localization) is matched against SUPPORTED_LOCALES, falling
// back to English. An explicit choice lives under the AsyncStorage key `locale`.
import { useSyncExternalStore } from 'react';
import { I18n } from 'i18n-js';
import en from './locales/en.json';
import es from './locales/es.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import ptBR from './locales/pt-BR.json';
import ja from './locales/ja.json';

export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'ja', label: '日本語' },
];

export const LOCALE_STORAGE_KEY = 'locale';
export const DEFAULT_LOCALE = 'en';

export const i18n = new I18n({ en, es, de, fr, 'pt-BR': ptBR, ja });
i18n.defaultLocale = DEFAULT_LOCALE;
i18n.enableFallback = true;
i18n.missingBehavior = 'message';

// Plural categories per language (i18n-js only ships English rules by default).
// Keys: 'zero' when a translation provides it and count is 0, then 'one' / 'other'.
const oneIsOne = (_i18n, count) => [count === 0 ? 'zero' : '', count === 1 ? 'one' : 'other'].filter(Boolean);
const oneIsZeroOrOne = (_i18n, count) => [count === 0 ? 'zero' : '', count === 0 || count === 1 ? 'one' : 'other'].filter(Boolean);
const noPlural = (_i18n, count) => [count === 0 ? 'zero' : '', 'other'].filter(Boolean);
i18n.pluralization.register('es', oneIsOne);
i18n.pluralization.register('de', oneIsOne);
i18n.pluralization.register('fr', oneIsZeroOrOne);
i18n.pluralization.register('pt-BR', oneIsZeroOrOne);
i18n.pluralization.register('pt', oneIsZeroOrOne);
i18n.pluralization.register('ja', noPlural);

// Best supported match for a BCP 47 tag: exact, then same language (pt-PT -> pt-BR).
export function matchSupportedLocale(tag) {
  if (!tag || typeof tag !== 'string') return null;
  const lower = tag.toLowerCase();
  const exact = SUPPORTED_LOCALES.find(l => l.code.toLowerCase() === lower);
  if (exact) return exact.code;
  const lang = lower.split(/[-_]/)[0];
  const byLang = SUPPORTED_LOCALES.find(l => l.code.toLowerCase().split('-')[0] === lang);
  return byLang ? byLang.code : null;
}

// AsyncStorage is required lazily too: the pure utils (schedule, habits, ...) import
// this module and their Jest suites must not pull in a native module.
function storage() {
  return require('../utils/storage');
}

export function deviceLocale() {
  try {
    // Required lazily so the module (and its tests) never depend on the native module.
    const { getLocales } = require('expo-localization');
    const list = typeof getLocales === 'function' ? getLocales() : null;
    const first = Array.isArray(list) ? list[0] : null;
    return matchSupportedLocale(first?.languageTag || first?.languageCode) || DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

// `preference` is the explicit user choice (null = system). The active locale is
// derived from it so switching back to "System default" works without a reload.
let preference = null;
let listeners = new Set();
let snapshot = { locale: DEFAULT_LOCALE, preference: null };

function apply(nextPreference) {
  preference = nextPreference && matchSupportedLocale(nextPreference) ? matchSupportedLocale(nextPreference) : null;
  const locale = preference || deviceLocale();
  i18n.locale = locale;
  snapshot = { locale, preference };
  listeners.forEach(fn => { try { fn(); } catch {} });
}

apply(null);

export function getLocale() {
  return i18n.locale;
}

export function getLocalePreference() {
  return preference;
}

// Switch the UI language. `code` is a supported code, or null to follow the device.
export async function setLocale(code) {
  apply(code);
  try {
    await storage().saveData(LOCALE_STORAGE_KEY, preference);
  } catch {}
}

let initPromise = null;
// Load the persisted choice once. Safe to call repeatedly (App root, widget task).
export function initLocale() {
  if (!initPromise) {
    initPromise = Promise.resolve()
      .then(() => storage().loadData(LOCALE_STORAGE_KEY))
      .then(saved => {
        // iOS mockup host (web, `?lang=de`): render this page load in that language without
        // persisting it. Required lazily so native and Jest never load the mockup module.
        let override = null;
        try { override = matchSupportedLocale(require('../utils/mockup').mockupParams.lang); } catch {}
        apply(override || (typeof saved === 'string' ? saved : null));
      })
      .catch(() => {});
  }
  return initPromise;
}

export function t(key, params) {
  return i18n.t(key, params);
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const getSnapshot = () => snapshot;

// Re-renders the component whenever the locale changes, so `t()` calls made during
// render pick up the new language without a restart.
export function useLocale() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { locale: snap.locale, preference: snap.preference, setLocale };
}
