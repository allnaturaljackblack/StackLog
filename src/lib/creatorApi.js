/**
 * creatorApi.js
 *
 * All client-side creator / subscription queries.
 * Stripe API calls are handled server-side via Supabase Edge Functions.
 */

import { supabase } from './supabase'
import * as WebBrowser from 'expo-web-browser'

// ─── Creator settings ─────────────────────────────────────────────────────────

/**
 * Returns the creator_settings row for a user, or null if they haven't set one up.
 */
export async function getCreatorSettings(userId) {
  const { data, error } = await supabase
    .from('creator_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

/**
 * Create or update creator settings for the current user.
 */
export async function upsertCreatorSettings(userId, fields) {
  const { data, error } = await supabase
    .from('creator_settings')
    .upsert({ user_id: userId, ...fields, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) throw error
  return data
}

// ─── Subscription checks ──────────────────────────────────────────────────────

/**
 * Returns true if subscriberId has an active subscription to creatorId.
 * Also returns true if subscriberId === creatorId (creator always sees own content).
 */
export async function checkSubscription(subscriberId, creatorId) {
  if (subscriberId === creatorId) return true

  const { data } = await supabase
    .from('creator_subscriptions')
    .select('status')
    .eq('subscriber_id', subscriberId)
    .eq('creator_id', creatorId)
    .eq('status', 'active')
    .maybeSingle()

  return !!data
}

/**
 * Batch-fetch creator settings for multiple users at once.
 * Returns a Map of userId → settings row (only rows where is_creator = true).
 */
export async function batchGetCreatorSettings(userIds) {
  if (!userIds.length) return new Map()

  const { data } = await supabase
    .from('creator_settings')
    .select('*')
    .in('user_id', userIds)
    .eq('is_creator', true)

  const map = new Map()
  for (const row of (data || [])) {
    map.set(row.user_id, row)
  }
  return map
}

/**
 * Batch-check subscriptions for multiple creators at once.
 * Returns a Set of creatorIds the viewer is subscribed to.
 */
export async function batchCheckSubscriptions(subscriberId, creatorIds) {
  if (!creatorIds.length) return new Set()

  const { data } = await supabase
    .from('creator_subscriptions')
    .select('creator_id')
    .eq('subscriber_id', subscriberId)
    .in('creator_id', creatorIds)
    .eq('status', 'active')

  return new Set((data || []).map((r) => r.creator_id))
}

// ─── Creator dashboard stats ──────────────────────────────────────────────────

/**
 * Returns active subscriber count for a creator.
 */
export async function getSubscriberCount(creatorId) {
  const { count, error } = await supabase
    .from('creator_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('creator_id', creatorId)
    .eq('status', 'active')

  if (error) throw error
  return count || 0
}

/**
 * Returns estimated monthly revenue for a creator (subscribers × monthly price).
 * This is approximate — annual subscribers are divided by 12.
 */
export async function getEstimatedMonthlyRevenue(creatorId, monthlyPriceCents, annualPriceCents) {
  const { data, error } = await supabase
    .from('creator_subscriptions')
    .select('plan_type')
    .eq('creator_id', creatorId)
    .eq('status', 'active')

  if (error) throw error

  const subs = data || []
  const monthly = subs.filter((s) => s.plan_type === 'monthly').length
  const annual  = subs.filter((s) => s.plan_type === 'annual').length

  const monthlyRevenue = monthly * (monthlyPriceCents || 0)
  const annualRevenue  = annual  * ((annualPriceCents || 0) / 12)

  return Math.round(monthlyRevenue + annualRevenue) // in cents
}

// ─── Platform fee config ──────────────────────────────────────────────────────

export async function getPlatformFeeConfig() {
  const { data, error } = await supabase
    .from('platform_fee_config')
    .select('default_monthly_fee_cents, default_revenue_pct')
    .single()

  if (error) throw error
  return data
}

// ─── Internal helper ──────────────────────────────────────────────────────────

/**
 * Extracts the real error message from a failed supabase.functions.invoke call.
 * The JS client only surfaces "Edge function returned a non-2xx status code"
 * by default; the actual message lives in the JSON response body.
 */
async function extractFunctionError(error, fallback) {
  if (error?.context) {
    try {
      const body = await error.context.json()
      if (body?.error) return body.error
    } catch {}
  }
  return error?.message || fallback
}

// ─── Stripe via Edge Functions ────────────────────────────────────────────────

/**
 * Starts the Stripe Connect Express onboarding flow.
 * Opens the Stripe-hosted onboarding page in the browser.
 * After completion, Stripe redirects back to the app via deep link.
 */
export async function startStripeOnboarding(userId) {
  const { data, error } = await supabase.functions.invoke('stripe-connect-onboard', {
    body: { userId },
  })

  if (error) throw new Error(await extractFunctionError(error, 'Failed to start Stripe onboarding'))
  if (!data?.url) throw new Error('No onboarding URL returned')

  const result = await WebBrowser.openAuthSessionAsync(data.url, 'stacklog://stripe-return')
  return result
}

/**
 * Creates or updates the Stripe Product + Prices for a creator.
 * Call this after the creator sets/changes their pricing.
 */
export async function createStripeProduct(userId, monthlyPriceCents, annualPriceCents) {
  const { data, error } = await supabase.functions.invoke('stripe-create-product', {
    body: { userId, monthlyPriceCents, annualPriceCents: annualPriceCents || null },
  })

  if (error) throw new Error(await extractFunctionError(error, 'Failed to create Stripe product'))
  return data
}

/**
 * Creates a Stripe Checkout session for a subscriber.
 * Opens the Stripe-hosted checkout page in the browser.
 * After payment, Stripe redirects back via deep link.
 */
export async function startSubscribeCheckout(subscriberId, creatorId, planType = 'monthly') {
  const { data, error } = await supabase.functions.invoke('stripe-checkout', {
    body: { subscriberId, creatorId, planType },
  })

  if (error) throw new Error(await extractFunctionError(error, 'Failed to create checkout session'))
  if (!data?.url) throw new Error('No checkout URL returned')

  const result = await WebBrowser.openAuthSessionAsync(
    data.url,
    'stacklog://subscribe-return'
  )
  return result
}
