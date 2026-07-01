/**
 * useSync.js
 *
 * Runs auto-sync for all connected fitness integrations on app open.
 * Call this once after the user's session is established.
 *
 * Usage (in App.js):
 *   const { syncing, lastResult, triggerSync } = useSync(userId)
 */

import { useState, useEffect, useCallback } from 'react'
import { Platform } from 'react-native'
import { saveExternalWorkouts } from '../lib/syncEngine'
import {
  isHealthKitAvailable,
  requestHealthKitPermissions,
  fetchWorkoutsSince   as hkFetchWorkouts,
  getLastSyncDate      as hkGetLastSync,
  setLastSyncDate      as hkSetLastSync,
} from '../lib/integrations/healthkit'
import {
  isStravaConnected,
  fetchActivitiesSince as stravaFetch,
  getLastSyncDate      as stravaGetLastSync,
  setLastSyncDate      as stravaSetLastSync,
} from '../lib/integrations/strava'
import {
  isWhoopConnected,
  fetchWorkoutsSince   as whoopFetch,
  getLastSyncDate      as whoopGetLastSync,
  setLastSyncDate      as whoopSetLastSync,
} from '../lib/integrations/whoop'

export default function useSync(userId) {
  const [syncing,    setSyncing]    = useState(false)
  const [lastResult, setLastResult] = useState(null)

  const triggerSync = useCallback(async (source = 'all') => {
    if (!userId || syncing) return
    setSyncing(true)

    const now    = new Date()
    const totals = { saved: 0, skipped: 0, errors: [] }

    try {
      // ── HealthKit ──────────────────────────────────────────────────────────
      if ((source === 'all' || source === 'healthkit') && Platform.OS === 'ios') {
        try {
          const available = await isHealthKitAvailable()
          if (available) {
            await requestHealthKitPermissions()
            const sinceDate = await hkGetLastSync()
            const workouts  = await hkFetchWorkouts(sinceDate)
            const result    = await saveExternalWorkouts(userId, workouts)
            totals.saved   += result.saved
            totals.skipped += result.skipped
            totals.errors.push(...result.errors)
            await hkSetLastSync(now)
          }
        } catch (err) {
          console.warn('[useSync] HealthKit error:', err.message)
          totals.errors.push(err)
        }
      }

      // ── Strava ────────────────────────────────────────────────────────────
      if (source === 'all' || source === 'strava') {
        try {
          const connected = await isStravaConnected()
          if (connected) {
            const sinceDate  = await stravaGetLastSync()
            const activities = await stravaFetch(sinceDate)
            const result     = await saveExternalWorkouts(userId, activities)
            totals.saved    += result.saved
            totals.skipped  += result.skipped
            totals.errors.push(...result.errors)
            await stravaSetLastSync(now)
          }
        } catch (err) {
          console.warn('[useSync] Strava error:', err.message)
          totals.errors.push(err)
        }
      }

      // ── Whoop ─────────────────────────────────────────────────────────────
      if (source === 'all' || source === 'whoop') {
        try {
          const connected = await isWhoopConnected()
          if (connected) {
            const sinceDate = await whoopGetLastSync()
            const workouts  = await whoopFetch(sinceDate)
            const result    = await saveExternalWorkouts(userId, workouts)
            totals.saved   += result.saved
            totals.skipped += result.skipped
            totals.errors.push(...result.errors)
            await whoopSetLastSync(now)
          }
        } catch (err) {
          console.warn('[useSync] Whoop error:', err.message)
          totals.errors.push(err)
        }
      }

      setLastResult({ ...totals, syncedAt: now })
    } finally {
      setSyncing(false)
    }
  }, [userId, syncing])

  // Auto-sync on mount (i.e., when the app opens with a valid session)
  useEffect(() => {
    if (userId) {
      triggerSync('all')
    }
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  return { syncing, lastResult, triggerSync }
}
