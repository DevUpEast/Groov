import { daysBetween } from './dates';

// Whole days elapsed since the challenge started (0 on the start day).
export function daysSinceStart(challenge, today) {
  if (!challenge?.startDate) return 0;
  return Math.max(0, daysBetween(challenge.startDate, today));
}

// 1-based day number shown to the user, clamped to the challenge length.
export function currentChallengeDay(challenge, today) {
  return Math.min(challenge.days, daysSinceStart(challenge, today) + 1);
}

// True once the challenge window has fully elapsed (today is after its last day).
export function isChallengeExpired(challenge, today) {
  return daysSinceStart(challenge, today) >= challenge.days;
}
