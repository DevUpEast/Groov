// Natural-language habit creation (#37): "read more before bed, 20 pages, weekdays"
// -> a structured habit the form can prefill. Quota-limited per user per day.
import { createClient } from 'npm:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'
import { AI_MODEL, consumeQuota, quotaExceeded, cachedSystem, refundQuota, generateText } from '../_shared/ai.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// The 7 curated habit accents (light-fill hex, as the app stores them; src/theme/accents.js).
const ACCENT_HEX: Record<string, string> = {
  coral: '#C2410C', lime: '#4D7C0F', teal: '#0F766E', sky: '#0284C7', magenta: '#C026D3', pink: '#DB2777', slate: '#475569',
}
const ACCENT_LIST = Object.entries(ACCENT_HEX).map(([id, hex]) => `${hex} (${id})`).join(' ')

const SYSTEM = `You turn a short description of a habit into a structured habit definition for the Groov app. Be literal about what the user asked for; fill gaps with sensible defaults. Rules:
- type: "daily" (one tick a day), "volume" (count a number of units per day), "timed" (minutes per day), "quit" (avoid something), "atMost" (stay at or under a daily limit).
- volumeGoal: units for volume, minutes for timed, the limit for atMost, 1 otherwise.
- unit: short plural noun for volume/atMost (e.g. "glasses", "pages"), null otherwise.
- schedule: {"type":"daily"} | {"type":"weekdays","days":[0-6]} (0 = Sunday) | {"type":"perWeek","target":1-6}.
- timeOfDay: "anytime" | "morning" | "afternoon" | "evening".
- icon: one emoji. color: one of ${ACCENT_LIST}, picked to suit the habit, or null.
- intention: the cue after "After I ..." if the user gave one (no leading "After I"), else null.
- name: 2-5 words, no trailing punctuation.`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'icon', 'type', 'volumeGoal', 'unit', 'schedule', 'timeOfDay', 'color', 'intention'],
  properties: {
    name: { type: 'string' },
    icon: { type: 'string' },
    type: { type: 'string', enum: ['daily', 'volume', 'timed', 'quit', 'atMost'] },
    volumeGoal: { type: 'integer', minimum: 0, maximum: 1000 },
    unit: { type: ['string', 'null'] },
    schedule: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'days', 'target'],
      properties: {
        type: { type: 'string', enum: ['daily', 'weekdays', 'perWeek'] },
        days: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 } },
        target: { type: 'integer', minimum: 1, maximum: 6 },
      },
    },
    timeOfDay: { type: 'string', enum: ['anytime', 'morning', 'afternoon', 'evening'] },
    color: { type: ['string', 'null'] },
    intention: { type: ['string', 'null'] },
  },
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const contentLength = Number(req.headers.get('content-length') ?? '0')
  if (contentLength > 2048) {
    return new Response(JSON.stringify({ error: 'Request body too large' }), { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    )
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const body = await req.json().catch(() => ({}))
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, 300) : ''
    if (text.length < 3) {
      return new Response(JSON.stringify({ error: 'Describe the habit in a few words.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const todayStr = typeof body.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : new Date().toISOString().slice(0, 10)

    const q = await consumeQuota(admin, user.id, 'suggestions', todayStr)
    if (!q.ok) return quotaExceeded(corsHeaders, 'suggestions', q.limit, q.pro)

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })
    // Structured outputs keep the reply schema-valid; if the SDK/model pair rejects
    // the parameter we fall back to plain JSON with a strict instruction.
    // generateText picks the text block by type and retries once if thinking used up
    // the budget (#194).
    const call = (withSchema: boolean) => generateText(anthropic, {
      model: AI_MODEL,
      max_tokens: 1024,
      system: cachedSystem(withSchema ? SYSTEM : `${SYSTEM}
Reply with ONLY a JSON object matching this schema, no prose: ${JSON.stringify(SCHEMA)}`),
      messages: [{ role: 'user', content: `Habit description: ${text}` }],
      ...(withSchema ? { output_config: { format: { type: 'json_schema', schema: SCHEMA } } } : {}),
    }, 'suggest-habit')
    let raw = ''
    try {
      try {
        raw = await call(true)
      } catch (e) {
        console.warn('suggest-habit: structured output rejected, falling back:', (e as Error).message)
        raw = await call(false)
      }
    } catch (e) {
      await refundQuota(admin, user.id, 'suggestions', todayStr)
      throw e
    }
    let habit: Record<string, unknown>
    try { habit = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) } catch { habit = {} }
    if (typeof habit.name !== 'string' || !habit.name) {
      // Nothing usable came back: do not charge for it.
      await refundQuota(admin, user.id, 'suggestions', todayStr)
      console.warn('suggest-habit: unparsable reply:', raw.slice(0, 500))
      return new Response(JSON.stringify({ error: 'Could not understand that habit. Try a few more words.', debug: Deno.env.get('SUGGEST_DEBUG') === '1' ? raw.slice(0, 500) : undefined }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    // Trim the schedule to the shape the app stores.
    const s = habit.schedule as { type: string; days?: number[]; target?: number } | undefined
    if (s?.type === 'weekdays') habit.schedule = { type: 'weekdays', days: s.days ?? [1, 2, 3, 4, 5] }
    else if (s?.type === 'perWeek') habit.schedule = { type: 'perWeek', target: s.target ?? 3 }
    else habit.schedule = { type: 'daily' }
    // Only a curated accent hex (or null) reaches the app.
    const color = typeof habit.color === 'string' ? habit.color.trim().toUpperCase() : null
    habit.color = color && Object.values(ACCENT_HEX).includes(color) ? color : (color && ACCENT_HEX[color.toLowerCase()]) || null

    return new Response(JSON.stringify({ habit, remaining: q.limit }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('suggest-habit error:', (err as Error).message, (err as Error).stack)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
