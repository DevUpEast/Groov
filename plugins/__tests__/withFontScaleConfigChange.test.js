/** @jest-environment node */
// #190: the config plugin that makes Android apply a system font-size change to the live app.
const { addConfigChanges, addFontScaleFlag, MARKER } = require('../withFontScaleConfigChange');

// The MainApplication.kt that `expo prebuild` generates for SDK 54 (trimmed).
const MAIN_APPLICATION = [
  'package com.beastlyiceking.groov',
  '',
  'import android.app.Application',
  'import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative',
  'import com.facebook.react.common.ReleaseLevel',
  'import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint',
  '',
  'class MainApplication : Application(), ReactApplication {',
  '  override fun onCreate() {',
  '    super.onCreate()',
  '    DefaultNewArchitectureEntryPoint.releaseLevel = ReleaseLevel.STABLE',
  '    loadReactNative(this)',
  '    ApplicationLifecycleDispatcher.onApplicationCreate(this)',
  '  }',
  '}',
  '',
].join('\n');

describe('addConfigChanges', () => {
  it('appends fontScale to the existing list', () => {
    expect(addConfigChanges('keyboard|orientation|uiMode')).toBe('keyboard|orientation|uiMode|fontScale');
  });

  it('is idempotent', () => {
    expect(addConfigChanges('uiMode|fontScale')).toBe('uiMode|fontScale');
  });

  it('works with no attribute', () => {
    expect(addConfigChanges(undefined)).toBe('fontScale');
  });
});

describe('addFontScaleFlag', () => {
  const out = addFontScaleFlag(MAIN_APPLICATION);

  it('turns on enableFontScaleChangesUpdatingLayout and nothing else', () => {
    expect(out).toContain('override fun enableFontScaleChangesUpdatingLayout(): Boolean = true');
    expect(out.match(/override fun \w+\(\)/g)).toEqual(['override fun onCreate()', 'override fun enableFontScaleChangesUpdatingLayout()']);
    expect(out).toContain('object : ReactNativeFeatureFlagsProvider by groovFlagBase');
  });

  it('runs right after loadReactNative and before the lifecycle dispatcher', () => {
    const load = out.indexOf('loadReactNative(this)');
    const flag = out.indexOf(MARKER);
    const dispatcher = out.indexOf('ApplicationLifecycleDispatcher.onApplicationCreate');
    expect(load).toBeGreaterThan(0);
    expect(flag).toBeGreaterThan(load);
    expect(dispatcher).toBeGreaterThan(flag);
  });

  it('keeps the release-level defaults loadReactNative installed (stable: new arch on)', () => {
    expect(out).toContain('else -> ReactNativeFeatureFlagsOverrides_RNOSS_Stable_Android(true, true, true)');
    expect(out).toContain('ReleaseLevel.CANARY -> ReactNativeFeatureFlagsOverrides_RNOSS_Canary_Android()');
  });

  it('adds each import once, after the package line', () => {
    expect(out.split('\n')[2]).toBe('import android.util.Log');
    expect(out.match(/import com\.facebook\.react\.internal\.featureflags\.ReactNativeFeatureFlags\n/g)).toHaveLength(1);
  });

  it('keeps braces balanced', () => {
    expect((out.match(/{/g) || []).length).toBe((out.match(/}/g) || []).length);
  });

  it('is idempotent', () => {
    expect(addFontScaleFlag(out)).toBe(out);
  });

  it('accepts CRLF input', () => {
    expect(addFontScaleFlag(MAIN_APPLICATION.replace(/\n/g, '\r\n'))).toBe(out);
  });

  it('fails loudly when the template changes shape', () => {
    expect(() => addFontScaleFlag(MAIN_APPLICATION.replace('    loadReactNative(this)\n', ''))).toThrow(/loadReactNative/);
    expect(() => addFontScaleFlag(MAIN_APPLICATION.replace('import com.facebook.react.common.ReleaseLevel\n', ''))).toThrow(/ReleaseLevel/);
  });
});
