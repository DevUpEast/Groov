// Every date key in Groov is a LOCAL calendar date formatted YYYY-MM-DD.
//
// Never derive a key from `toISOString()`: that is UTC, so between local midnight and
// UTC midnight (or the other way round, depending on the timezone) it names the wrong
// day. That is the classic cause of "my streak reset at 7pm" bugs. Build keys with the
// helpers here instead, and convert a key back to a Date with `parseDateKey`.

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const pad2 = (n) => String(n).padStart(2, '0');

// Date -> 'YYYY-MM-DD' using the device's local calendar.
export function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Today's key, shifted by `offsetDays` (the Settings dev-tool date offset).
export function todayKey(offsetDays = 0) {
  const d = new Date();
  if (offsetDays) d.setDate(d.getDate() + offsetDays);
  return localDateKey(d);
}

export function isDateKey(value) {
  return typeof value === 'string' && DATE_KEY_RE.test(value);
}

// 'YYYY-MM-DD' -> Date at local noon. Noon (not midnight) so that adding or
// subtracting whole days with setDate() can never land on the wrong side of a
// DST transition.
export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

// Shift a key by a whole number of calendar days.
export function addDays(key, n) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return localDateKey(d);
}

// Whole calendar days from `fromKey` to `toKey` (positive when `toKey` is later).
export function daysBetween(fromKey, toKey) {
  const ms = parseDateKey(toKey).getTime() - parseDateKey(fromKey).getTime();
  return Math.round(ms / 86400000);
}

// Local Date for a key at the given wall-clock hour:minute, e.g. for scheduling a
// one-off notification "today at 20:00".
export function dateAt(key, hour, minute = 0) {
  const d = parseDateKey(key);
  d.setHours(hour, minute, 0, 0);
  return d;
}
