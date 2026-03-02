import { supabase } from './supabase'

/**
 * Create a new workout record and return its id.
 * Call this when the user taps "Finish Workout".
 */
export async function saveWorkout({ userId, startedAt, exercises }) {
  // 1. Insert workout header
  const { data: workout, error: workoutError } = await supabase
    .from('workouts')
    .insert({
      user_id: userId,
      started_at: startedAt,
    })
    .select('id')
    .single()

  if (workoutError) throw workoutError

  // 2. Build flat set rows
  const setRows = []
  exercises.forEach((ex) => {
    ex.sets.forEach((set, idx) => {
      if (set.weight !== '' && set.reps !== '') {
        setRows.push({
          workout_id: workout.id,
          exercise_name: ex.name,
          muscle_group: ex.muscleGroup,
          set_number: idx + 1,
          weight_lbs: parseFloat(set.weight),
          reps: parseInt(set.reps, 10),
        })
      }
    })
  })

  if (setRows.length > 0) {
    const { error: setsError } = await supabase.from('workout_sets').insert(setRows)
    if (setsError) throw setsError
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
