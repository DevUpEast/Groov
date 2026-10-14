// Conversions between the 12-hour { hour12, minute, ampm } shape used by the
// TimePicker and the 24-hour { hour, minute } shape notification triggers expect.

export const DEFAULT_TIME_12 = { hour12: 8, minute: 0, ampm: 'AM' };

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
