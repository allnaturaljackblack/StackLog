/**
 * stripe-webhook
 *
 * Handles Stripe subscription lifecycle events and keeps
 * creator_subscriptions in sync.
 *
 * Required secrets:
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET  — from Stripe Dashboard → Webhooks → Signing secret
 *
 * Stripe events handled:
 *   customer.subscription.created
 *   customer.subscription.updated
 *   customer.subscription.deleted
 *   checkout.session.completed
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-04-10',
  httpClient: Stripe.createFetchHttpClient(),
})

const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

// Use service role — bypasses RLS so webhook can write subscription records
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

serve(async (req) => {
  const body      = await req.text()
  const signature = req.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    return new Response(`Webhook signature verification failed: ${err.message}`, { status: 400 })
  }

  try {
    switch (event.type) {

      // ── checkout.session.completed ─────────────────────────────────────────
      // Fired when a subscriber completes the checkout flow.
      // At this point we know who subscribed to whom but may not have the
      // subscription object yet — we use the subscription ID from the session.
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const meta = session.metadata ?? {}
        const subscriberId = meta.subscriber_id
        const creatorId    = meta.creator_id
        const planType     = meta.plan_type ?? 'monthly'

        if (!subscriberId || !creatorId) break

        const subId      = session.subscription as string
        const customerId = session.customer as string

        await supabase.from('creator_subscriptions').upsert({
          subscriber_id:          subscriberId,
          creator_id:             creatorId,
          stripe_subscription_id: subId,
          stripe_customer_id:     customerId,
          plan_type:              planType,
          status:                 'active',
          updated_at:             new Date().toISOString(),
        }, { onConflict: 'subscriber_id,creator_id' })
        break
      }

      // ── customer.subscription.updated ─────────────────────────────────────
      case 'customer.subscription.updated': {
        const sub  = event.data.object as Stripe.Subscription
        const meta = sub.metadata ?? {}
        const subscriberId = meta.subscriber_id
        const creatorId    = meta.creator_id

        if (!subscriberId || !creatorId) break

        await supabase.from('creator_subscriptions')
          .update({
            status:             sub.status,
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            updated_at:         new Date().toISOString(),
          })
          .eq('stripe_subscription_id', sub.id)
        break
      }

      // ── customer.subscription.deleted ─────────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        await supabase.from('creator_subscriptions')
          .update({ status: 'canceled', updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', sub.id)
        break
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[stripe-webhook] Error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
