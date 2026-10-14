import { supabase } from '../utils/supabase';
import { localDateKey } from '../utils/dates';

function stripEmDashes(text) {
  if (!text) return text;
  return text.replace(/\s*—\s*/g, ', ').replace(/\s*–\s*/g, ', ');
}

async function readFunctionError(error) {
  let detail = error.message;
  try {
    const body = await error.context?.json?.();
    if (body?.error) detail = body.error;
  } catch {}
  return detail;
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
    },
    headers: await authHeaders(),
  });
  if (error) {
    const detail = await readFunctionError(error);
    console.error('[AI Coach] nudge:', detail);
    throw new Error(detail);
  }
  if (data?.message) data.message = stripEmDashes(data.message);
  return data;
}

export async function fetchReflection(period = 'weekly', accountCreatedAt, displayName, today) {
  const { data, error } = await supabase.functions.invoke('generate-reflection', {
    body: {
      period,
      accountCreatedAt: accountCreatedAt || null,
      displayName: displayName || null,
      today: today ?? localDateKey(),
    },
    headers: await authHeaders(),
  });
  if (error) {
    const detail = await readFunctionError(error);
    console.error('[AI Coach] reflection:', detail);
    throw new Error(detail);
  }
  if (data?.message) data.message = stripEmDashes(data.message);
  return data;
}
