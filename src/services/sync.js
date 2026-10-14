import { supabase } from '../utils/supabase';

// Only emit sync diagnostics in development builds
const syncWarn = __DEV__ ? (msg, detail) => console.warn(msg, detail) : () => {};

// Tables that carry user data. Every one has user_id and a trigger-maintained
// updated_at column (see supabase/migrations/20261014_sync_fields.sql).
const USER_TABLES = ['habits', 'completions', 'challenges', 'past_challenges', 'settings', 'daily_snapshots'];

// ── Transformers ──────────────────────────────────────────────────────────────
// updated_at is never sent: the server stamps inserts (default now()) and updates
// (trigger), so change tracking is always in server time.

const habitToRow = (habit, userId) => ({
  id: habit.id,
  user_id: userId,
  name: habit.name,
  icon: habit.icon ?? null,
  type: habit.type,
  volume_goal: habit.volumeGoal ?? 1,
  created_at: habit.createdAt,
  reminder: habit.reminder ?? null,
  custom_icon_uri: habit.customIconUri ?? null,
  schedule: habit.schedule ?? null,
  color: habit.color ?? null,
  time_of_day: habit.timeOfDay ?? null,
  archived: habit.archived ?? false,
  sort_order: habit.sortOrder ?? 0,
  unit: habit.unit ?? null,
});

const rowToHabit = (row) => ({
  id: row.id,
  name: row.name,
  icon: row.icon,
  type: row.type,
  volumeGoal: row.volume_goal,
  createdAt: row.created_at,
  reminder: row.reminder ?? undefined,
  customIconUri: row.custom_icon_uri ?? null,
  schedule: row.schedule ?? undefined,
  color: row.color ?? null,
  timeOfDay: row.time_of_day ?? null,
  archived: row.archived ?? false,
  sortOrder: row.sort_order ?? 0,
  unit: row.unit ?? null,
});

// Notes ride on the completions row (a note without a count is a 0-count row).
const completionsToRows = (completions, userId, notes = {}) => {
  const rows = [];
  const seen = new Set();
  for (const [date, habitMap] of Object.entries(completions)) {
    for (const [habitId, count] of Object.entries(habitMap)) {
      const note = (notes[date] || {})[habitId] || null;
      if (count > 0 || note) { rows.push({ user_id: userId, date, habit_id: habitId, count, note }); seen.add(`${date}|${habitId}`); }
    }
  }
  for (const [date, habitMap] of Object.entries(notes)) {
    for (const [habitId, note] of Object.entries(habitMap)) {
      if (note && !seen.has(`${date}|${habitId}`)) rows.push({ user_id: userId, date, habit_id: habitId, count: 0, note });
    }
  }
  return rows;
};

const rowsToNotes = (rows) => {
  const notes = {};
  for (const row of rows) {
    if (!row.note) continue;
    if (!notes[row.date]) notes[row.date] = {};
    notes[row.date][row.habit_id] = row.note;
  }
  return notes;
};

const rowsToCompletions = (rows) => {
  const completions = {};
  for (const row of rows) {
    if (!(row.count > 0)) continue;
    if (!completions[row.date]) completions[row.date] = {};
    completions[row.date][row.habit_id] = row.count;
  }
  return completions;
};

const challengeToRow = (ch, userId) => ({
  id: ch.id,
  user_id: userId,
  name: ch.name,
  description: ch.description ?? null,
  days: ch.days,
  completed_days: ch.completedDays ?? [],
  completed: ch.completed ?? false,
  start_date: ch.startDate,
  linked_habit_ids: ch.linkedHabitIds ?? [],
  icon: ch.icon ?? null,
});

const rowToChallenge = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  days: row.days,
  completedDays: row.completed_days,
  completed: row.completed,
  startDate: row.start_date,
  linkedHabitIds: row.linked_habit_ids,
  icon: row.icon,
});

const pastChallengeToRow = (ch, userId) => ({
  ...challengeToRow(ch, userId),
  archived_at: ch.archivedAt,
  tier: ch.tier ?? 'none',
});

const rowToPastChallenge = (row) => ({
  ...rowToChallenge(row),
  archivedAt: row.archived_at,
  tier: row.tier,
});

const settingsToRow = (settings, userId) => ({
  user_id: userId,
  theme: settings.theme ?? 'light',
  notifications_enabled: settings.notificationsEnabled ?? true,
  sound_enabled: settings.soundEnabled ?? true,
  haptics_enabled: settings.hapticsEnabled ?? true,
  reminders: settings.reminders ?? [],
  evening_reminder_enabled: settings.eveningReminderEnabled ?? false,
  evening_reminder_hour: settings.eveningReminderHour ?? 20,
  evening_reminder_minute: settings.eveningReminderMinute ?? 0,
  skips: settings.skips ?? {},
  streak_freezes: settings.streakFreezes ?? [],
  milestones: settings.milestones ?? [],
});

const rowToSettings = (row) => ({
  theme: row.theme,
  notificationsEnabled: row.notifications_enabled,
  soundEnabled: row.sound_enabled,
  hapticsEnabled: row.haptics_enabled,
  reminders: row.reminders ?? [],
  eveningReminderEnabled: row.evening_reminder_enabled ?? false,
  eveningReminderHour: row.evening_reminder_hour ?? 20,
  eveningReminderMinute: row.evening_reminder_minute ?? 0,
  skips: row.skips ?? {},
  streakFreezes: row.streak_freezes ?? [],
  milestones: row.milestones ?? [],
});

// ── Bulk operations ───────────────────────────────────────────────────────────

export async function pushAllLocalData(userId, { habits, completions, notes, settings, challenges, pastChallenges, dailySnapshot }) {
  const ops = [];

  if (habits.length > 0)
    ops.push(supabase.from('habits').upsert(habits.map(h => habitToRow(h, userId))));

  const completionRows = completionsToRows(completions, userId, notes);
  if (completionRows.length > 0)
    ops.push(supabase.from('completions').upsert(completionRows));

  if (challenges.length > 0)
    ops.push(supabase.from('challenges').upsert(challenges.map(c => challengeToRow(c, userId))));

  if (pastChallenges.length > 0)
    ops.push(supabase.from('past_challenges').upsert(pastChallenges.map(c => pastChallengeToRow(c, userId))));

  ops.push(supabase.from('settings').upsert(settingsToRow(settings, userId)));

  const snapshotRows = Object.entries(dailySnapshot).map(([date, snapshot]) => ({
    user_id: userId, date, snapshot,
  }));
  if (snapshotRows.length > 0)
    ops.push(supabase.from('daily_snapshots').upsert(snapshotRows));

  const results = await Promise.allSettled(ops);
  results.forEach((r, i) => {
    if (r.status === 'rejected') syncWarn(`pushAllLocalData[${i}] rejected:`, r.reason);
    else if (r.value?.error) syncWarn(`pushAllLocalData[${i}] error:`, r.value.error.message);
  });
}

export async function pullAllData(userId) {
  const [habitsRes, completionsRes, challengesRes, pastRes, settingsRes, snapshotsRes] = await Promise.all([
    supabase.from('habits').select('*').eq('user_id', userId).order('created_at').order('id'),
    supabase.from('completions').select('*').eq('user_id', userId),
    supabase.from('challenges').select('*').eq('user_id', userId).order('start_date').order('id'),
    supabase.from('past_challenges').select('*').eq('user_id', userId).order('archived_at', { ascending: false }).order('id'),
    supabase.from('settings').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('daily_snapshots').select('*').eq('user_id', userId),
  ]);

  return {
    habits: habitsRes.data ? habitsRes.data.map(rowToHabit) : null,
    completions: completionsRes.data ? rowsToCompletions(completionsRes.data) : null,
    notes: completionsRes.data ? rowsToNotes(completionsRes.data) : null,
    challenges: challengesRes.data ? challengesRes.data.map(rowToChallenge) : null,
    pastChallenges: pastRes.data ? pastRes.data.map(rowToPastChallenge) : null,
    settings: settingsRes.data ? rowToSettings(settingsRes.data) : null,
    dailySnapshot: snapshotsRes.data
      ? Object.fromEntries(snapshotsRes.data.map(r => [r.date, r.snapshot]))
      : null,
  };
}

// Incremental pull: every row changed on the server after `sinceIso`, plus the ids
// still present for the tables that support deletion, so the caller can reconcile.
// Throws on the first failed query so the caller can keep its previous cursor.
export async function pullChangesSince(userId, sinceIso) {
  const changed = (table) => supabase.from(table).select('*').eq('user_id', userId).gt('updated_at', sinceIso);
  const ids = (table) => supabase.from(table).select('id').eq('user_id', userId);

  const results = await Promise.all([
    changed('habits'), changed('completions'), changed('challenges'), changed('past_challenges'),
    changed('settings'), changed('daily_snapshots'),
    ids('habits'), ids('challenges'),
  ]);
  const failed = results.find(r => r.error);
  if (failed) throw new Error(failed.error.message);
  const [habitsRes, completionsRes, challengesRes, pastRes, settingsRes, snapshotsRes, habitIdsRes, challengeIdsRes] = results;

  return {
    habits: habitsRes.data.map(rowToHabit),
    completions: completionsRes.data, // raw rows; count 0 means deleted
    challenges: challengesRes.data.map(rowToChallenge),
    pastChallenges: pastRes.data.map(rowToPastChallenge),
    settings: settingsRes.data[0] ? rowToSettings(settingsRes.data[0]) : null,
    dailySnapshots: snapshotsRes.data,
    habitIds: habitIdsRes.data.map(r => r.id),
    challengeIds: challengeIdsRes.data.map(r => r.id),
  };
}

export async function deleteAllUserData(userId) {
  await Promise.allSettled([
    ...USER_TABLES.map(t => supabase.from(t).delete().eq('user_id', userId)),
    supabase.from('ai_nudges').delete().eq('user_id', userId),
    supabase.from('ai_reflections').delete().eq('user_id', userId),
    supabase.from('profiles').delete().eq('user_id', userId),
  ]);
}

export async function syncProfile(userId, displayName) {
  const { error } = await supabase.from('profiles').upsert({
    user_id: userId,
    display_name: displayName,
    updated_at: new Date().toISOString(),
  });
  if (error) syncWarn('syncProfile:', error.message);
}

// ── Individual mutation syncs ─────────────────────────────────────────────────

export async function syncHabit(userId, habit) {
  const { error } = await supabase.from('habits').upsert(habitToRow(habit, userId));
  if (error) syncWarn('syncHabit:', error.message);
}

export async function deleteHabitSync(userId, habitId) {
  const { error } = await supabase.from('habits').delete().eq('id', habitId).eq('user_id', userId);
  if (error) syncWarn('deleteHabitSync:', error.message);
}

// A count of 0 is stored rather than deleted so that other devices see the
// "un-complete" in their next incremental pull.
export async function syncCompletion(userId, date, habitId, count) {
  const { error } = await supabase.from('completions')
    .upsert({ user_id: userId, date, habit_id: habitId, count: Math.max(0, count) });
  if (error) syncWarn('syncCompletion:', error.message);
}

export async function syncNote(userId, date, habitId, note, count = 0) {
  const { error } = await supabase.from('completions')
    .upsert({ user_id: userId, date, habit_id: habitId, count: Math.max(0, count), note: note || null });
  if (error) syncWarn('syncNote:', error.message);
}

export async function syncCompletionsForDate(userId, date, habitMap) {
  const rows = Object.entries(habitMap)
    .map(([habitId, count]) => ({ user_id: userId, date, habit_id: habitId, count: Math.max(0, count) }));
  if (rows.length > 0) {
    const { error } = await supabase.from('completions').upsert(rows);
    if (error) syncWarn('syncCompletionsForDate:', error.message);
  }
}

export async function syncChallenge(userId, challenge) {
  const { error } = await supabase.from('challenges').upsert(challengeToRow(challenge, userId));
  if (error) syncWarn('syncChallenge:', error.message);
}

export async function deleteChallengeSync(userId, challengeId) {
  const { error } = await supabase.from('challenges').delete().eq('id', challengeId).eq('user_id', userId);
  if (error) syncWarn('deleteChallengeSync:', error.message);
}

export async function syncPastChallenge(userId, challenge) {
  const { error } = await supabase.from('past_challenges').upsert(pastChallengeToRow(challenge, userId));
  if (error) syncWarn('syncPastChallenge:', error.message);
}

export async function syncSettings(userId, settings) {
  const { error } = await supabase.from('settings').upsert(settingsToRow(settings, userId));
  if (error) syncWarn('syncSettings:', error.message);
}
