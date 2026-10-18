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

// Give back one unit consumed by consumeQuota when the call produced nothing usable
// (#194). Consuming first keeps the limit race-safe; refunding keeps it fair.
export async function refundQuota(admin: SupabaseClient, userId: string, kind: QuotaKind, todayStr: string) {
  const { error } = await admin.rpc('ai_refund', { p_user: userId, p_date: todayStr, p_kind: kind })
  if (error) console.error(`ai_refund(${kind}) failed:`, error.message)
}

// Minimal view of the SDK client so this module does not import the SDK itself.
type MessagesClient = { messages: { create: (params: never) => Promise<unknown> } }
type Reply = { content?: Array<{ type: string; text?: string }>; stop_reason?: string }

// Claude Haiku 5.5 runs adaptive thinking by default and thinking counts toward
// max_tokens, so a small cap can end (stop_reason "max_tokens") after a thinking
// block with no text at all (#194). Ask for low effort with room to spare; if the
// text is still empty, retry once with thinking off (accepted at effort <= high)
// and a larger cap. Returns the trimmed text, or '' when both attempts are empty.
export async function generateText(
  anthropic: MessagesClient,
  params: Record<string, unknown> & { max_tokens: number },
  label: string,
): Promise<string> {
  const outputConfig = (params.output_config as Record<string, unknown> | undefined) ?? {}
  const attempts = [
    { ...params, output_config: { ...outputConfig, effort: 'low' } },
    { ...params, max_tokens: params.max_tokens * 2, thinking: { type: 'disabled' }, output_config: { ...outputConfig, effort: 'low' } },
  ]
  for (let i = 0; i < attempts.length; i++) {
    const reply = await anthropic.messages.create(attempts[i] as never) as Reply
    const text = textOf(reply)
    if (text) return text
    console.warn(`${label}: empty text on attempt ${i + 1} (stop_reason ${reply.stop_reason ?? '?'})`)
  }
  return ''
}

// Always pick the text block by type: a thinking block can come first.
export function textOf(reply: Reply): string {
  return (reply.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
    .trim()
}

export function emptyReply(corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({ error: 'The coach had nothing to say this time. Try again later.', code: 'empty_reply' }),
    { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

export function quotaExceeded(corsHeaders: Record<string, string>, kind: QuotaKind, limit: number, pro: boolean) {
  const what = kind === 'nudges' ? 'coaching nudges' : kind === 'reflections' ? 'reflections' : 'habit suggestions'
  return new Response(
    JSON.stringify({ error: `Daily limit of ${limit} ${what} reached${pro ? '' : '. Groov Pro raises this limit.'}`, code: 'quota_exceeded', limit, pro }),
    { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

// The app's UI languages (src/i18n/locales). The client sends its UI locale; anything
// else falls back to English. The value is also the cache key (#201).
export const COACH_LANGUAGES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  de: 'German (informal "du")',
  fr: 'French (informal "tu")',
  'pt-BR': 'Brazilian Portuguese (informal "você")',
  ja: 'Japanese (polite です/ます form)',
}

export function coachLocale(value: unknown): string {
  return typeof value === 'string' && Object.hasOwn(COACH_LANGUAGES, value) ? value : 'en'
}

// The app's words for its core concepts (docs/GLOSSARY.md), so the coach matches the UI.
const COACH_TERMS: Record<string, string> = {
  es: 'racha (streak), día perfecto (perfect day), día de descanso (rest day)',
  de: 'Serie (streak, never "Streak"), perfekter Tag (perfect day), Ruhetag (rest day)',
  fr: 'série (streak), jour parfait (perfect day), jour de repos (rest day)',
  'pt-BR': 'sequência (streak), dia perfeito (perfect day), dia de descanso (rest day)',
  ja: '連続記録 or N日連続 (streak, never ストリーク), パーフェクト日 (perfect day), 休みの日 (rest day); no exclamation marks',
}

// Appended to the user prompt (the system block stays the same for every language).
export function languageRule(locale: string): string {
  const terms = COACH_TERMS[locale] ? ` Use these app terms: ${COACH_TERMS[locale]}.` : ''
  return `LANGUAGE: Write your whole reply in ${COACH_LANGUAGES[locale] ?? 'English'}. Keep habit names exactly as the user wrote them.${terms}`
}

// Hard cap for the Today nudge (#201: it must fit about 3 short lines above the fold).
// Japanese glyphs are about twice as wide, so its budget is about half.
export function nudgeMaxChars(locale: string): number {
  return locale === 'ja' ? 80 : 160
}

// Trim `text` to whole sentences within `max` characters. The first sentence is always
// kept (the client clamps it to 3 lines), so the reply is never cut mid-word.
export function capToSentences(text: string, max: number, locale = 'en'): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  let sentences: string[]
  try {
    const seg = new Intl.Segmenter(locale, { granularity: 'sentence' })
    sentences = Array.from(seg.segment(clean), (s) => s.segment)
  } catch {
    sentences = clean.match(/[^.!?。！？]+[.!?。！？]+\s*|[^.!?。！？]+$/g) ?? [clean]
  }
  let out = sentences[0] ?? clean
  for (const s of sentences.slice(1)) {
    if ((out + s).trim().length > max) break
    out += s
  }
  return out.trim()
}

// Stable coaching persona, sent as a cached system block so every call shares the
// prefix. Keep this text byte-stable: any edit invalidates the cache for everyone.
// The reply language comes from languageRule() in the user prompt.
export const COACH_SYSTEM = `You are Groov's habit coach: warm, specific and brief. You write in plain, everyday language for a general audience, use the user's own numbers, and never moralise. Never use em dashes (the long dash) or en dashes in your response - use commas, hyphens, or separate sentences instead. Avoid generic openers like "Great job" or "Keep it up" (or their equivalent in other languages). Reply with the message only: no title, no preamble, no quotation marks, no markdown.`

export const cachedSystem = (text: string) => [
  { type: 'text' as const, text, cache_control: { type: 'ephemeral' as const } },
]
