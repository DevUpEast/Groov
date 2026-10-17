// Pure helpers for the Android home-screen widget (#35). The widget task runs in a
// headless JS context with no React tree, so it reads the same AsyncStorage keys the
// app persists and derives "today" here. Kept free of React so it is unit-testable.
import { loadData, saveData } from '../utils/storage';
import { localDateKey } from '../utils/dates';
import { isScheduledOn, isSatisfiedOn, normalizeSchedule } from '../utils/schedule';
import { isHabitDoneOnDay } from '../utils/dayStatus';

export const WIDGET_NAME = 'GroovToday';
export const MAX_WIDGET_ROWS = 8;

// Rows that fit a widget of `heightDp`: 14dp padding top/bottom, a ~34dp header, then
// ~38dp per row (6dp padding, 22dp box, 1dp border, text). Leaves room for the
// "+N more" footer when the list is cut.
export function rowsForHeight(heightDp) {
  const h = Number(heightDp) || 110;
  return Math.max(1, Math.min(MAX_WIDGET_ROWS, Math.floor((h - 28 - 34) / 36)));
}

// Snapshot of today's habits for rendering: [{ id, name, icon, done, count, goal, type }]
export async function loadTodayForWidget(today = localDateKey()) {
  const [habits, completions, settings] = await Promise.all([
    loadData('habits'), loadData('completions'), loadData('settings'),
  ]);
  return buildTodayModel(habits || [], completions || {}, settings || {}, today);
}

export function buildTodayModel(habits, completions, settings, today) {
  const todayMap = completions[today] || {};
  const active = habits
    .filter(h => !h.archived && isScheduledOn(normalizeSchedule(h.schedule), today))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  const rows = active.map(h => {
    const count = todayMap[h.id] || 0;
    const doneOn = (k) => isHabitDoneOnDay(h, k, completions) === true;
    return {
      id: h.id,
      name: h.name,
      icon: h.customIconUri ? '⭐' : (h.icon || '⭐'),
      color: h.color || null,
      type: h.type || 'daily',
      count,
      goal: h.volumeGoal || 1,
      done: isSatisfiedOn(normalizeSchedule(h.schedule), today, doneOn),
    };
  });
  const done = rows.filter(r => r.done).length;
  return {
    today,
    rows,
    done,
    total: rows.length,
    theme: settings?.theme === 'dark' ? 'dark' : settings?.theme === 'light' ? 'light' : 'system',
  };
}

// Apply a widget tap: daily/quit toggle, counters add one (never below zero). Writes
// AsyncStorage directly so the app picks it up on next launch/foreground; the app's
// own sync pushes it to Supabase when it loads.
export async function applyWidgetToggle(habitId, today = localDateKey()) {
  const [habits, completions] = await Promise.all([loadData('habits'), loadData('completions')]);
  const habit = (habits || []).find(h => h.id === habitId);
  if (!habit) return null;
  const next = { ...(completions || {}) };
  const day = { ...(next[today] || {}) };
  const current = day[habitId] || 0;
  const counter = habit.type === 'volume' || habit.type === 'timed' || habit.type === 'atMost';
  let value;
  if (counter) value = current + (habit.type === 'timed' ? 5 : 1);
  else value = current >= 1 ? 0 : 1;
  if (value > 0) day[habitId] = value; else delete day[habitId];
  if (Object.keys(day).length) next[today] = day; else delete next[today];
  await saveData('completions', next);
  // Flag for the app so it can sync this change when it wakes up.
  const pending = (await loadData('widgetPendingSync')) || [];
  await saveData('widgetPendingSync', [...pending, { habitId, date: today, count: value }]);
  return value;
}
