// F-09b: the dirty guards of the habit and challenge forms (pure).
import { BLANK_FORM, formFromHabit, isFormDirty, pickAccent } from '../habitForm';
import { challengeFormDirty } from '../challenges';

const habit = {
  id: 'h1', name: 'Read', icon: '📚', type: 'volume', volumeGoal: 3, color: '#EAB308',
  schedule: { type: 'weekdays', days: [1, 3, 5] }, timeOfDay: 'evening', unit: 'pages', intention: null, customIconUri: null,
};

describe('isFormDirty (habit form)', () => {
  it('is clean as opened, new or edit', () => {
    expect(isFormDirty(BLANK_FORM, { ...BLANK_FORM })).toBe(false);
    expect(isFormDirty(formFromHabit(habit), formFromHabit(habit))).toBe(false);
  });
  it('typing and deleting again is not an edit; a missing and an empty field match', () => {
    const f = formFromHabit(habit);
    expect(isFormDirty(f, { ...f, name: 'Read' })).toBe(false);
    expect(isFormDirty({ ...f, intention: '' }, { ...f, intention: undefined })).toBe(false);
  });
  it('sees each kind of edit', () => {
    const f = formFromHabit(habit);
    expect(isFormDirty(f, { ...f, name: 'Read more' })).toBe(true);
    expect(isFormDirty(f, { ...f, volumeGoal: 4 })).toBe(true);
    expect(isFormDirty(f, pickAccent(f, 'teal'))).toBe(true);
    expect(isFormDirty(f, { ...f, schedule: { type: 'weekdays', days: [1, 3] } })).toBe(true);
    expect(isFormDirty(f, { ...f, schedule: { type: 'daily' } })).toBe(true);
    expect(isFormDirty(f, { ...f, customIconUri: 'file:///x.jpg', icon: null })).toBe(true);
  });
});

describe('challengeFormDirty', () => {
  const opened = { name: '7-Day Strong', description: '', icon: '🏆', days: 7, linkedHabitIds: ['a', 'b'] };
  it('is clean as opened, and when the same habits are linked in another order', () => {
    expect(challengeFormDirty(opened, { ...opened })).toBe(false);
    expect(challengeFormDirty(opened, { ...opened, linkedHabitIds: ['b', 'a'] })).toBe(false);
    expect(challengeFormDirty(null, opened)).toBe(false);
  });
  it('sees each kind of edit', () => {
    expect(challengeFormDirty(opened, { ...opened, name: '7-Day' })).toBe(true);
    expect(challengeFormDirty(opened, { ...opened, description: 'Go' })).toBe(true);
    expect(challengeFormDirty(opened, { ...opened, icon: '🔥' })).toBe(true);
    expect(challengeFormDirty(opened, { ...opened, days: 8 })).toBe(true);
    expect(challengeFormDirty(opened, { ...opened, linkedHabitIds: ['a'] })).toBe(true);
    expect(challengeFormDirty(opened, { ...opened, linkedHabitIds: ['a', 'c'] })).toBe(true);
  });
});
