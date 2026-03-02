import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useTodayLogs(date) {
  const [foodLogs, setFoodLogs] = useState([])
  const [workouts, setWorkouts] = useState([])
  const [waterLogs, setWaterLogs] = useState([])
  const [loading, setLoading] = useState(true)

  const targetDate = date || new Date().toISOString().split('T')[0]

  useEffect(() => {
    fetchLogs()
  }, [targetDate])

  async function fetchLogs() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    const [foodResult, workoutResult, waterResult] = await Promise.all([
      supabase
        .from('food_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('log_date', targetDate)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),

      supabase
        .from('workouts')
        .select('*')
        .eq('user_id', user.id)
        .gte('started_at', `${targetDate}T00:00:00`)
        .lte('started_at', `${targetDate}T23:59:59`)
        .is('deleted_at', null)
        .order('started_at', { ascending: true }),

      supabase
        .from('water_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('log_date', targetDate)
        .order('logged_at', { ascending: true }),
    ])

    setFoodLogs(foodResult.data || [])
    setWorkouts(workoutResult.data || [])
    setWaterLogs(waterResult.data || [])
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

  const mealGroups = {
    breakfast: foodLogs.filter(l => l.meal_type === 'breakfast'),
    lunch:     foodLogs.filter(l => l.meal_type === 'lunch'),
    dinner:    foodLogs.filter(l => l.meal_type === 'dinner'),
    snack:     foodLogs.filter(l => l.meal_type === 'snack'),
    dessert:   foodLogs.filter(l => l.meal_type === 'dessert'),
  }

  return {
    foodLogs, workouts, waterLogs,
    totals, totalWaterMl, mealGroups,
    loading, refresh, today: targetDate
  }
}