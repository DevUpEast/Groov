// JSON backup format (#22). Pure helpers: building a backup object from app state,
// validating one that came back in, and summarising it for the confirm dialog.

export const BACKUP_FORMAT = 'groov-backup';
export const BACKUP_VERSION = 1;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function buildBackup(state, exportedAt = new Date().toISOString()) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    data: {
      habits: state.habits ?? [],
      completions: state.completions ?? {},
      notes: state.notes ?? {},
      settings: state.settings ?? {},
      challenges: state.challenges ?? [],
      pastChallenges: state.pastChallenges ?? [],
      dailySnapshot: state.dailySnapshot ?? {},
      accountCreatedAt: state.accountCreatedAt ?? null,
    },
  };
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// Returns { ok: true, data } or { ok: false, error }. Checks shapes deeply enough
// that a bad file cannot crash the app after import; unknown extra keys are dropped.
export function validateBackup(input) {
  let parsed = input;
  if (typeof input === 'string') {
    try { parsed = JSON.parse(input); } catch { return { ok: false, error: 'That file is not valid JSON.' }; }
  }
  if (!isObj(parsed) || parsed.format !== BACKUP_FORMAT) return { ok: false, error: 'That file is not a Groov backup.' };
  if (typeof parsed.version !== 'number' || parsed.version > BACKUP_VERSION) {
    return { ok: false, error: 'This backup was made by a newer version of Groov. Update the app and try again.' };
  }
  const d = parsed.data;
  if (!isObj(d)) return { ok: false, error: 'The backup has no data section.' };

  const habits = Array.isArray(d.habits)
    ? d.habits.filter(h => isObj(h) && typeof h.id === 'string' && typeof h.name === 'string')
    : [];
  const cleanDayMap = (src, valueOk) => {
    const out = {};
    if (!isObj(src)) return out;
    for (const [date, day] of Object.entries(src)) {
      if (!DATE_RE.test(date) || !isObj(day)) continue;
      const clean = {};
      for (const [id, v] of Object.entries(day)) if (valueOk(v)) clean[id] = v;
      if (Object.keys(clean).length) out[date] = clean;
    }
    return out;
  };
  const completions = cleanDayMap(d.completions, v => typeof v === 'number' && v >= 0);
  const notes = cleanDayMap(d.notes, v => typeof v === 'string' && v.length > 0);
  const chOk = (c) => isObj(c) && typeof c.id === 'string' && typeof c.name === 'string' && typeof c.days === 'number';
  const challenges = Array.isArray(d.challenges) ? d.challenges.filter(chOk) : [];
  const pastChallenges = Array.isArray(d.pastChallenges) ? d.pastChallenges.filter(chOk) : [];
  const dailySnapshot = {};
  if (isObj(d.dailySnapshot)) {
    for (const [date, snap] of Object.entries(d.dailySnapshot)) {
      if (DATE_RE.test(date) && Array.isArray(snap)) dailySnapshot[date] = snap.filter(h => isObj(h) && typeof h.id === 'string');
    }
  }
  const settings = isObj(d.settings) ? d.settings : null;
  const accountCreatedAt = typeof d.accountCreatedAt === 'string' && DATE_RE.test(d.accountCreatedAt) ? d.accountCreatedAt : null;

  if (habits.length === 0 && Object.keys(completions).length === 0 && challenges.length === 0 && pastChallenges.length === 0) {
    return { ok: false, error: 'The backup is empty.' };
  }
  return {
    ok: true,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null,
    data: { habits, completions, notes, settings, challenges, pastChallenges, dailySnapshot, accountCreatedAt },
  };
}

export function summarizeBackup(data) {
  const days = Object.keys(data.completions || {}).length;
  return `${data.habits.length} habit${data.habits.length !== 1 ? 's' : ''}, ${days} day${days !== 1 ? 's' : ''} of history, ${data.challenges.length + data.pastChallenges.length} challenge${data.challenges.length + data.pastChallenges.length !== 1 ? 's' : ''}`;
}

// Merge a backup over current state: records by id (backup wins), day maps per
// habit (backup wins), snapshots per date (backup wins), settings from the backup.
export function mergeBackup(current, incoming) {
  const byId = (list) => new Map(list.map(r => [r.id, r]));
  const mergeList = (a, b) => { const m = byId(a); for (const r of b) m.set(r.id, r); return [...m.values()]; };
  const mergeDayMaps = (a, b) => {
    const out = { ...a };
    for (const [date, day] of Object.entries(b)) out[date] = { ...(out[date] || {}), ...day };
    return out;
  };
  return {
    habits: mergeList(current.habits || [], incoming.habits),
    completions: mergeDayMaps(current.completions || {}, incoming.completions),
    notes: mergeDayMaps(current.notes || {}, incoming.notes),
    settings: incoming.settings ? { ...(current.settings || {}), ...incoming.settings } : current.settings,
    challenges: mergeList(current.challenges || [], incoming.challenges),
    pastChallenges: mergeList(current.pastChallenges || [], incoming.pastChallenges),
    dailySnapshot: { ...(current.dailySnapshot || {}), ...incoming.dailySnapshot },
    accountCreatedAt: [current.accountCreatedAt, incoming.accountCreatedAt].filter(Boolean).sort()[0] || null,
  };
}

export function backupFileName(dateKey) {
  return `groov-backup-${dateKey}.json`;
}
