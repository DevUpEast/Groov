import { getCalendars } from 'expo-localization';

// True when the device clock is set to 24-hour time ("07:45" rather than "7:45 AM").
export function usesDevice24hClock() {
  try {
    return getCalendars()[0]?.uses24hourClock === true;
  } catch {
    return false;
  }
}
