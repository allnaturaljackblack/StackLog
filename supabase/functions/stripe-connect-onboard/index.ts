/**
 * stripe-connect-onboard
 *
 * Creates a Stripe Connect Express account for a creator (or retrieves existing)
 * and returns a hosted onboarding URL.
 *
 * Required Supabase secrets (Dashboard → Edge Functions → Manage secrets):
 *   STRIPE_SECRET_KEY  — sk_live_... or sk_test_...
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-04-10',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { userId } = await req.json()
    if (!userId) throw new Error('userId is required')

    // Get or create creator_settings row
    const { data: existingSettings } = await supabase
      .from('creator_settings')
      .select('stripe_account_id')
      .eq('user_id', userId)
      .maybeSingle()

    let stripeAccountId = existingSettings?.stripe_account_id

    if (!stripeAccountId) {
      // Fetch display name + email from profiles + auth
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', userId)
        .single()

      const { data: { user } } = await supabase.auth.admin.getUserById(userId)

      // Create Stripe Express account
      const account = await stripe.accounts.create({
        type: 'express',
        email: user?.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          name: profile?.display_name || undefined,
          product_description: 'Fitness programming and nutrition plans on StackLog',
        },
        metadata: { userId },
      })

      stripeAccountId = account.id

      // Save to creator_settings
      await supabase.from('creator_settings').upsert({
        user_id: userId,
        stripe_account_id: stripeAccountId,
        is_creator: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
    }

    // Generate onboarding link.
    // Stripe requires https:// URLs — stripe-connect-return serves a redirect
    // page that bounces the user back into the app via the stacklog:// deep link.
    const returnBase = `${Deno.env.get('SUPABASE_URL')}/functions/v1/stripe-connect-return`
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${returnBase}?status=refresh`,
      return_url:  `${returnBase}?status=complete`,
      type: 'account_onboarding',
    })

    return new Response(
      JSON.stringify({ url: accountLink.url }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
