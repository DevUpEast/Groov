import { createClient } from 'npm:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'
import { normalizeSchedule, describeSchedule, expectedDays, isScheduledOn } from '../_shared/schedule.ts'

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

  const contentLength = Number(req.headers.get('content-length') ?? '0')
  if (contentLength > 1024) {
    return new Response(JSON.stringify({ error: 'Request body too large' }), {
      status: 413,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Parse body — accountCreatedAt from the app resets when the user clears data,
    // whereas user.created_at is fixed at Supabase Auth registration and never changes.
    const body = await req.json().catch(() => ({}))
    const clientAccountCreatedAt =
      typeof body.accountCreatedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.accountCreatedAt)
        ? body.accountCreatedAt
        : null
    const displayName: string | null = typeof body.displayName === 'string' ? body.displayName : null

    // Use the app-level accountCreatedAt if provided; fall back to auth creation date.
    // This ensures the coach only analyses data from the current "session" of the account
    // even after the user clears and starts fresh.
    const accountCreatedStr: string = clientAccountCreatedAt ?? toDateOnly(user.created_at)

    // "Today" is the CLIENT's local calendar date. This function runs in UTC, so the
    // server clock is the wrong day for most of the world for part of every day.
    // Accept the client value when it is a plausible date (within 2 days of now).
    const todayStr = clientToday(body.today)
    const today = localDate(todayStr)

    // Return today's cached nudge only if it was generated after accountCreatedAt
    // (prevents stale caches from before a data reset from being served).
    const { data: cached } = await supabase
      .from('ai_nudges')
      .select('message')
      .eq('user_id', user.id)
      .eq('date', todayStr)
      .gte('date', accountCreatedStr)
      .maybeSingle()

    if (cached?.message) {
      return new Response(
        JSON.stringify({ message: cached.message, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: recentGen } = await supabase
      .from('ai_nudges')
      .select('generated_at')
      .eq('user_id', user.id)
      .gte('generated_at', new Date(Date.now() - 60_000).toISOString())
      .limit(1)
      .maybeSingle()

    if (recentGen) {
      return new Response(
        JSON.stringify({ error: 'A nudge was just generated. Please wait a moment before trying again.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const accountCreatedDate = localDate(accountCreatedStr)

    const today2 = today
    const msPerDay = 1000 * 60 * 60 * 24

    // Global query window: up to 30 days back, no earlier than account creation
    const rawCutoff = new Date(today2)
    rawCutoff.setDate(rawCutoff.getDate() - 29)
    const globalCutoffDate = rawCutoff > accountCreatedDate ? rawCutoff : accountCreatedDate
    const globalCutoffStr = dateKey(globalCutoffDate)

    const accountActiveDays = Math.round((today2.getTime() - accountCreatedDate.getTime()) / msPerDay) + 1

    const [{ data: habits }, { data: completionRows }] = await Promise.all([
      supabase.from('habits').select('id, name, icon, volume_goal, created_at, schedule').eq('user_id', user.id),
      supabase
        .from('completions')
        .select('date, habit_id, count')
        .eq('user_id', user.id)
        .gte('date', globalCutoffStr),
    ])

    if (!habits?.length) {
      return new Response(
        JSON.stringify({ message: null, reason: 'no_habits' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const completions: Record<string, Record<string, number>> = {}
    for (const row of completionRows ?? []) {
      if (!completions[row.date]) completions[row.date] = {}
      completions[row.date][row.habit_id] = row.count
    }

    const habitStats = habits.map((h) => {
      const habitCreatedStr = h.created_at ? toDateOnly(h.created_at) : accountCreatedStr
      const habitCreatedDate = localDate(habitCreatedStr)
      const habitStartDate = habitCreatedDate > globalCutoffDate ? habitCreatedDate : globalCutoffDate
      const habitStartStr = dateKey(habitStartDate)
      const schedule = normalizeSchedule(h.schedule)
      const habitActiveDays = Math.max(1, expectedDays(schedule, habitStartDate, today2))

      // Streak of scheduled days done; unscheduled days are skipped, not broken on.
      let streak = 0
      const d = new Date(today2)
      for (let guard = 0; guard < 400; guard++) {
        const dateStr = dateKey(d)
        if (d < habitStartDate) break
        const done = ((completions[dateStr] ?? {})[h.id] ?? 0) >= h.volume_goal
        if (done) streak++
        else if (schedule.type === 'daily' || (schedule.type === 'weekdays' && isScheduledOn(schedule, d))) break
        d.setDate(d.getDate() - 1)
      }

      const completedDays = Object.entries(completions)
        .filter(([date]) => date >= habitStartStr)
        .filter(([, day]) => (day[h.id] ?? 0) >= h.volume_goal)
        .length

      return {
        name: h.name,
        icon: h.icon ?? '',
        createdStr: habitCreatedStr,
        schedule: describeSchedule(schedule),
        streak,
        completedDays,
        activeDays: habitActiveDays,
        rate: Math.min(100, Math.round((completedDays / habitActiveDays) * 100)),
      }
    })

    let overallStreak = 0
    const od = new Date(today2)
    while (overallStreak < accountActiveDays) {
      const dateStr = dateKey(od)
      const day = completions[dateStr] ?? {}
      const activeHabits = habits.filter(h => {
        const hCreated = h.created_at ? toDateOnly(h.created_at) : accountCreatedStr
        return dateStr >= hCreated && isScheduledOn(normalizeSchedule(h.schedule), od)
      })
      const dueToday = activeHabits.filter(h => normalizeSchedule(h.schedule).type !== 'perWeek')
      if (activeHabits.length === 0 || (dueToday.length === 0)) {
        // Rest day: nothing scheduled; the chain survives but does not grow.
        if (overallStreak >= accountActiveDays) break
        od.setDate(od.getDate() - 1)
        if (dateStr <= accountCreatedStr) break
        continue
      }
      if (dueToday.every((h) => (day[h.id] ?? 0) >= h.volume_goal)) {
        overallStreak++
        od.setDate(od.getDate() - 1)
      } else break
    }

    const best = [...habitStats].sort((a, b) => b.rate - a.rate)[0]
    const worst = [...habitStats].sort((a, b) => a.rate - b.rate)[0]

    const accountAgeLine = accountActiveDays === 1
      ? `Account started: ${accountCreatedStr} (first day; be welcoming and encouraging)`
      : `Account started: ${accountCreatedStr} (${accountActiveDays} day${accountActiveDays !== 1 ? 's' : ''} of data)`

    // Tell the model exactly which time spans it may reference based on data available.
    // This prevents the coach from citing "weekly" or "monthly" trends that don't exist yet.
    const timeSpanRule =
      accountActiveDays <= 3
        ? `DATA WINDOW: Only ${accountActiveDays} day${accountActiveDays !== 1 ? 's' : ''} of data exist. Base ALL percentages and observations on exactly these ${accountActiveDays} days. Do NOT mention weekly or monthly trends.`
        : accountActiveDays <= 6
        ? `DATA WINDOW: ${accountActiveDays} days of data. Reference only this ${accountActiveDays}-day window. Weekly averages are not yet meaningful, avoid them.`
        : accountActiveDays <= 13
        ? `DATA WINDOW: ${accountActiveDays} days of data. You may reference trends over the past week. Do not reference monthly patterns.`
        : `DATA WINDOW: ${accountActiveDays} days of data. Weekly and multi-week trends are appropriate.`

    const namePrefix = displayName ? `The user's name is ${displayName}. ` : ''

    const prompt = `You are a warm, encouraging habit coach. ${namePrefix}Based on the user's data below, write a concise daily nudge (2-3 sentences). Acknowledge what they are doing well using specific numbers, then give ONE actionable tip for the habit they struggle with most. Avoid generic openers like "Great job" or "Keep it up". Never use em dashes (the long dash) or en dashes in your response - use commas, hyphens, or separate sentences instead.

${timeSpanRule}
IMPORTANT: Each habit shows its own expected days since it was created, based on its schedule (some habits are only due on certain days or N times a week). Use each habit's own denominator for its completion rate and never call an unscheduled day a miss.

Today: ${todayStr}
${accountAgeLine}
Overall streak: ${overallStreak} day${overallStreak !== 1 ? 's' : ''}
Strongest habit: ${best.icon} ${best.name} - ${best.streak}-day streak, ${best.completedDays}/${best.activeDays} active days (${best.rate}%)
Needs work: ${worst.icon} ${worst.name} - ${worst.streak}-day streak, ${worst.completedDays}/${worst.activeDays} active days (${worst.rate}%)
All habits:
${habitStats.map((h) => `  * ${h.icon} ${h.name} [${h.schedule}]: ${h.streak}-day streak, ${h.completedDays}/${h.activeDays} expected days (${h.rate}%) - active since ${h.createdStr}`).join('\n')}

Write the nudge:`

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })
    const aiResponse = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 250,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text.trim() : ''
    const message = stripEmDashes(raw)

    await supabase.from('ai_nudges').upsert({ user_id: user.id, date: todayStr, message })

    return new Response(
      JSON.stringify({ message, cached: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('generate-nudge error:', (err as Error).message)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
