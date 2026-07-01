/**
 * syncEngine.js
 *
 * Converts normalized external workout objects (from healthkit/strava/whoop) into
 * StackLog's DB schema and saves them. Handles deduplication via workout_syncs.
 *
 * External workout shape (common across all sources):
 * {
 *   source:        'healthkit' | 'strava' | 'whoop'
 *   externalId:    string           — unique ID within that source
 *   name:          string           — exercise/activity name
 *   startedAt:     ISO string       — workout start time
 *   caloriesBurned: number | null
 *   distanceKm:    number | null
 *   durationMin:   number | null
 *   sourceName:    string           — display name of the source app
 * }
 */

import { supabase } from './supabase'

// ─── Exercise helpers ─────────────────────────────────────────────────────────

async function getOrCreateExercise(name, userId) {
  const { data: existing } = await supabase
    .from('exercises')
    .select('id')
    .ilike('name', name)
    .maybeSingle()

  if (existing) return existing.id

  const { data: created, error } = await supabase
    .from('exercises')
    .insert({ name, is_custom: true, created_by: userId })
    .select('id')
    .single()

  if (error) throw error
  return created.id
}

// ─── Deduplication ────────────────────────────────────────────────────────────

/**
 * Returns true if this external workout has already been synced.
 */
export async function isAlreadySynced(userId, source, externalId) {
  const { data } = await supabase
    .from('workout_syncs')
    .select('id')
    .eq('user_id', userId)
    .eq('source', source)
    .eq('external_id', externalId)
    .maybeSingle()

  return !!data
}

async function recordSync(userId, workoutId, source, externalId) {
  await supabase.from('workout_syncs').insert({
    user_id:     userId,
    workout_id:  workoutId,
    source,
    external_id: externalId,
  })
}

// ─── Core save ────────────────────────────────────────────────────────────────

/**
 * Saves one external workout to StackLog's database.
 * Skips silently if the workout has already been synced.
 * Returns the new workout_id, or null if skipped.
 */
export async function saveExternalWorkout(userId, workout) {
  const { source, externalId, name, startedAt, caloriesBurned, distanceKm, durationMin } = workout

  // Dedup check
  const alreadyDone = await isAlreadySynced(userId, source, externalId)
  if (alreadyDone) return null

  // 1. Insert workout row
  const { data: workoutRow, error: workoutError } = await supabase
    .from('workouts')
    .insert({
      user_id:         userId,
      started_at:      startedAt,
      name:            name || null,
      calories_burned: caloriesBurned || null,
    })
    .select('id')
    .single()

  if (workoutError) throw workoutError

  const workoutId = workoutRow.id

  // 2. Get or create exercise record (treat all external workouts as Cardio)
  const exerciseId = await getOrCreateExercise(name, userId)

  // 3. Insert workout_exercise
  const { data: weRow, error: weError } = await supabase
    .from('workout_exercises')
    .insert({
      workout_id:  workoutId,
      exercise_id: exerciseId,
      order_index: 0,
    })
    .select('id')
    .single()

  if (weError) throw weError

  // 4. Insert one set row (data already in km / minutes — no unit conversion needed)
  const hasMeaningfulSet = durationMin || distanceKm
  if (hasMeaningfulSet) {
    const { error: setError } = await supabase.from('workout_sets').insert({
      workout_exercise_id: weRow.id,
      set_number:          1,
      weight_kg:           distanceKm || 0,           // repurposed: distance in km
      reps:                Math.round(durationMin || 0), // repurposed: duration in minutes
      completed:           true,
    })
    if (setError) throw setError
  }

  // 5. Record the sync so we never import this workout again
  await recordSync(userId, workoutId, source, externalId)

  return workoutId
}

/**
 * Batch-save an array of external workouts for a user.
 * Returns { saved: number, skipped: number, errors: Error[] }
 */
export async function saveExternalWorkouts(userId, workouts) {
  let saved   = 0
  let skipped = 0
  const errors = []

  for (const w of workouts) {
    try {
      const id = await saveExternalWorkout(userId, w)
      if (id) {
        saved++
      } else {
        skipped++
      }
    } catch (err) {
      console.warn('[syncEngine] Failed to save workout', w.externalId, err.message)
      errors.push(err)
    }
  }

  return { saved, skipped, errors }
}
