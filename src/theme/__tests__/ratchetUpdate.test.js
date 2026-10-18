// The ratchet update path (F-01 m3): UPDATE_RATCHET=1 may only lower a baseline.
const { diffCounts, loweredBaseline } = require('./ratchet');

describe('ratchet baseline updates', () => {
  const baseline = { 'a.js': 3, 'b.js': 2 };

  it('takes lowered counts and drops files that reached 0', () => {
    expect(loweredBaseline({ 'a.js': 1, 'b.js': 2 }, baseline)).toEqual({ 'a.js': 1, 'b.js': 2 });
    expect(loweredBaseline({ 'a.js': 3 }, baseline)).toEqual({ 'a.js': 3 });
  });

  it('refuses when any count grew, even if others fell', () => {
    expect(loweredBaseline({ 'a.js': 4, 'b.js': 0 }, baseline)).toBeNull();
    expect(loweredBaseline({ 'a.js': 1, 'b.js': 2, 'new.js': 1 }, baseline)).toBeNull();
  });

  it('lists the files that grew and fell', () => {
    expect(diffCounts({ 'a.js': 4, 'c.js': 1 }, baseline)).toEqual({
      grown: ['a.js: 3 -> 4', 'c.js: 0 -> 1'],
      fallen: ['b.js: 2 -> 0'],
    });
  });
});
