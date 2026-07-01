import { supabase } from './supabase'

// ---------------------------------------------------------------------------
// Follow actions
// ---------------------------------------------------------------------------

/**
 * Send a follow request (or auto-accept if the target profile is public).
 * @param {string} targetId  - UUID of the user to follow
 * @param {string} targetVisibility - 'public' | 'friends_only' | 'private'
 */
export async function sendFollowRequest(targetId, targetVisibility) {
  const { data: { user } } = await supabase.auth.getUser()
  const status = targetVisibility === 'public' ? 'accepted' : 'pending'
  const { error } = await supabase
    .from('follows')
    .insert({ follower_id: user.id, following_id: targetId, status })
  // Ignore unique-constraint violation (already following / already requested)
  if (error && !error.message?.includes('duplicate') && !error.code === '23505') {
    throw error
  }
}

/**
 * Accept an incoming follow request.
 * @param {string} followId - UUID of the row in the follows table
 */
export async function acceptFollowRequest(followId) {
  const { error } = await supabase
    .from('follows')
    .update({ status: 'accepted' })
    .eq('id', followId)
  if (error) throw error
}

/**
 * Decline (delete) an incoming follow request.
 * @param {string} followId - UUID of the row in the follows table
 */
export async function declineFollowRequest(followId) {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('id', followId)
  if (error) throw error
}

/**
 * Unfollow a user (delete your outgoing follow row).
 * @param {string} targetId - UUID of the user to unfollow
 */
export async function unfollowUser(targetId) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', user.id)
    .eq('following_id', targetId)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Status / counts
// ---------------------------------------------------------------------------

/**
 * Get the follow relationship status between the current user and a target.
 * @returns {'none'|'pending'|'accepted'|'incoming_pending'}
 */
export async function getFollowStatus(targetId) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('follows')
    .select('id, follower_id, following_id, status')
    .or(
      `and(follower_id.eq.${user.id},following_id.eq.${targetId}),` +
      `and(follower_id.eq.${targetId},following_id.eq.${user.id})`
    )
  if (error) throw error

  const outgoing = data?.find(r => r.follower_id === user.id)
  const incoming = data?.find(r => r.following_id === user.id)

  if (outgoing?.status === 'accepted') return 'accepted'
  if (outgoing?.status === 'pending')  return 'pending'
  if (incoming?.status === 'pending')  return 'incoming_pending'
  return 'none'
}

/**
 * Get follower and following counts for a user.
 * @returns {{ followersCount: number, followingCount: number }}
 */
export async function getFollowCounts(userId) {
  const [followersRes, followingRes] = await Promise.all([
    supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('following_id', userId)
      .eq('status', 'accepted'),
    supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('follower_id', userId)
      .eq('status', 'accepted'),
  ])
  return {
    followersCount: followersRes.count ?? 0,
    followingCount: followingRes.count ?? 0,
  }
}

/**
 * Get incoming pending follow requests for a user.
 * @returns {Array<{ followId: string, profile: object }>}
 */
export async function getPendingRequests(userId) {
  const { data, error } = await supabase
    .from('follows')
    .select('id, follower_id, profiles!follows_follower_id_fkey(id, display_name, username, avatar_url)')
    .eq('following_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(row => ({
    followId: row.id,
    profile:  row.profiles,
  }))
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Search users by display_name or username.
 * Excludes the current user. Returns up to 30 results with follow status.
 */
export async function searchUsers(query) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!query?.trim()) return []

  const q = query.trim()

  // Fetch matching profiles
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, display_name, username, avatar_url, visibility')
    .neq('id', user.id)
    .or(`display_name.ilike.%${q}%,username.ilike.%${q}%`)
    .limit(30)
  if (error) throw error
  if (!profiles?.length) return []

  // Fetch follow relationships for all results in one query
  const ids = profiles.map(p => p.id)
  const { data: follows } = await supabase
    .from('follows')
    .select('id, follower_id, following_id, status')
    .or(
      `and(follower_id.eq.${user.id},following_id.in.(${ids.join(',')})),` +
      `and(following_id.eq.${user.id},follower_id.in.(${ids.join(',')}))`
    )

  return profiles.map(profile => {
    const outgoing = follows?.find(
      f => f.follower_id === user.id && f.following_id === profile.id
    )
    let followStatus = 'none'
    if (outgoing?.status === 'accepted') followStatus = 'accepted'
    else if (outgoing?.status === 'pending') followStatus = 'pending'
    return { ...profile, followStatus }
  })
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

/**
 * Fetch daily post data for all users the current user follows (accepted only).
 * Uses batch queries (one per data type) — not N+1.
 * @param {string} date - 'YYYY-MM-DD'
 * @returns {Array} Array of post objects, one per followed user who has any data
 */
export async function getFeedPosts(date) {
  const { data: { user } } = await supabase.auth.getUser()

  // 1. Get accepted following IDs
  const { data: follows, error: fErr } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', user.id)
    .eq('status', 'accepted')
  if (fErr) throw fErr
  if (!follows?.length) return []

  const followingIds = follows.map(f => f.following_id)

  // 2. Batch queries in parallel
  const startOfDay = `${date}T00:00:00`
  const endOfDay   = `${date}T23:59:59`

  const [
    { data: dailyLogs },
    { data: foodLogs },
    { data: workouts },
    { data: calorieBurns },
    { data: profiles },
  ] = await Promise.all([
    supabase
      .from('daily_logs')
      .select('*')
      .in('user_id', followingIds)
      .eq('log_date', date),

    supabase
      .from('food_logs')
      .select('user_id, meal_type, calories, protein_g, carbs_g, fat_g, foods(name, brand)')
      .in('user_id', followingIds)
      .eq('log_date', date)
      .is('deleted_at', null),

    supabase
      .from('workouts')
      .select(`
        id, user_id, started_at, name, notes, calories_burned,
        workout_exercises (
          id, order_index,
          exercises ( name ),
          workout_sets ( set_number, weight_kg, reps )
        )
      `)
      .in('user_id', followingIds)
      .gte('started_at', startOfDay)
      .lte('started_at', endOfDay),

    supabase
      .from('calorie_burns')
      .select('*')
      .in('user_id', followingIds)
      .eq('log_date', date),

    supabase
      .from('profiles')
      .select('id, display_name, username, avatar_url')
      .in('id', followingIds),
  ])

  // 3. Group by user_id and compute totals
  return followingIds
    .map(uid => {
      const profile      = profiles?.find(p => p.id === uid) ?? null
      const dailyLog     = dailyLogs?.find(l => l.user_id === uid) ?? null
      const userFoodLogs = foodLogs?.filter(l => l.user_id === uid) ?? []
      const userWorkouts = workouts?.filter(w => w.user_id === uid) ?? []
      const userBurns    = calorieBurns?.filter(b => b.user_id === uid) ?? []

      // Compute nutrition totals
      const totals = userFoodLogs.reduce(
        (acc, log) => ({
          calories: acc.calories + (log.calories   || 0),
          protein:  acc.protein  + (log.protein_g  || 0),
          carbs:    acc.carbs    + (log.carbs_g     || 0),
          fat:      acc.fat      + (log.fat_g       || 0),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      )

      // Group food logs by meal type
      const mealGroups = userFoodLogs.reduce((acc, log) => {
        const key = log.meal_type || 'snack'
        if (!acc[key]) acc[key] = []
        acc[key].push(log)
        return acc
      }, {})

      // Compute total burned
      const totalBurned =
        userWorkouts.reduce((s, w) => s + (w.calories_burned || 0), 0) +
        userBurns.reduce((s, b) => s + (b.calories || 0), 0)

      // Only include users who have at least something to show
      const hasData =
        !!dailyLog?.notes ||
        !!dailyLog?.media_url ||
        userFoodLogs.length > 0 ||
        userWorkouts.length > 0 ||
        userBurns.length > 0

      if (!hasData || !profile) return null

      return { profile, dailyLog, totals, mealGroups, workouts: userWorkouts, calorieBurns: userBurns, totalBurned }
    })
    .filter(Boolean)
}
