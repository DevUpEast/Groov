// C-06a: device-local dev flags (AsyncStorage `devFlags`, never settings).
let mockStored = null;
jest.mock('../storage', () => ({
  loadData: jest.fn(() => Promise.resolve(mockStored)),
  saveData: jest.fn(() => Promise.resolve()),
}));
const storage = require('../storage');
const flags = require('../devFlags');

beforeEach(() => { flags.__resetDevFlagsForTests(); mockStored = null; storage.saveData.mockClear(); storage.loadData.mockClear(); });

test('choreography is on by default, before and without a stored value', async () => {
  expect(flags.getDevFlag('choreography')).toBe(true);
  await flags.loadDevFlags();
  expect(flags.getDevFlag('choreography')).toBe(true);
  expect(storage.loadData).toHaveBeenCalledWith('devFlags');
});

test('a stored value wins; unknown keys and non-booleans are ignored', async () => {
  mockStored = { choreography: false, other: true };
  await flags.loadDevFlags();
  expect(flags.getDevFlag('choreography')).toBe(false);
  flags.__resetDevFlagsForTests();
  mockStored = { choreography: 'no' };
  await flags.loadDevFlags();
  expect(flags.getDevFlag('choreography')).toBe(true);
});

test('setDevFlag saves under devFlags only, and ignores unknown flags', () => {
  flags.setDevFlag('choreography', false);
  expect(flags.getDevFlag('choreography')).toBe(false);
  expect(storage.saveData).toHaveBeenCalledWith('devFlags', { choreography: false });
  flags.setDevFlag('nope', true);
  expect(storage.saveData).toHaveBeenCalledTimes(1);
});
