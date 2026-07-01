/**
 * stripe-checkout
 *
 * Creates a Stripe Checkout session for a fan subscribing to a creator.
 * Platform fee is applied via application_fee_percent.
 * Returns a hosted checkout URL that opens in the browser.
 *
 * Required secrets: STRIPE_SECRET_KEY
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
    const { subscriberId, creatorId, planType = 'monthly' } = await req.json()
    if (!subscriberId || !creatorId) throw new Error('subscriberId and creatorId are required')

    // Load creator settings + fee config in parallel
    const [{ data: creatorSettings }, { data: feeConfig }] = await Promise.all([
      supabase
        .from('creator_settings')
        .select('stripe_account_id, stripe_monthly_price_id, stripe_annual_price_id, platform_monthly_fee_cents, platform_revenue_pct')
        .eq('user_id', creatorId)
        .single(),
      supabase
        .from('platform_fee_config')
        .select('default_revenue_pct')
        .single(),
    ])

    if (!creatorSettings?.stripe_account_id) throw new Error('Creator has not connected Stripe')
    const priceId = planType === 'annual'
      ? creatorSettings.stripe_annual_price_id
      : creatorSettings.stripe_monthly_price_id

    if (!priceId) throw new Error('Creator has not set up pricing yet')

    // Effective revenue % (per-creator override takes precedence over platform default)
    const revenuePct = creatorSettings.platform_revenue_pct ?? feeConfig?.default_revenue_pct ?? 15

    // Get subscriber email for prefill
    const { data: { user: subscriber } } = await supabase.auth.admin.getUserById(subscriberId)

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        customer_email: subscriber?.email,
        subscription_data: {
          application_fee_percent: revenuePct,
          metadata: {
            subscriber_id: subscriberId,
            creator_id:    creatorId,
            plan_type:     planType,
          },
        },
        success_url: 'stacklog://subscribe-return?status=success&creator=' + creatorId,
        cancel_url:  'stacklog://subscribe-return?status=cancel',
        metadata: {
          subscriber_id: subscriberId,
          creator_id:    creatorId,
          plan_type:     planType,
        },
      },
      { stripeAccount: creatorSettings.stripe_account_id }
    )

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
