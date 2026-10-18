// Expo config plugin: apply a system font-size change to the running app on Android (#190).
//
// TEMPORARY: delete this plugin (and its app.json entry and test) once the installed React
// Native defaults `enableFontScaleChangesUpdatingLayout` to true for OSS stable builds
// (ReactCommon/react/featureflags/ReactNativeFeatureFlagsDefaults.h). Keep the fontScale
// configChanges entry only if that release still recreates the activity on a font change.
//
// Root cause. A cold start is always right: React Native scales both fontSize and lineHeight
// with the system font scale (Android's own non-linear sp curve, TypedValue.applyDimension),
// so the type tokens need no JS-side scaling. The bug is a font-size change while Groov is
// alive. Fabric caches each text measurement by the text and its style, and the font scale
// only joins that cache key (LayoutContext.fontSizeMultiplier) when the React Native feature
// flag `enableFontScaleChangesUpdatingLayout` is on. It is off in the 0.81 OSS stable release.
// So after the change the native views draw every unchanged string at the new size inside a
// box measured at the old one: descenders clip and line ends are cut off ("habi" for "habits",
// tab labels "To…", the greeting loses its last word). Only strings that change afterwards
// are measured again.
//
// Fix, in two parts:
// 1. MainApplication turns the flag on, right after `loadReactNative` has installed the
//    release-level defaults and before anything reads a flag. The surface then passes the
//    current font scale to Fabric on every measure, and SurfaceHandler marks every text node
//    dirty when it changes, so all text is measured again at the new size.
// 2. MainActivity handles `fontScale` in android:configChanges, so Android delivers the change
//    to the live activity (ReactHost.onConfigurationChanged, which the same flag gates)
//    instead of recreating it around the surviving React instance.
const { withAndroidManifest, withMainApplication, AndroidConfig } = require('expo/config-plugins');

const MARKER = '// groov:font-scale-layout (#190)';

function addConfigChanges(value) {
  const parts = String(value || '').split('|').map((s) => s.trim()).filter(Boolean);
  if (!parts.includes('fontScale')) parts.push('fontScale');
  return parts.join('|');
}

const IMPORTS = [
  'import android.util.Log',
  'import com.facebook.react.internal.featureflags.ReactNativeFeatureFlags',
  'import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsOverrides_RNOSS_Canary_Android',
  'import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsOverrides_RNOSS_Experimental_Android',
  'import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsOverrides_RNOSS_Stable_Android',
  'import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsProvider',
];

// Mirrors DefaultNewArchitectureEntryPoint.load() (the provider `loadReactNative` installs on
// the new architecture, the only case it overrides flags) and changes only the one flag. On
// the old architecture `loadReactNative` installs no override, so the block is skipped and the
// flag (a Fabric-only path) stays at its default. Nothing has read a flag yet at this point,
// so the forced override is equivalent to the one `load()` made; if something did, it is logged.
const OVERRIDE = `    ${MARKER}
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      val groovFlagBase: ReactNativeFeatureFlagsProvider = when (DefaultNewArchitectureEntryPoint.releaseLevel) {
        ReleaseLevel.EXPERIMENTAL -> ReactNativeFeatureFlagsOverrides_RNOSS_Experimental_Android()
        ReleaseLevel.CANARY -> ReactNativeFeatureFlagsOverrides_RNOSS_Canary_Android()
        else -> ReactNativeFeatureFlagsOverrides_RNOSS_Stable_Android(true, true, true)
      }
      val groovFlagsReadEarly = ReactNativeFeatureFlags.dangerouslyForceOverride(
          object : ReactNativeFeatureFlagsProvider by groovFlagBase {
            override fun enableFontScaleChangesUpdatingLayout(): Boolean = true
          })
      if (!groovFlagsReadEarly.isNullOrEmpty()) {
        Log.w("Groov", "Feature flags read before the font-scale override: $groovFlagsReadEarly")
      }
    }
`;

// Pure transform of MainApplication.kt (exported for the jest test).
function addFontScaleFlag(src) {
  if (src.includes(MARKER)) return src;
  let out = src.replace(/\r\n/g, '\n');
  const load = /(\n[ \t]*loadReactNative\(this\)\n)/;
  if (!load.test(out)) throw new Error('withFontScaleConfigChange: MainApplication has no loadReactNative(this) call');
  for (const need of ['DefaultNewArchitectureEntryPoint', 'ReleaseLevel']) {
    if (!new RegExp(`import [\\w.]+\\.${need}\\n`).test(out)) {
      throw new Error(`withFontScaleConfigChange: MainApplication does not import ${need}`);
    }
  }
  const missing = IMPORTS.filter((imp) => !out.includes(`${imp}\n`));
  if (missing.length) {
    if (!/^package [^\n]+\n/m.test(out)) throw new Error('withFontScaleConfigChange: MainApplication has no package line');
    out = out.replace(/^(package [^\n]+\n)/m, `$1\n${missing.join('\n')}\n`);
  }
  return out.replace(load, `$1${OVERRIDE}`);
}

function withFontScaleConfigChange(config) {
  config = withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    activity.$['android:configChanges'] = addConfigChanges(activity.$['android:configChanges']);
    return cfg;
  });
  return withMainApplication(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') {
      throw new Error('withFontScaleConfigChange: expected a Kotlin MainApplication');
    }
    cfg.modResults.contents = addFontScaleFlag(cfg.modResults.contents);
    return cfg;
  });
}

module.exports = withFontScaleConfigChange;
module.exports.addConfigChanges = addConfigChanges;
module.exports.addFontScaleFlag = addFontScaleFlag;
module.exports.MARKER = MARKER;
