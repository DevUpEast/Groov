// S-10 (review m3): pin the settings call sites in AppContext. Cloud or backup settings are
// always merged over local state with the two-argument migrateSettings; the one-argument
// form is allowed only for the cold-start load and for applyFeedbackSettings (columns only).
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'AppContext.js'), 'utf8');
const lines = src.split('\n');

test('no setSettings(migrateSettings(...)) replacement anywhere', () => {
  expect(src).not.toMatch(/setSettings\(\s*migrateSettings\(/);
});

test('both pull sites merge with the functional two-argument form', () => {
  expect(src).toContain('setSettings(prev => migrateSettings(cloudData.settings, prev))');
  expect(src).toContain('setSettings(prev => migrateSettings(delta.settings, prev))');
});

test('one-argument migrateSettings appears only in the cold-start load and applyFeedbackSettings', () => {
  const oneArg = lines.filter((l) => /migrateSettings\([^,()]+\)/.test(l) && !/applyFeedbackSettings\(migrateSettings\(/.test(l));
  expect(oneArg.map((l) => l.trim())).toEqual(['const loadedSettings = migrateSettings(s);']);
});

test('the badge migration runs in the load, before setLoaded(true)', () => {
  const start = src.indexOf('async function loadPersistedData');
  const load = src.slice(start, src.indexOf('setLoaded(true)', start));
  expect(load).toContain('migrateBadgeFlag(device, s !== null)');
  expect(load).toContain('await setDeviceSettings(badgePatch)');
});
