// Shared AI plumbing for the edge functions (#37): model choice, per-user quotas
// and the cached system prompt. The Anthropic key lives only in function secrets.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

// Haiku-class model: fast and cheap enough to keep the free tier open.
export const AI_MODEL = 'claude-haiku-5-5'

// Daily limits per kind for free and Pro users. Nudges are cached per day anyway,
// so the free limit mostly guards against retries after a data reset.
export const QUOTAS = {
  free: { nudges: 2, reflections: 2, suggestions: 5 },
  pro: { nudges: 10, reflections: 10, suggestions: 50 },
} as const

export type QuotaKind = keyof typeof QUOTAS.free

export async function isPro(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin.from('profiles').select('is_pro').eq('user_id', userId).maybeSingle()
  return !!data?.is_pro
}

// Consume one unit of `kind` for today (server date). Returns { ok, limit }.
export async function consumeQuota(admin: SupabaseClient, userId: string, kind: QuotaKind, todayStr: string) {
  const pro = await isPro(admin, userId)
  const limit = (pro ? QUOTAS.pro : QUOTAS.free)[kind]
  const { data, error } = await admin.rpc('ai_consume', { p_user: userId, p_date: todayStr, p_kind: kind, p_limit: limit })
  if (error) throw error
  return { ok: !!data, limit, pro }
}

export function quotaExceeded(corsHeaders: Record<string, string>, kind: QuotaKind, limit: number, pro: boolean) {
  const what = kind === 'nudges' ? 'coaching nudges' : kind === 'reflections' ? 'reflections' : 'habit suggestions'
  return new Response(
    JSON.stringify({ error: `Daily limit of ${limit} ${what} reached${pro ? '' : '. Groov Pro raises this limit.'}`, code: 'quota_exceeded', limit, pro }),
    { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

// Stable coaching persona, sent as a cached system block so every call shares the
// prefix. Keep this text byte-stable: any edit invalidates the cache for everyone.
export const COACH_SYSTEM = `You are Groov's habit coach: warm, specific and brief. You write in plain English for a general audience, use the user's own numbers, and never moralise. Never use em dashes (the long dash) or en dashes in your response - use commas, hyphens, or separate sentences instead. Avoid generic openers like "Great job" or "Keep it up".`

export const cachedSystem = (text: string) => [
  { type: 'text' as const, text, cache_control: { type: 'ephemeral' as const } },
]
