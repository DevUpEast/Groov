jest.mock('../../utils/supabase', () => ({ supabase: { auth: {}, functions: {} } }));

const { cleanMessage } = require('../aiCoaching');

describe('cleanMessage (#194)', () => {
  it('turns an empty or whitespace-only message into null', () => {
    expect(cleanMessage({ message: '', cached: true }).message).toBeNull();
    expect(cleanMessage({ message: '  \n ', cached: true }).message).toBeNull();
    expect(cleanMessage({ message: null }).message).toBeNull();
    expect(cleanMessage({ cached: true }).message).toBeNull();
  });

  it('keeps real text, trimmed and without long dashes', () => {
    expect(cleanMessage({ message: '  Five of seven days — nice.  ' }).message).toBe('Five of seven days, nice.');
  });

  it('keeps other fields and passes non-objects through', () => {
    expect(cleanMessage({ message: 'Hi', cached: false, generatedAt: 'x' })).toEqual({ message: 'Hi', cached: false, generatedAt: 'x' });
    expect(cleanMessage(null)).toBeNull();
  });
});
