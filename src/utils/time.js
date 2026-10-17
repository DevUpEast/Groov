// Conversions between the 12-hour { hour12, minute, ampm } shape used by the
// TimePicker and the 24-hour { hour, minute } shape notification triggers expect.

const DEFAULT_TIME_12 = { hour12: 8, minute: 0, ampm: 'AM' };

export function to24h(time) {
  const t = time && time.hour12 !== undefined ? time : DEFAULT_TIME_12;
  let hour = t.hour12 % 12;
  if (t.ampm === 'PM') hour += 12;
  return { hour, minute: t.minute ?? 0 };
}

export function to12h(hour, minute = 0) {
  const h = ((hour % 24) + 24) % 24;
  return {
    hour12: h === 0 ? 12 : h > 12 ? h - 12 : h,
    minute,
    ampm: h >= 12 ? 'PM' : 'AM',
  };
}

export function formatTime12(time) {
  if (!time || time.hour12 === undefined) return '-';
  return `${time.hour12}:${String(time.minute ?? 0).padStart(2, '0')} ${time.ampm}`;
}

// The native time picker works in Date objects. timeToDate builds today's Date at the stored
// 12-hour time; from24h turns the picker's result (a Date, or an hour/minute pair) back into the
// stored { hour12, minute, ampm } shape. The default base is a fixed date with no DST transition,
// so a spring-forward day can never turn 2:30 into 3:30; both pickers ignore the date part.
export function timeToDate(time, base = new Date(2000, 0, 1)) {
  const { hour, minute } = to24h(time);
  const d = new Date(base.getTime());
  d.setHours(hour, minute, 0, 0);
  return d;
}

export function from24h(hourOrDate, minute = 0) {
  if (hourOrDate instanceof Date) return to12h(hourOrDate.getHours(), hourOrDate.getMinutes());
  return to12h(Math.trunc(hourOrDate) || 0, Math.min(59, Math.max(0, Math.trunc(minute) || 0)));
}

// Preview label that follows the device clock: "07:45" on a 24-hour device, "7:45 AM" otherwise.
export function formatTimeForClock(time, uses24h) {
  if (!time || time.hour12 === undefined) return '-';
  if (!uses24h) return formatTime12(time);
  const { hour, minute } = to24h(time);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
