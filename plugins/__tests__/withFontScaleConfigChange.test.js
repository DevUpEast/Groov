/** @jest-environment node */
// #190: the config plugin that makes Android apply a system font-size change to the live app.
const fs = require('fs');
const path = require('path');
const { addConfigChanges, addFontScaleFlag, MARKER } = require('../withFontScaleConfigChange');

// The MainApplication.kt that `expo prebuild` generates for this app on SDK 54 (verbatim copy).
const MAIN_APPLICATION = fs.readFileSync(path.join(__dirname, 'fixtures', 'MainApplication.sdk54.kt'), 'utf8').replace(/\r\n/g, '\n');

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
  const block = out.slice(out.indexOf(MARKER), out.indexOf('ApplicationLifecycleDispatcher.onApplicationCreate'));

  it('turns on enableFontScaleChangesUpdatingLayout and nothing else', () => {
    expect(out).toContain('override fun enableFontScaleChangesUpdatingLayout(): Boolean = true');
    const added = (out.match(/override (fun|val) \w+/g) || []).filter((m) => !MAIN_APPLICATION.includes(m));
    expect(added).toEqual(['override fun enableFontScaleChangesUpdatingLayout']);
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

  it('only overrides flags on the new architecture (old arch installs no override)', () => {
    expect(block).toMatch(/^\/\/ groov:font-scale-layout \(#190\)\n {4}if \(BuildConfig\.IS_NEW_ARCHITECTURE_ENABLED\) \{\n/);
    expect(block.indexOf('dangerouslyForceOverride')).toBeGreaterThan(block.indexOf('IS_NEW_ARCHITECTURE_ENABLED'));
    expect(block.trimEnd().endsWith('}')).toBe(true);
    expect((block.match(/{/g) || []).length).toBe((block.match(/}/g) || []).length);
  });

  it('keeps the release-level defaults loadReactNative installed (stable: new arch on)', () => {
    expect(block).toContain('else -> ReactNativeFeatureFlagsOverrides_RNOSS_Stable_Android(true, true, true)');
    expect(block).toContain('ReleaseLevel.CANARY -> ReactNativeFeatureFlagsOverrides_RNOSS_Canary_Android()');
  });

  it('adds each import once, after the package line, and keeps the existing ones', () => {
    expect(out.split('\n')[2]).toBe('import android.util.Log');
    expect(out.match(/import com\.facebook\.react\.internal\.featureflags\.ReactNativeFeatureFlags\n/g)).toHaveLength(1);
    for (const line of MAIN_APPLICATION.split('\n').filter((l) => l.startsWith('import '))) {
      expect(out).toContain(`${line}\n`);
    }
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
    expect(() => addFontScaleFlag(MAIN_APPLICATION.replace('import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint\n', ''))).toThrow(/DefaultNewArchitectureEntryPoint/);
  });
});
