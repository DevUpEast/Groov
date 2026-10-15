// RevenueCat webhook (#40): keeps profiles.is_pro in sync with the 'pro' entitlement.
// Configure in RevenueCat -> Integrations -> Webhooks with the Authorization header
// set to the REVENUECAT_WEBHOOK_SECRET function secret. app_user_id is the Supabase
// user id (the app configures the SDK with appUserID = userId).
import { createClient } from 'npm:@supabase/supabase-js@2'

const GRANT = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE', 'TRANSFER'])
const REVOKE = new Set(['EXPIRATION', 'BILLING_ISSUE', 'SUBSCRIPTION_PAUSED'])

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET') ?? ''
  const auth = req.headers.get('Authorization') ?? ''
  if (!secret || auth !== secret && auth !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    const body = await req.json()
    const ev = body?.event ?? {}
    const userId: string | undefined = ev.app_user_id || ev.original_app_user_id
    const type: string = ev.type ?? ''
    if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
      return new Response(JSON.stringify({ ok: true, ignored: 'no supabase user id' }), { headers: { 'Content-Type': 'application/json' } })
    }
    const entitled = Array.isArray(ev.entitlement_ids) ? ev.entitlement_ids.includes('pro') : true
    let isPro: boolean | null = null
    if (GRANT.has(type) && entitled) isPro = true
    else if (REVOKE.has(type)) isPro = false
    else if (type === 'CANCELLATION') isPro = null // access continues until EXPIRATION
    if (isPro === null) return new Response(JSON.stringify({ ok: true, ignored: type }), { headers: { 'Content-Type': 'application/json' } })

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { error } = await admin.from('profiles').upsert({ user_id: userId, is_pro: isPro }, { onConflict: 'user_id' })
    if (error) throw error
    return new Response(JSON.stringify({ ok: true, user_id: userId, is_pro: isPro }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('revenuecat-webhook error:', (e as Error).message)
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
