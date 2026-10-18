import { supabase } from '../utils/supabase';
import { localDateKey } from '../utils/dates';
import { getLocale } from '../i18n';

function stripEmDashes(text) {
  if (!text) return text;
  return text.replace(/\s*—\s*/g, ', ').replace(/\s*–\s*/g, ', ');
}

// A blank or whitespace-only message (an old empty cache row, #194) becomes null,
// so callers that check `data.message` never render an empty card.
export function cleanMessage(data) {
  if (!data || typeof data !== 'object') return data;
  const text = typeof data.message === 'string' ? stripEmDashes(data.message).trim() : '';
  return { ...data, message: text || null };
}

// The function's error body as an Error carrying the server's `code` (quota_exceeded,
// empty_reply), so screens pick their own localised copy instead of the server's text.
async function functionError(error) {
  let body = null;
  try { body = await error.context?.json?.(); } catch {}
  const err = new Error(body?.error || error?.message || 'AI coach unavailable');
  err.code = body?.code ?? null;
  return err;
}

// Explicitly attaches the current session token so the Edge Function always
// receives a valid user JWT, regardless of when the SDK propagated the session
// into the functions client's internal header state.
async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${session.access_token}` };
}

// `today` is the client's LOCAL date key. The edge functions run in UTC, so without it
// they would evaluate "today" on the wrong calendar day for much of the world.
export async function fetchDailyNudge(accountCreatedAt, displayName, today) {
  const { data, error } = await supabase.functions.invoke('generate-nudge', {
    body: {
      accountCreatedAt: accountCreatedAt || null,
      displayName: displayName || null,
      today: today ?? localDateKey(),
      // #201: the coach answers in the UI language; the server caches per language.
      locale: getLocale(),
    },
    headers: await authHeaders(),
  });
  if (error) {
    const err = await functionError(error);
    // No nudge is a normal outcome (quota, empty reply, offline): Today just shows none.
    console.warn('[AI Coach] nudge:', err.message);
    throw err;
  }
  return cleanMessage(data);
}

// Natural-language habit creation: returns { habit, remaining } or throws with a
// user-facing message (quota errors carry `code === 'quota_exceeded'`).
export async function suggestHabit(text, today) {
  const { data, error } = await supabase.functions.invoke('suggest-habit', {
    body: { text, today: today ?? localDateKey() },
    headers: await authHeaders(),
  });
  if (error) {
    let body = null;
    try { body = await error.context?.json?.(); } catch {}
    const err = new Error(body?.error || error.message || 'Could not suggest a habit.');
    err.code = body?.code;
    throw err;
  }
  return data;
}

export async function fetchReflection(period = 'weekly', accountCreatedAt, displayName, today) {
  const { data, error } = await supabase.functions.invoke('generate-reflection', {
    body: {
      period,
      accountCreatedAt: accountCreatedAt || null,
      displayName: displayName || null,
      today: today ?? localDateKey(),
      locale: getLocale(),
    },
    headers: await authHeaders(),
  });
  if (error) {
    const err = await functionError(error);
    console.warn('[AI Coach] reflection:', err.message);
    throw err;
  }
  return cleanMessage(data);
}
