import { supabase } from './supabase'

const LBS_TO_KG  = 0.453592
const MI_TO_KM   = 1.60934

function getCardioType(exerciseName) {
  const n = (exerciseName || '').toLowerCase()
  if (/swim/.test(n))                              return 'swim'
  if (/run|jog|treadmill|walk|elliptical/.test(n)) return 'run'
  if (/cycl|bike|bicycle|spin/.test(n))            return 'cycle'
  return 'time_only'
}

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
export async function saveWorkout({ userId, startedAt, exercises, name, caloriesBurned }) {
  // 1. Insert workout header (try with name; fall back without if column doesn't exist yet)
  let workout, workoutError

  const withName = await supabase
    .from('workouts')
    .insert({
      user_id: userId,
      started_at: startedAt,
      name: name || null,
      calories_burned: caloriesBurned || null,
    })
    .select('id')
    .single()

  if (withName.error?.code === 'PGRST204') {
    // 'name' column not in schema yet — insert without it
    const withoutName = await supabase
      .from('workouts')
      .insert({ user_id: userId, started_at: startedAt })
      .select('id')
      .single()
    workout = withoutName.data
    workoutError = withoutName.error
  } else {
    workout = withName.data
    workoutError = withName.error
  }

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

    const isCardio = (ex.muscleGroup || '').toLowerCase() === 'cardio'
    let setRows

    if (isCardio) {
      const ct = getCardioType(ex.name)
      setRows = ex.sets
        .filter((s) => s.duration !== '')
        .map((s, idx) => {
          let distanceKm = 0
          if (ct !== 'time_only' && s.distance) {
            const d = parseFloat(s.distance)
            if (!isNaN(d)) distanceKm = ct === 'swim' ? d / 1000 : d * MI_TO_KM
          }
          return {
            workout_exercise_id: workoutExercise.id,
            set_number: idx + 1,
            weight_kg: distanceKm,           // repurposed: distance in km
            reps: Math.round(parseFloat(s.duration) || 0), // repurposed: duration in minutes
            completed: true,
          }
        })
    } else {
      setRows = ex.sets
        .filter((s) => s.weight !== '' && s.reps !== '')
        .map((s, idx) => ({
          workout_exercise_id: workoutExercise.id,
          set_number: idx + 1,
          weight_kg: parseFloat(s.weight) * LBS_TO_KG,
          reps: parseInt(s.reps, 10),
          completed: true,
        }))
    }

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
