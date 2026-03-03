import { supabase } from './supabase'

const LBS_TO_KG = 0.453592

/**
 * Find an exercise by name, or create a custom one if it doesn't exist.
 * Returns the exercise UUID.
 */
async function getOrCreateExercise(name, muscleGroup, userId) {
  const { data: existing } = await supabase
    .from('exercises')
    .select('id')
    .eq('name', name)
    .maybeSingle()

  if (existing) return existing.id

  const { data: created, error } = await supabase
    .from('exercises')
    .insert({
      name,
      is_custom: true,
      created_by: userId,
    })
    .select('id')
    .single()

  if (error) throw error
  return created.id
}

/**
 * Save a completed workout.
 * Chain: workouts → workout_exercises → workout_sets
 */
export async function saveWorkout({ userId, startedAt, exercises }) {
  // 1. Insert workout header
  const { data: workout, error: workoutError } = await supabase
    .from('workouts')
    .insert({ user_id: userId, started_at: startedAt })
    .select('id')
    .single()

  if (workoutError) throw workoutError

  // 2. For each exercise: get/create exercise record → insert workout_exercise → insert sets
  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i]

    const exerciseId = await getOrCreateExercise(ex.name, ex.muscleGroup, userId)

    const { data: workoutExercise, error: weError } = await supabase
      .from('workout_exercises')
      .insert({
        workout_id: workout.id,
        exercise_id: exerciseId,
        order_index: i,
      })
      .select('id')
      .single()

    if (weError) throw weError

    const setRows = ex.sets
      .filter((s) => s.weight !== '' && s.reps !== '')
      .map((s, idx) => ({
        workout_exercise_id: workoutExercise.id,
        set_number: idx + 1,
        weight_kg: parseFloat(s.weight) * LBS_TO_KG,
        reps: parseInt(s.reps, 10),
        completed: true,
      }))

    if (setRows.length > 0) {
      const { error: setsError } = await supabase.from('workout_sets').insert(setRows)
      if (setsError) throw setsError
    }
  }

  return workout.id
}

/**
 * Fetch recent workouts for a user (last 20).
 */
export async function getRecentWorkouts(userId, limit = 20) {
  const { data, error } = await supabase
    .from('workouts')
    .select('id, started_at')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}
