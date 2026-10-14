import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Every table that holds rows keyed by user_id. Deleted here with the service role so
// account deletion does not depend on the client having wiped them first (RLS would
// block the client once the auth user is gone).
const USER_TABLES = [
  'habits', 'completions', 'challenges', 'past_challenges', 'settings', 'daily_snapshots',
  'ai_nudges', 'ai_reflections', 'profiles',
]

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify the caller is authenticated
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

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Wipe the user's rows first; if any of this fails the auth user survives and the
    // client can retry, which is safer than an orphaned account with lingering data.
    const results = await Promise.all(
      USER_TABLES.map((t) => adminClient.from(t).delete().eq('user_id', user.id))
    )
    const failed = results.find((r) => r.error)
    if (failed?.error) {
      return new Response(JSON.stringify({ error: `Failed to delete user data: ${failed.error.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { error } = await adminClient.auth.admin.deleteUser(user.id)
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
