// C-06b round 2 (the 8 -> 7 loss): user data goes to AsyncStorage at once. Only network
// upserts and the widget / badge / reminder / analytics work wait for the check-off moment
// (afterMoment); a force-stop or an OOM kill never runs the background flush.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.resolve(__dirname, '../AppContext.js'), 'utf8');

test('no AsyncStorage save is deferred behind the moment', () => {
  expect(src).not.toMatch(/afterMoment\(\s*`save:/);
  expect(src).not.toMatch(/afterMoment\([^)]*saveData/);
  expect(src).toMatch(/const persist = \(key, value\) => saveData\(key, value\);/);
});

test('pending cloud upserts are re-sent before the login pull', () => {
  const resend = src.indexOf('resendPendingUpserts(syncCompletion, userId)');
  const pull = src.indexOf('await pullAllData(userId)');
  expect(resend).toBeGreaterThan(0);
  expect(resend).toBeLessThan(pull);
});
