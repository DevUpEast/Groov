// Mirror of src/utils/schedule.js for the edge functions. A habit's `schedule` column
// is null for "every day"; weekday schedules list JS weekday numbers (0 = Sunday);
// perWeek schedules ask for N completions in a Mon-Sun week on any days.
export type Schedule =
  | { type: 'daily' }
  | { type: 'weekdays'; days: number[] }
  | { type: 'perWeek'; target: number }

export function normalizeSchedule(raw: unknown): Schedule {
  const s = raw as { type?: string; days?: unknown; target?: unknown } | null
  if (!s || typeof s !== 'object') return { type: 'daily' }
  if (s.type === 'weekdays' && Array.isArray(s.days)) {
    const days = [...new Set(s.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))] as number[]
    return days.length === 0 || days.length === 7 ? { type: 'daily' } : { type: 'weekdays', days }
  }
  if (s.type === 'perWeek') {
    const target = Math.min(6, Math.max(1, Math.round(Number(s.target) || 1)))
    return { type: 'perWeek', target }
  }
  return { type: 'daily' }
}

export function describeSchedule(s: Schedule): string {
  if (s.type === 'daily') return 'every day'
  if (s.type === 'perWeek') return `${s.target}x per week (any days)`
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return `on ${s.days.map((d) => names[d]).join('/')}`
}

// Days between `start` and `end` (inclusive, 'YYYY-MM-DD' at local midnight) on which the
// habit is expected. perWeek habits are measured per week: target x number of weeks
// touched by the window, capped at the number of days in the window.
export function expectedDays(s: Schedule, start: Date, end: Date): number {
  let total = 0
  const d = new Date(start)
  while (d <= end) {
    if (s.type === 'daily') total++
    else if (s.type === 'weekdays') { if (s.days.includes(d.getDay())) total++ }
    else total++ // perWeek: handled below
    d.setDate(d.getDate() + 1)
  }
  if (s.type === 'perWeek') {
    const weeks = Math.max(1, Math.ceil(total / 7))
    return Math.min(total, weeks * s.target)
  }
  return total
}

export function isScheduledOn(s: Schedule, d: Date): boolean {
  if (s.type === 'weekdays') return s.days.includes(d.getDay())
  return true
}
