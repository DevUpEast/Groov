// Source checks for the shared Dialog (S-04). TalkBack is not on the AVD by default, so the
// modal semantics are asserted on the source rather than on a running screen reader.
const fs = require('fs');
const path = require('path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', '..', rel), 'utf8');
const dialog = read('components/ui/Dialog.js');
const settings = read('screens/SettingsScreen.js');

describe('Dialog', () => {
  it('is a transparent fade Modal that covers the status and navigation bars', () => {
    expect(dialog).toMatch(/<Modal[\s\S]*?transparent[\s\S]*?animationType="fade"/);
    expect(dialog).toMatch(/statusBarTranslucent/);
    expect(dialog).toMatch(/navigationBarTranslucent/);
  });

  it('routes Android back through onRequestClose and honours dismissable', () => {
    expect(dialog).toMatch(/onRequestClose=\{requestClose\}/);
    expect(dialog).toMatch(/const requestClose = \(\) => \{ if \(dismissable\) onClose\?\.\(\); \}/);
  });

  it('is announced as a modal with a header title', () => {
    expect(dialog).toMatch(/accessibilityViewIsModal/);
    expect(dialog).toMatch(/accessibilityRole="header"/);
  });

  it('avoids the keyboard (iOS padding, Android height)', () => {
    expect(dialog).toMatch(/KeyboardAvoidingView[\s\S]*?behavior=\{Platform\.OS === 'ios' \? 'padding' : 'height'\}/);
  });

  it('gives every action button a role and name', () => {
    expect(dialog).toMatch(/accessibilityRole="button"/);
    expect(dialog).toMatch(/accessibilityLabel=\{a\.accessibilityLabel \?\? a\.label\}/);
  });
});

describe('SettingsScreen dialogs', () => {
  it('uses Dialog for all four overlays and no longer has the absolute overlay', () => {
    expect((settings.match(/<Dialog\b/g) || []).length).toBe(4);
    expect(settings).not.toMatch(/devModal/);
    expect(settings).not.toMatch(/zIndex: 999/);
  });
});
