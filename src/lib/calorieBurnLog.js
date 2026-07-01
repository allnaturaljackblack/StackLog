import { supabase } from './supabase'

/**
 * Log a manual calorie burn entry (e.g. from the Nutrition page).
 */
export async function logCalorieBurn({ userId, logDate, calories, notes }) {
  const { error } = await supabase.from('calorie_burns').insert({
    user_id: userId,
    log_date: logDate,
    calories: Math.round(calories),
    notes: notes || null,
  })
  if (error) throw error
}

/**
 * Fetch all manual burn entries for a given date.
 */
export async function getCalorieBurns({ userId, logDate }) {
  const { data, error } = await supabase
    .from('calorie_burns')
    .select('*')
    .eq('user_id', userId)
    .eq('log_date', logDate)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

/**
 * Update calories and/or notes on an existing burn entry.
 */
export async function updateCalorieBurn(id, { calories, notes }) {
  const { error } = await supabase
    .from('calorie_burns')
    .update({ calories: Math.round(calories), notes: notes || null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
}

/**
 * Delete a manual burn entry.
 */
export async function deleteCalorieBurn(id) {
  const { error } = await supabase.from('calorie_burns').delete().eq('id', id)
  if (error) throw error
}
