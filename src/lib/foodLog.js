import { supabase } from './supabase'
import { calculateNutrition } from './foodApi'

export async function upsertFood(food) {
  try {
    const { data: existing } = await supabase
      .from('foods')
      .select('id')
      .eq('source', food.source)
      .eq('external_id', food.external_id)
      .single()

    if (existing) return existing.id

    const { data, error } = await supabase
      .from('foods')
      .insert({
        source: food.source,
        external_id: food.external_id,
        barcode: food.barcode,
        name: food.name,
        brand: food.brand,
        image_url: food.image_url,
        serving_description: food.serving_description,
        calories_per_100g: food.calories_per_100g,
        protein_per_100g: food.protein_per_100g,
        carbs_per_100g: food.carbs_per_100g,
        fat_per_100g: food.fat_per_100g,
        fiber_per_100g: food.fiber_per_100g,
        sugar_per_100g: food.sugar_per_100g,
        sodium_per_100g: food.sodium_per_100g,
        saturated_fat_per_100g: food.saturated_fat_per_100g,
      })
      .select('id')
      .single()

    if (error) {
      console.error('Upsert food error:', JSON.stringify(error))
      throw error
    }

    return data.id
  } catch (error) {
    console.error('Upsert food error:', JSON.stringify(error))
    throw error
  }
}

export async function logFood({
  food,
  quantityAmount,
  quantityUnit,
  quantityUnitDisplay,
  quantityG,
  mealType,
  logDate,
  userId,
  copiedFromDate = null,
}) {
  try {
    const nutrition = calculateNutrition(food, quantityG)
    const foodId = await upsertFood(food)

    const { error } = await supabase.from('food_logs').insert({
      user_id: userId,
      food_id: foodId,
      log_date: logDate,
      meal_type: mealType,
      quantity_amount: quantityAmount,
      quantity_unit: quantityUnit,
      quantity_unit_display: quantityUnitDisplay,
      quantity_g: quantityG,
      calories: nutrition.calories,
      protein_g: nutrition.protein_g,
      carbs_g: nutrition.carbs_g,
      fat_g: nutrition.fat_g,
      fiber_g: nutrition.fiber_g,
      sugar_g: nutrition.sugar_g,
      sodium_mg: nutrition.sodium_mg,
      copied_from_date: copiedFromDate,
    })

    if (error) {
      console.error('Log food error:', JSON.stringify(error))
      throw error
    }
  } catch (error) {
    console.error('Log food error:', JSON.stringify(error))
    throw error
  }
}

export async function getRecentFoods(userId, limit = 10) {
  const { data } = await supabase
    .from('food_logs')
    .select(`
      food_id,
      quantity_unit,
      quantity_amount,
      foods (
        id, name, brand, calories_per_100g,
        protein_per_100g, carbs_per_100g, fat_per_100g,
        fiber_per_100g, sugar_per_100g, sodium_per_100g,
        serving_description, source, external_id
      )
    `)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!data) return []

  const seen = new Set()
  return data
    .filter(log => {
      if (!log.foods || seen.has(log.food_id)) return false
      seen.add(log.food_id)
      return true
    })
    .map(log => log.foods)
}