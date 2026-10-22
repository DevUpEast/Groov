// Launch hardening: no free limits or paywall entry points while purchases are not
// configured, and no dev tools in a production build.
const fs = require('fs');
const path = require('path');
const { freeTierAllows, paywallAvailable, stripProUpsell } = require('../freeTier');
const { resolveAppEnv, devToolsAllowedFor } = require('../appEnv');

const root = path.join(__dirname, '..', '..', '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

describe('free tier without purchases', () => {
  it('allows every add while purchases are not configured, whatever the count', () => {
    expect(freeTierAllows({ configured: false, isPro: false, count: 5, limit: 5 })).toBe(true);
    expect(freeTierAllows({ configured: false, isPro: false, count: 50, limit: 1 })).toBe(true);
    expect(paywallAvailable({ configured: false })).toBe(false);
  });
  it('applies the limits again once purchases are configured', () => {
    expect(freeTierAllows({ configured: true, isPro: false, count: 4, limit: 5 })).toBe(true);
    expect(freeTierAllows({ configured: true, isPro: false, count: 5, limit: 5 })).toBe(false);
    expect(freeTierAllows({ configured: true, isPro: true, count: 9, limit: 5 })).toBe(true);
    expect(paywallAvailable({ configured: true })).toBe(true);
  });
  it('drops the Pro upsell from an AI quota message only while there is nothing to buy', () => {
    const msg = 'Daily limit of 3 reflections reached. Groov Pro raises this limit.';
    expect(stripProUpsell(msg, { configured: false })).toBe('Daily limit of 3 reflections reached.');
    expect(stripProUpsell(msg, { configured: true })).toBe(msg);
    expect(stripProUpsell('', { configured: false })).toBe('');
  });
  it('every paywall entry point goes through the gate', () => {
    const ctx = read('src/context/AppContext.js');
    expect(ctx).toMatch(/const openPaywall = useCallback\(\(reason\) => \{\s*if \(paywallAvailable\(\{ configured: purchasesConfigured \}\)\)/);
    expect((ctx.match(/freeTierAllows\(\{ configured: purchasesConfigured/g) || []).length).toBe(2);
    expect(read('src/screens/SettingsScreen.js')).toMatch(/paywallAvailable\(\{ configured: purchasesConfigured \}\) && \(\s*<Section title=\{t\('settings\.pro\.title'\)\}/);
    expect(read('src/screens/ProgressScreen.js')).toMatch(/!isPro && paywallAvailable\(\{ configured: purchasesConfigured \}\)/);
  });
});

describe('app environment', () => {
  it('reads the EAS profile and treats an unknown build as production', () => {
    expect(resolveAppEnv('preview', false)).toBe('preview');
    expect(resolveAppEnv(' Production ', false)).toBe('production');
    expect(resolveAppEnv(undefined, false)).toBe('production');
    expect(resolveAppEnv('', true)).toBe('development');
  });
  it('allows dev tools only outside production', () => {
    expect(devToolsAllowedFor('production', false)).toBe(false);
    expect(devToolsAllowedFor('preview', false)).toBe(true);
    expect(devToolsAllowedFor('development', false)).toBe(true);
    expect(devToolsAllowedFor('production', true)).toBe(true);
  });
  it('every EAS build profile names its environment', () => {
    const eas = JSON.parse(read('eas.json'));
    expect(eas.build.production.env.EXPO_PUBLIC_APP_ENV).toBe('production');
    expect(eas.build.preview.env.EXPO_PUBLIC_APP_ENV).toBe('preview');
    expect(eas.build.development.env.EXPO_PUBLIC_APP_ENV).toBe('development');
  });
  it('the dev-mode unlock and load are gated', () => {
    expect(read('src/utils/devMode.js')).toMatch(/!devToolsAllowed\) return false/);
    const s = read('src/screens/SettingsScreen.js');
    expect(s).toMatch(/const showDevTools = devMode && devToolsAllowed;/);
    expect(s).toMatch(/if \(showDevTools \|\| !devToolsAllowed\) return;/);
  });
});

describe('expo-audio services plugin', () => {
  const { removeAudioServices, SERVICES } = require('../../../plugins/withoutAudioServices');
  it('marks both expo-audio services for removal from the merged manifest', () => {
    const m = removeAudioServices({ manifest: { $: {}, application: [{ service: [{ $: { 'android:name': 'other.Service' } }] }] } });
    const services = m.manifest.application[0].service;
    expect(services.map(s => s.$['android:name'])).toEqual(['other.Service', ...SERVICES]);
    expect(services.slice(1).every(s => s.$['tools:node'] === 'remove')).toBe(true);
    expect(m.manifest.$['xmlns:tools']).toBe('http://schemas.android.com/tools');
  });
});
