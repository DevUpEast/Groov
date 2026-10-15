import { createClient } from 'npm:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'
import { normalizeSchedule, describeSchedule, expectedDays, isScheduledOn, goalMet } from '../_shared/schedule.ts'
import { AI_MODEL, COACH_SYSTEM, cachedSystem, consumeQuota, quotaExceeded } from '../_shared/ai.ts'

// Wildcard origin is intentional: CORS is a browser mechanism and does not apply to
// native mobile clients. Supabase edge functions require this header for the OPTIONS
// preflight even when called from a native app.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function toDateOnly(isoStr: string): string {
  return isoStr.split('T')[0]
}

function localDate(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00')
  d.setHours(0, 0, 0, 0)
  return d
}

// Date -> 'YYYY-MM-DD' in this runtime's local zone (UTC on Supabase).
function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Validate the client-supplied local date. Any zone is at most ±1 day from UTC;
// allow 2 to be safe and fall back to the server date otherwise.
function clientToday(value: unknown): string {
  const serverToday = dateKey(new Date())
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return serverToday
  const diff = Math.abs(localDate(value).getTime() - localDate(serverToday).getTime()) / 86400000
  return Number.isFinite(diff) && diff <= 2 ? value : serverToday
}

function stripEmDashes(text: string): string {
  return text
    .replace(/\s*—\s*/g, ', ')
    .replace(/\s*–\s*/g, ', ')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Reject oversized request bodies (period field only, no large payloads accepted)
  const contentLength = Number(req.headers.get('content-length') ?? '0')
  if (contentLength > 1024) {
    return new Response(JSON.stringify({ error: 'Request body too large' }), {
      status: 413,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    // Validate user identity via their JWT using the anon key client.
    // The service role client below is used for all DB operations instead.
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    )
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Service role client — bypasses RLS; every query below explicitly filters by user.id
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const body = await req.json().catch(() => ({}))

    // Validate period: only the exact strings 'weekly' or 'monthly' are accepted
    const rawPeriod = typeof body.period === 'string' ? body.period : ''
    if (rawPeriod !== '' && rawPeriod !== 'weekly' && rawPeriod !== 'monthly') {
      return new Response(JSON.stringify({ error: 'Invalid period. Must be "weekly" or "monthly".' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const period: 'weekly' | 'monthly' = rawPeriod === 'monthly' ? 'monthly' : 'weekly'
    const days = period === 'monthly' ? 30 : 7

    // Use the app-level accountCreatedAt if provided — it resets when the user clears data,
    // whereas user.created_at is permanently fixed to the Supabase Auth registration date.
    const clientAccountCreatedAt =
      typeof body.accountCreatedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.accountCreatedAt)
        ? body.accountCreatedAt
        : null
    const accountCreatedStr: string = clientAccountCreatedAt ?? toDateOnly(user.created_at)

    // "Today" is the CLIENT's local calendar date. This function runs in UTC, so the
    // server clock is the wrong day for most of the world for part of every day.
    // Accept the client value when it is a plausible date (within 2 days of now).
    const todayStr = clientToday(body.today)
    const today = localDate(todayStr)

    const accountCreatedDate = localDate(accountCreatedStr)

    // Effective period start: requested window capped at account creation
    const requestedStartDate = new Date(today)
    requestedStartDate.setDate(requestedStartDate.getDate() - days + 1)
    const effectiveStartDate = requestedStartDate > accountCreatedDate ? requestedStartDate : accountCreatedDate
    const periodStart = dateKey(effectiveStartDate)

    // Account-level active days in this period
    const msPerDay = 1000 * 60 * 60 * 24
    const accountActiveDays = Math.round((today.getTime() - effectiveStartDate.getTime()) / msPerDay) + 1

    // Return cached reflection only if it was generated after accountCreatedAt,
    // so a data reset invalidates any reflection that captured pre-reset data.
    const { data: cached } = await supabase
      .from('ai_reflections')
      .select('message, generated_at')
      .eq('user_id', user.id)
      .eq('period', period)
      .eq('period_start', periodStart)
      .gte('generated_at', accountCreatedStr)
      .maybeSingle()

    if (cached?.message) {
      return new Response(
        JSON.stringify({ message: cached.message, cached: true, generatedAt: cached.generated_at }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Rate limit: prevent rapid-fire or concurrent generation requests
    const { data: recentGen } = await supabase
      .from('ai_reflections')
      .select('generated_at')
      .eq('user_id', user.id)
      .gte('generated_at', new Date(Date.now() - 60_000).toISOString())
      .limit(1)
      .maybeSingle()

    if (recentGen) {
      return new Response(
        JSON.stringify({ error: 'A reflection was just generated. Please wait a moment before trying again.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch habits with their individual creation dates + completions for the active period
    const [{ data: habits }, { data: completionRows }] = await Promise.all([
      supabase.from('habits').select('id, name, icon, type, volume_goal, created_at, schedule').eq('user_id', user.id).eq('archived', false),
      supabase
        .from('completions')
        .select('date, habit_id, count')
        .eq('user_id', user.id)
        .gte('date', periodStart)
        .lte('date', todayStr),
    ])

    if (!habits?.length) {
      return new Response(
        JSON.stringify({ message: null, reason: 'no_habits' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build completions lookup
    const completions: Record<string, Record<string, number>> = {}
    for (const row of completionRows ?? []) {
      if (!completions[row.date]) completions[row.date] = {}
      completions[row.date][row.habit_id] = row.count
    }

    // Per-habit stats — each habit uses its own creation date as its floor
    const habitStats = habits.map((h) => {
      const habitCreatedStr = h.created_at ? toDateOnly(h.created_at) : accountCreatedStr
      const habitCreatedDate = localDate(habitCreatedStr)
      // Habit's active window starts at whichever is latest: period start or habit creation
      const habitStartDate = habitCreatedDate > effectiveStartDate ? habitCreatedDate : effectiveStartDate
      const habitStartStr = dateKey(habitStartDate)
      const schedule = normalizeSchedule(h.schedule)
      const calendarDays = Math.round((today.getTime() - habitStartDate.getTime()) / msPerDay) + 1
      const habitActiveDays = Math.max(1, expectedDays(schedule, habitStartDate, today))

      let completedDays = 0
      for (let i = 0; i < calendarDays; i++) {
        const d = new Date(today)
        d.setDate(d.getDate() - i)
        const dateStr = dateKey(d)
        if (goalMet(h.type, (completions[dateStr] ?? {})[h.id], h.volume_goal)) completedDays++
      }

      return {
        name: h.name,
        icon: h.icon ?? '',
        createdStr: habitCreatedStr,
        schedule: describeSchedule(schedule),
        completedDays,
        activeDays: habitActiveDays,
        rate: Math.min(100, Math.round((completedDays / habitActiveDays) * 100)),
        isNew: habitCreatedStr > periodStart,
      }
    })

    // Perfect days: all habits that existed on a given day were completed
    let perfectDays = 0
    for (let i = 0; i < accountActiveDays; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const dateStr = dateKey(d)
      const dayComps = completions[dateStr] ?? {}
      // Only consider habits that were active on this date
      const activeOnDay = habits.filter(h => {
        const hCreated = h.created_at ? toDateOnly(h.created_at) : accountCreatedStr
        const s = normalizeSchedule(h.schedule)
        return dateStr >= hCreated && s.type !== 'perWeek' && isScheduledOn(s, d)
      })
      if (activeOnDay.length > 0 && activeOnDay.every((h) => goalMet(h.type, dayComps[h.id], h.volume_goal))) {
        perfectDays++
      }
    }

    const best = [...habitStats].sort((a, b) => b.rate - a.rate)[0]
    const worst = [...habitStats].sort((a, b) => a.rate - b.rate)[0]

    const accountAgeLine = accountActiveDays < days
      ? `Account created: ${accountCreatedStr} (only ${accountActiveDays} active day${accountActiveDays !== 1 ? 's' : ''} in this period, not the full ${days}). Some habits may have even fewer active days - see per-habit counts below.`
      : `Account active since: ${accountCreatedStr}`

    const timeSpanRule =
      accountActiveDays <= 3
        ? `DATA WINDOW: Only ${accountActiveDays} day${accountActiveDays !== 1 ? 's' : ''} of data. Base ALL observations on these ${accountActiveDays} days only. Do NOT mention weekly or monthly averages.`
        : accountActiveDays <= 6
        ? `DATA WINDOW: ${accountActiveDays} days of data. Reference only this period. Avoid implying weekly or monthly averages.`
        : accountActiveDays <= 13
        ? `DATA WINDOW: ${accountActiveDays} days of data. Weekly trends are appropriate; do not reference monthly patterns.`
        : `DATA WINDOW: ${accountActiveDays} days of data. Weekly and multi-week trends are appropriate.`

    const prompt = `Write a ${period} reflection summary (3-5 sentences) for a user based on the data below. Be specific and data-driven. Highlight the standout habit, address the one that needs attention, and give one concrete actionable tip. End on an encouraging note.

${timeSpanRule}
IMPORTANT: Each habit shows its own expected days since it was created, based on its schedule (some habits are only due on certain days or N times a week). Use each habit's own denominator - never compare completedDays against the full ${days}-day period if the habit was created more recently or is not due every day. Do not reference days before the account or any habit was created.

Period: ${periodStart} to ${todayStr}
${accountAgeLine}
Perfect days (all active habits done): ${perfectDays}/${accountActiveDays}

Habits (completions / days that habit was active):
${habitStats.map((h) => {
  const newTag = h.isNew ? ` (new habit, active since ${h.createdStr})` : ''
  return `  * ${h.icon} ${h.name} [${h.schedule}]: ${h.completedDays}/${h.activeDays} expected days (${h.rate}%)${newTag}`
}).join('\n')}

Most consistent: ${best.icon} ${best.name} at ${best.rate}% (${best.completedDays}/${best.activeDays} days)
Needs attention: ${worst.icon} ${worst.name} at ${worst.rate}% (${worst.completedDays}/${worst.activeDays} days)

Write the reflection:`

    // Per-user daily quota (free vs Pro) is consumed only when we actually generate.
    const quota = await consumeQuota(supabase, user.id, 'reflections', todayStr)
    if (!quota.ok) return quotaExceeded(corsHeaders, 'reflections', quota.limit, quota.pro)

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })
    const aiResponse = await anthropic.messages.create({
      model: AI_MODEL,
      system: cachedSystem(COACH_SYSTEM),
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = aiResponse.content.find((b) => b.type === 'text')
    const raw = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : ''
    const message = stripEmDashes(raw)
    const generatedAt = new Date().toISOString()

    await supabase.from('ai_reflections').upsert(
      { user_id: user.id, period, period_start: periodStart, period_end: todayStr, message },
      { onConflict: 'user_id,period,period_start' }
    )

    return new Response(
      JSON.stringify({ message, cached: false, generatedAt }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('generate-reflection error:', (err as Error).message)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
