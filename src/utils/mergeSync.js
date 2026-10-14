// Pure helpers for merging an incremental cloud pull into local state.
//
// Local mutations are pushed to Supabase immediately (fire-and-forget), so after a
// foreground pull the cloud is the authority for anything it knows about. The one thing
// a delta pull cannot tell us is deletions, so those are reconciled against the full
// list of ids still present in the cloud. Habits and challenges use Date.now() string
// ids, which doubles as a creation timestamp: an id newer than the last pull was
// created locally since then and may simply not have reached the cloud yet.

// Was this record created after the last successful pull (i.e. possibly unsynced)?
export function createdAfter(id, lastPulledMs) {
  const n = Number(id);
  return Number.isFinite(n) && n > lastPulledMs;
}

// Merge changed cloud records over a local list, then drop local records the cloud no
// longer has unless they were created after the last pull.
export function mergeRecords(local, changed, cloudIds, lastPulledMs) {
  const byId = new Map(local.map(r => [r.id, r]));
  for (const rec of changed) byId.set(rec.id, rec);
  const present = cloudIds ? new Set(cloudIds) : null;
  const out = [];
  for (const rec of byId.values()) {
    if (present && !present.has(rec.id) && !createdAfter(rec.id, lastPulledMs)) continue;
    out.push(rec);
  }
  return out;
}

// Apply changed completion rows ({ date, habit_id, count }) to the local
// { date: { habitId: count } } map. A count of 0 removes the entry.
export function mergeCompletions(local, rows) {
  if (!rows?.length) return local;
  const next = { ...local };
  for (const row of rows) {
    const day = { ...(next[row.date] || {}) };
    if (row.count > 0) day[row.habit_id] = row.count;
    else delete day[row.habit_id];
    if (Object.keys(day).length > 0) next[row.date] = day;
    else delete next[row.date];
  }
  return next;
}

// Apply changed daily snapshot rows ({ date, snapshot }).
export function mergeSnapshots(local, rows) {
  if (!rows?.length) return local;
  const next = { ...local };
  for (const row of rows) next[row.date] = row.snapshot;
  return next;
}
