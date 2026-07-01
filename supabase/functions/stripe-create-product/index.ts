/**
 * stripe-create-product
 *
 * Creates or updates the Stripe Product + Prices for a creator's subscription offering.
 * Called when a creator sets or changes their pricing.
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
    const { userId, monthlyPriceCents, annualPriceCents } = await req.json()
    if (!userId || !monthlyPriceCents) throw new Error('userId and monthlyPriceCents are required')

    const { data: settings } = await supabase
      .from('creator_settings')
      .select('stripe_account_id, stripe_product_id, stripe_monthly_price_id, stripe_annual_price_id')
      .eq('user_id', userId)
      .single()

    if (!settings?.stripe_account_id) throw new Error('Creator has not connected Stripe yet')

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, username')
      .eq('id', userId)
      .single()

    const creatorName = profile?.display_name || profile?.username || 'Creator'
    const stripeAccountId = settings.stripe_account_id

    // Create or retrieve the Product
    let productId = settings.stripe_product_id
    if (!productId) {
      const product = await stripe.products.create(
        {
          name: `${creatorName} — StackLog Subscription`,
          description: `Access ${creatorName}'s fitness programming and nutrition plans on StackLog.`,
          metadata: { userId },
        },
        { stripeAccount: stripeAccountId }
      )
      productId = product.id
    } else {
      // Update product name in case display_name changed
      await stripe.products.update(
        productId,
        { name: `${creatorName} — StackLog Subscription` },
        { stripeAccount: stripeAccountId }
      )
    }

    // Archive old prices if they exist (Stripe prices are immutable once created)
    if (settings.stripe_monthly_price_id) {
      await stripe.prices.update(
        settings.stripe_monthly_price_id,
        { active: false },
        { stripeAccount: stripeAccountId }
      ).catch(() => {}) // ignore if already inactive
    }
    if (settings.stripe_annual_price_id) {
      await stripe.prices.update(
        settings.stripe_annual_price_id,
        { active: false },
        { stripeAccount: stripeAccountId }
      ).catch(() => {})
    }

    // Create new monthly price
    const monthlyPrice = await stripe.prices.create(
      {
        product: productId,
        unit_amount: monthlyPriceCents,
        currency: 'usd',
        recurring: { interval: 'month' },
        metadata: { userId, plan_type: 'monthly' },
      },
      { stripeAccount: stripeAccountId }
    )

    // Create annual price if provided
    let annualPriceId = null
    if (annualPriceCents) {
      const annualPrice = await stripe.prices.create(
        {
          product: productId,
          unit_amount: annualPriceCents,
          currency: 'usd',
          recurring: { interval: 'year' },
          metadata: { userId, plan_type: 'annual' },
        },
        { stripeAccount: stripeAccountId }
      )
      annualPriceId = annualPrice.id
    }

    // Save all IDs back to creator_settings
    await supabase.from('creator_settings').update({
      stripe_product_id:        productId,
      stripe_monthly_price_id:  monthlyPrice.id,
      stripe_annual_price_id:   annualPriceId,
      monthly_price_cents:      monthlyPriceCents,
      annual_price_cents:       annualPriceCents || null,
      updated_at:               new Date().toISOString(),
    }).eq('user_id', userId)

    return new Response(
      JSON.stringify({ success: true, productId, monthlyPriceId: monthlyPrice.id, annualPriceId }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
