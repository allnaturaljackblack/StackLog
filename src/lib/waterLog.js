import { supabase } from './supabase'

export async function logWater(userId, amountMl, logDate) {
  const { error } = await supabase
    .from('water_logs')
    .insert({
      user_id: userId,
      amount_ml: amountMl,
      log_date: logDate,
      logged_at: new Date().toISOString(),
    })
  if (error) console.error('Water log error:', error)
}