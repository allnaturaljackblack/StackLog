import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useTodayLogs(date) {
  const [foodLogs, setFoodLogs] = useState([])
  const [workouts, setWorkouts] = useState([])
  const [waterLogs, setWaterLogs] = useState([])
  const [calorieBurns, setCalorieBurns] = useState([])
  const [loading, setLoading] = useState(true)

  const targetDate = date || (() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  })()

  useEffect(() => {
    fetchLogs()
  }, [targetDate])

  async function fetchLogs() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    const [foodResult, workoutResult, waterResult, burnResult] = await Promise.all([
      supabase
        .from('food_logs')
        .select('*, foods(name, brand)')
        .eq('user_id', user.id)
        .eq('log_date', targetDate)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),

      supabase
        .from('workouts')
        .select(`
          id, started_at, name, notes, calories_burned,
          workout_exercises (
            id, order_index,
            exercises ( name ),
            workout_sets ( set_number, weight_kg, reps )
          )
        `)
        .eq('user_id', user.id)
        .gte('started_at', new Date(`${targetDate}T00:00:00`).toISOString())
        .lte('started_at', new Date(`${targetDate}T23:59:59.999`).toISOString())
        .is('deleted_at', null)
        .order('started_at', { ascending: true }),

      supabase
        .from('water_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('log_date', targetDate)
        .order('logged_at', { ascending: true }),

      supabase
        .from('calorie_burns')
        .select('*')
        .eq('user_id', user.id)
        .eq('log_date', targetDate)
        .order('created_at', { ascending: false }),
    ])

    setFoodLogs(foodResult.data || [])
    setWorkouts(workoutResult.data || [])
    setWaterLogs(waterResult.data || [])
    setCalorieBurns(burnResult.data || [])
    setLoading(false)
  }

  async function refresh() {
    await fetchLogs()
  }

  const totals = foodLogs.reduce((acc, log) => ({
    calories: acc.calories + (log.calories || 0),
    protein:  acc.protein  + (log.protein_g || 0),
    carbs:    acc.carbs    + (log.carbs_g || 0),
    fat:      acc.fat      + (log.fat_g || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 })

  const totalWaterMl = waterLogs.reduce((acc, log) => acc + log.amount_ml, 0)

  // Sum calories burned: workout entries + manual entries
  const totalBurned =
    workouts.reduce((sum, w) => sum + (w.calories_burned || 0), 0) +
    calorieBurns.reduce((sum, b) => sum + (b.calories || 0), 0)

  const mealGroups = {
    breakfast: foodLogs.filter(l => l.meal_type === 'breakfast'),
    lunch:     foodLogs.filter(l => l.meal_type === 'lunch'),
    dinner:    foodLogs.filter(l => l.meal_type === 'dinner'),
    snack:     foodLogs.filter(l => l.meal_type === 'snack'),
    dessert:   foodLogs.filter(l => l.meal_type === 'dessert'),
  }

  return {
    foodLogs, workouts, waterLogs, calorieBurns,
    totals, totalWaterMl, totalBurned, mealGroups,
    loading, refresh, today: targetDate
  }
}
