// Expo config plugin: drop expo-audio's two Android services (launch hardening).
//
// expo-audio's library manifest declares AudioControlsService (foregroundServiceType
// mediaPlayback, lock-screen controls) and AudioRecordingService (microphone). Groov only
// plays short in-app feedback sounds: it never calls setActiveForLockScreen and never
// records, so neither service is ever started (AudioControlsService.clearSession() is a
// no-op without a running instance). Declaring them makes Google Play ask for a foreground
// service declaration for a feature the app does not have, so the merged manifest removes
// them; app.json blocks the matching FOREGROUND_SERVICE* permissions.
//
// If Groov ever adds background playback or recording, delete this plugin.
const { withAndroidManifest } = require('expo/config-plugins');

const SERVICES = [
  'expo.modules.audio.service.AudioControlsService',
  'expo.modules.audio.service.AudioRecordingService',
];

function removeAudioServices(manifest) {
  const root = manifest.manifest;
  root.$ = root.$ || {};
  root.$['xmlns:tools'] = root.$['xmlns:tools'] || 'http://schemas.android.com/tools';
  const app = root.application?.[0];
  if (!app) return manifest;
  app.service = (app.service || []).filter(s => !SERVICES.includes(s.$?.['android:name']));
  for (const name of SERVICES) {
    app.service.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
  }
  return manifest;
}

const withoutAudioServices = (config) =>
  withAndroidManifest(config, (cfg) => {
    cfg.modResults = removeAudioServices(cfg.modResults);
    return cfg;
  });

module.exports = withoutAudioServices;
module.exports.removeAudioServices = removeAudioServices;
module.exports.SERVICES = SERVICES;
