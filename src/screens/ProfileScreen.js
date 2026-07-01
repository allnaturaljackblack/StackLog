import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, Modal, TextInput,
  Image, StyleSheet, SafeAreaView, ActivityIndicator,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { useProfile } from '../hooks/useProfile'
import { supabase } from '../lib/supabase'
import {
  getFollowCounts, getPendingRequests,
  acceptFollowRequest, declineFollowRequest,
} from '../lib/socialApi'
import {
  getCreatorSettings, getSubscriberCount, getEstimatedMonthlyRevenue,
} from '../lib/creatorApi'
import GoalSetupModal from './GoalSetupModal'
import { colors, fonts, fontSize, spacing, radius } from '../utils/theme'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

function formatJoinDate(createdAt) {
  if (!createdAt) return ''
  return new Date(createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/** Returns the last `n` calendar dates as 'YYYY-MM-DD', oldest first. */
function lastNDates(n) {
  const today = new Date()
  const dates = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    dates.push(d.toISOString().split('T')[0])
  }
  return dates
}

/** Counts consecutive days with logged food going back from today. */
function calcStreak(loggedDateSet) {
  let streak = 0
  const cursor = new Date()
  const todayStr = cursor.toISOString().split('T')[0]
  // If today has no logs yet, still check yesterday as start of streak
  if (!loggedDateSet.has(todayStr)) cursor.setDate(cursor.getDate() - 1)
  while (loggedDateSet.has(cursor.toISOString().split('T')[0])) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

// ---------------------------------------------------------------------------
// Pure-JS base64 → Uint8Array (no atob dependency — works in all Hermes versions)
// ---------------------------------------------------------------------------
function b64ToBytes(base64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '')
  const out   = new Uint8Array(Math.floor(clean.length * 3 / 4))
  let idx = 0
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = chars.indexOf(clean[i])
    const c1 = chars.indexOf(clean[i + 1])
    const c2 = chars.indexOf(clean[i + 2])
    const c3 = chars.indexOf(clean[i + 3])
    out[idx++] = (c0 << 2) | (c1 >> 4)
    if (c2 !== -1) out[idx++] = ((c1 & 0xF) << 4) | (c2 >> 2)
    if (c3 !== -1) out[idx++] = ((c2 & 0x3) << 6) | c3
  }
  return out.slice(0, idx)
}

// ---------------------------------------------------------------------------
// Edit Profile modal
// ---------------------------------------------------------------------------
function EditProfileModal({ visible, profile, onClose, onSaved }) {
  const [displayName, setDisplayName] = useState('')
  const [username,    setUsername]    = useState('')
  const [photoUri,    setPhotoUri]    = useState(null) // local URI from picker
  const [saving,      setSaving]      = useState(false)

  // Pre-seed fields whenever the modal opens
  useEffect(() => {
    if (visible && profile) {
      setDisplayName(profile.display_name || '')
      setUsername(profile.username || '')
      setPhotoUri(null) // reset local preview
    }
  }, [visible])

  async function handlePickPhoto() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      })
      if (!result.canceled) {
        setPhotoUri(result.assets[0].uri)
      }
    } catch (err) {
      console.error('Photo picker error:', err)
      Alert.alert(
        'Could not open photos',
        'Make sure Expo Go has photo library access in Settings → Privacy → Photos.'
      )
    }
  }

  async function handleSave() {
    const name = displayName.trim()
    if (!name) {
      Alert.alert('Required', 'Display name cannot be empty.')
      return
    }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      let avatarUrl = profile?.avatar_url ?? null

      // Upload new photo if one was picked
      if (photoUri) {
        const fileName = `${user.id}/avatar.jpg`

        // Step 1: read local file as base64
        let base64
        try {
          base64 = await FileSystem.readAsStringAsync(photoUri, {
            encoding: 'base64',
          })
        } catch (fsErr) {
          throw new Error(`Could not read image: ${fsErr.message}`)
        }

        // Step 2: decode to bytes and upload
        const bytes = b64ToBytes(base64)
        const { error: upErr } = await supabase.storage
          .from('avatars')
          .upload(fileName, bytes, { contentType: 'image/jpeg', upsert: true })
        if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`)

        // Step 3: get the public URL with a cache-buster
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(fileName)
        avatarUrl = `${publicUrl}?t=${Date.now()}`
      }

      // Step 4: persist to profiles table
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: name,
          username: username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '') || null,
          avatar_url: avatarUrl,
        })
        .eq('id', user.id)
      if (error) throw new Error(`Profile update failed: ${error.message}`)
      onSaved()
      onClose()
    } catch (err) {
      console.error('Profile save error:', err)
      Alert.alert('Error', err?.message || 'Could not update profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Priority: newly-picked local URI → existing remote URL → show initials
  const avatarSource = photoUri || profile?.avatar_url || null
  const [previewError, setPreviewError] = useState(false)
  useEffect(() => { setPreviewError(false) }, [avatarSource])

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={epSt.container}>
        {/* Header */}
        <View style={epSt.header}>
          <TouchableOpacity onPress={onClose} style={epSt.headerSide} activeOpacity={0.7}>
            <Text style={epSt.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={epSt.headerTitle}>Edit Profile</Text>
          <TouchableOpacity
            onPress={handleSave}
            style={[epSt.headerSide, epSt.headerRight]}
            disabled={saving}
            activeOpacity={0.7}
          >
            <Text style={[epSt.saveText, saving && { opacity: 0.4 }]}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={epSt.content}
            keyboardShouldPersistTaps="handled"
          >
            {/* Avatar picker */}
            <View style={epSt.avatarWrap}>
              <TouchableOpacity onPress={handlePickPhoto} activeOpacity={0.8}>
                {avatarSource && !previewError ? (
                  <Image
                    source={{ uri: avatarSource }}
                    style={epSt.avatarImage}
                    resizeMode="cover"
                    onError={() => setPreviewError(true)}
                  />
                ) : (
                  <View style={epSt.avatarCircle}>
                    <Text style={epSt.avatarInitials}>
                      {getInitials(displayName || profile?.display_name)}
                    </Text>
                  </View>
                )}
                <View style={epSt.avatarEditBadge}>
                  <Text style={epSt.avatarEditBadgeText}>Edit</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Display name */}
            <View style={epSt.fieldBlock}>
              <Text style={epSt.fieldLabel}>DISPLAY NAME</Text>
              <TextInput
                style={epSt.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your name"
                placeholderTextColor={colors.textMuted}
                returnKeyType="next"
                autoFocus
              />
            </View>

            {/* Username */}
            <View style={epSt.fieldBlock}>
              <Text style={epSt.fieldLabel}>USERNAME</Text>
              <View style={epSt.usernameRow}>
                <Text style={epSt.atSign}>@</Text>
                <TextInput
                  style={[epSt.input, { flex: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }]}
                  value={username}
                  onChangeText={v => setUsername(v.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
                  placeholder="username"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                />
              </View>
              <Text style={epSt.fieldHint}>Letters, numbers and underscores only</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function StatCard({ icon, value, label }) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={18} color={colors.textMuted} style={styles.statIcon} />
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function WeeklyCaloriesChart({ data, labels }) {
  const max = Math.max(...data, 1)
  const BAR_MAX_HEIGHT = 80

  return (
    <View style={styles.chartContainer}>
      <View style={styles.chartBars}>
        {data.map((cal, i) => {
          const barHeight = Math.max((cal / max) * BAR_MAX_HEIGHT, 4)
          const isToday = i === data.length - 1
          return (
            <View key={i} style={styles.chartBarCol}>
              <Text style={styles.chartBarValue}>
                {cal > 0 ? `${(cal / 1000).toFixed(1)}k` : ''}
              </Text>
              <View style={styles.chartBarTrack}>
                <View
                  style={[
                    styles.chartBar,
                    { height: barHeight },
                    isToday && styles.chartBarToday,
                  ]}
                />
              </View>
              <Text style={[styles.chartBarDay, isToday && styles.chartBarDayToday]}>
                {labels[i]}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Goal type display helpers
// ---------------------------------------------------------------------------
const GOAL_META = {
  lose_weight: { label: 'Lose Weight',  icon: 'trending-down-outline' },
  gain_muscle: { label: 'Build Muscle', icon: 'barbell-outline'       },
  gain_weight: { label: 'Gain Weight',  icon: 'trending-up-outline'   },
  maintain:    { label: 'Maintain',     icon: 'remove-outline'        },
}

function GoalRow({ icon, label, value }) {
  return (
    <View style={styles.goalRow}>
      <Ionicons name={icon} size={15} color={colors.textMuted} style={styles.goalRowIcon} />
      <Text style={styles.goalRowLabel}>{label}</Text>
      <Text style={styles.goalRowValue}>{value}</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function ProfileScreen() {
  const navigation = useNavigation()
  const { profile, loading: profileLoading, refreshProfile } = useProfile()

  // Workout count (all-time)
  const [totalWorkouts,  setTotalWorkouts]  = useState(0)
  const [workoutsLoading, setWorkoutsLoading] = useState(true)

  // Weekly food-log stats
  const [weeklyCalories, setWeeklyCalories] = useState(Array(7).fill(0))
  const [weekLabels,     setWeekLabels]     = useState(['', '', '', '', '', '', ''])
  const [avgDailyCals,   setAvgDailyCals]   = useState(0)
  const [logStreak,      setLogStreak]      = useState(0)
  const [daysLogged,     setDaysLogged]     = useState(0)
  const [statsLoading,   setStatsLoading]   = useState(true)

  // Social — follower counts + pending follow requests
  const [followCounts,       setFollowCounts]       = useState({ followersCount: 0, followingCount: 0 })
  const [pendingRequests,    setPendingRequests]    = useState([])
  const [showRequestsModal,  setShowRequestsModal]  = useState(false)

  // Creator dashboard
  const [creatorSettings,  setCreatorSettings]  = useState(null)
  const [subscriberCount,  setSubscriberCount]  = useState(0)
  const [estimatedRevenue, setEstimatedRevenue] = useState(0) // in cents

  // Modal visibility
  const [showEditModal,    setShowEditModal]    = useState(false)
  const [showGoalModal,    setShowGoalModal]    = useState(false)
  const [avatarLoadError,  setAvatarLoadError]  = useState(false)

  // ── Data fetching ──────────────────────────────────────────────────────────

  async function fetchWorkoutCount(userId) {
    const { count } = await supabase
      .from('workouts')
      .select('id', { count: 'exact' })
      .eq('user_id', userId)
      .is('deleted_at', null)
    setTotalWorkouts(count || 0)
  }

  async function fetchWeeklyStats(userId) {
    const week  = lastNDates(7)
    const month = lastNDates(30)

    // Single query covers the last 30 days — enough for streak + monthly count
    const { data: logs } = await supabase
      .from('food_logs')
      .select('log_date, calories')
      .eq('user_id', userId)
      .gte('log_date', month[0])
      .lte('log_date', month[month.length - 1])
      .is('deleted_at', null)

    const calsByDate = {}
    const loggedDateSet = new Set()
    for (const log of (logs || [])) {
      calsByDate[log.log_date] = (calsByDate[log.log_date] || 0) + (log.calories || 0)
      loggedDateSet.add(log.log_date)
    }

    // Weekly chart values + day labels
    const weekVals   = week.map(d => Math.round(calsByDate[d] || 0))
    const weekLabels = week.map(d =>
      new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })
    )
    setWeeklyCalories(weekVals)
    setWeekLabels(weekLabels)

    // Avg daily cals — only count days that have data
    const daysWithData = weekVals.filter(c => c > 0)
    setAvgDailyCals(
      daysWithData.length > 0
        ? Math.round(daysWithData.reduce((a, b) => a + b, 0) / daysWithData.length)
        : 0
    )

    // Log streak
    setLogStreak(calcStreak(loggedDateSet))

    // Days logged in last 30 days
    const daysIn30 = new Set(
      (logs || []).filter(l => month.includes(l.log_date)).map(l => l.log_date)
    ).size
    setDaysLogged(daysIn30)
  }

  async function loadAll() {
    setWorkoutsLoading(true)
    setStatsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      // fetchWorkoutCount + fetchWeeklyStats use internal setState (return undefined)
      // getFollowCounts + getPendingRequests return data we need to store
      const [, , countsData, requestsData, csData] = await Promise.all([
        fetchWorkoutCount(user.id),
        fetchWeeklyStats(user.id),
        getFollowCounts(user.id),
        getPendingRequests(user.id),
        getCreatorSettings(user.id),
      ])
      setFollowCounts(countsData)
      setPendingRequests(requestsData)
      setCreatorSettings(csData)
      if (csData?.is_creator) {
        const [count, rev] = await Promise.all([
          getSubscriberCount(user.id),
          getEstimatedMonthlyRevenue(user.id, csData.monthly_price_cents, csData.annual_price_cents),
        ])
        setSubscriberCount(count)
        setEstimatedRevenue(rev)
      }
    } finally {
      setWorkoutsLoading(false)
      setStatsLoading(false)
    }
  }

  async function refreshSocial() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const [countsData, requestsData] = await Promise.all([
        getFollowCounts(user.id),
        getPendingRequests(user.id),
      ])
      setFollowCounts(countsData)
      setPendingRequests(requestsData)
    } catch (err) {
      console.error('refreshSocial error:', err)
    }
  }

  async function handleAcceptRequest(followId) {
    try {
      await acceptFollowRequest(followId)
      await refreshSocial()
    } catch {
      Alert.alert('Error', 'Could not accept follow request.')
    }
  }

  async function handleDeclineRequest(followId) {
    try {
      await declineFollowRequest(followId)
      await refreshSocial()
    } catch {
      Alert.alert('Error', 'Could not decline follow request.')
    }
  }

  useFocusEffect(useCallback(() => {
    refreshProfile()
    loadAll()
    setAvatarLoadError(false) // re-attempt image load on each focus
  }, []))

  // ── Render ─────────────────────────────────────────────────────────────────

  const isLoading = profileLoading || workoutsLoading || statsLoading

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.textMuted} />
        </View>
      </SafeAreaView>
    )
  }

  const displayName = profile?.display_name || 'User'
  const username    = profile?.username || ''

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Page title */}
        <Text style={styles.pageTitle}>Profile</Text>

        {/* Identity card */}
        <View style={styles.card}>
          <View style={styles.identityRow}>
            {profile?.avatar_url && !avatarLoadError ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={styles.avatarImage}
                resizeMode="cover"
                onError={() => setAvatarLoadError(true)}
              />
            ) : (
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarInitials}>{getInitials(displayName)}</Text>
              </View>
            )}
            <View style={styles.identityInfo}>
              <Text style={styles.identityName}>{displayName}</Text>
              {!!username && (
                <Text style={styles.identityUsername}>@{username}</Text>
              )}
              {!!profile?.created_at && (
                <Text style={styles.identityJoined}>
                  {'📅 Joined ' + formatJoinDate(profile.created_at)}
                </Text>
              )}
            </View>
          </View>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => setShowEditModal(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.editButtonText}>Edit Profile</Text>
          </TouchableOpacity>

          {/* Follower / Following counts */}
          <View style={styles.followCountRow}>
            <View style={styles.followCountItem}>
              <Text style={styles.followCountNum}>{followCounts.followersCount}</Text>
              <Text style={styles.followCountLabel}>Followers</Text>
            </View>
            <View style={styles.followCountDivider} />
            <View style={styles.followCountItem}>
              <Text style={styles.followCountNum}>{followCounts.followingCount}</Text>
              <Text style={styles.followCountLabel}>Following</Text>
            </View>
          </View>
        </View>

        {/* Stat cards row */}
        <View style={styles.statsRow}>
          <StatCard
            icon="barbell-outline"
            value={totalWorkouts}
            label={'Total\nWorkouts'}
          />
          <StatCard
            icon="flame-outline"
            value={avgDailyCals > 0 ? avgDailyCals.toLocaleString() : '—'}
            label={'Avg Daily\nCals'}
          />
          <StatCard
            icon="calendar-outline"
            value={daysLogged}
            label={'Days Logged\n(30d)'}
          />
          <StatCard
            icon="trending-up-outline"
            value={logStreak}
            label={'Log\nStreak'}
          />
        </View>

        {/* Weekly calories chart */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>CALORIES — LAST 7 DAYS</Text>
          <WeeklyCaloriesChart data={weeklyCalories} labels={weekLabels} />
        </View>

        {/* Goals card */}
        <View style={styles.card}>
          <View style={styles.goalCardHeader}>
            <Text style={styles.sectionLabel}>MY GOALS</Text>
            <TouchableOpacity
              onPress={() => setShowGoalModal(true)}
              activeOpacity={0.7}
              style={styles.editGoalsBtn}
            >
              <Text style={styles.editGoalsBtnText}>
                {profile?.goal_type ? 'Edit Goals' : 'Set Goals'}
              </Text>
            </TouchableOpacity>
          </View>

          {profile?.goal_type ? (
            <View style={styles.goalContent}>
              {/* Goal type pill */}
              <View style={styles.goalTypePill}>
                <Ionicons
                  name={GOAL_META[profile.goal_type]?.icon ?? 'flag-outline'}
                  size={14}
                  color={colors.textLight}
                />
                <Text style={styles.goalTypePillText}>
                  {GOAL_META[profile.goal_type]?.label ?? profile.goal_type}
                </Text>
              </View>

              {!!profile.goal_calories && (
                <GoalRow
                  icon="flame-outline"
                  label="Daily Calories"
                  value={`${profile.goal_calories.toLocaleString()} cal`}
                />
              )}
              {!!profile.goal_protein_g && (
                <GoalRow
                  icon="nutrition-outline"
                  label="Protein"
                  value={`${profile.goal_protein_g}g`}
                />
              )}
              {(!!profile.goal_carbs_g || !!profile.goal_fat_g) && (
                <View style={styles.goalMacroRow}>
                  {!!profile.goal_carbs_g && (
                    <View style={styles.goalMacroPill}>
                      <Text style={styles.goalMacroPillText}>Carbs {profile.goal_carbs_g}g</Text>
                    </View>
                  )}
                  {!!profile.goal_fat_g && (
                    <View style={styles.goalMacroPill}>
                      <Text style={styles.goalMacroPillText}>Fat {profile.goal_fat_g}g</Text>
                    </View>
                  )}
                </View>
              )}
              {!!profile.goal_water_ml && (
                <GoalRow
                  icon="water-outline"
                  label="Daily Water"
                  value={`${(profile.goal_water_ml / 1000).toFixed(1)}L`}
                />
              )}
              {!!profile.goal_workouts_per_week && (
                <GoalRow
                  icon="barbell-outline"
                  label="Workouts / Week"
                  value={`${profile.goal_workouts_per_week}×`}
                />
              )}
            </View>
          ) : (
            <TouchableOpacity
              style={styles.goalEmptyState}
              onPress={() => setShowGoalModal(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="flag-outline" size={28} color={colors.textMuted} />
              <Text style={styles.goalEmptyTitle}>No goals set yet</Text>
              <Text style={styles.goalEmptySubtitle}>
                Tap to set your calorie, macro, and fitness targets.
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Follow requests card — only shown when there are pending requests */}
        {pendingRequests.length > 0 && (
          <TouchableOpacity
            style={styles.requestsCard}
            onPress={() => setShowRequestsModal(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.requestsCardEmoji}>📬</Text>
            <Text style={styles.requestsCardText}>
              {pendingRequests.length} Follow Request{pendingRequests.length !== 1 ? 's' : ''}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Creator dashboard */}
        <View style={styles.card}>
          <View style={styles.creatorCardHeader}>
            <Text style={styles.creatorLabel}>CREATOR</Text>
            {creatorSettings?.is_creator && (
              <View style={styles.creatorActiveBadge}>
                <Text style={styles.creatorActiveBadgeText}>Active</Text>
              </View>
            )}
          </View>
          {creatorSettings?.is_creator ? (
            <>
              <View style={styles.creatorStatsRow}>
                <View style={styles.creatorStat}>
                  <Text style={styles.creatorStatNum}>{subscriberCount}</Text>
                  <Text style={styles.creatorStatLabel}>Subscribers</Text>
                </View>
                <View style={styles.creatorStatDivider} />
                <View style={styles.creatorStat}>
                  <Text style={styles.creatorStatNum}>
                    ${estimatedRevenue > 0 ? (estimatedRevenue / 100).toFixed(0) : '0'}
                  </Text>
                  <Text style={styles.creatorStatLabel}>Est. Monthly</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.creatorManageBtn}
                onPress={() => navigation.navigate('CreatorSetup')}
                activeOpacity={0.7}
              >
                <Text style={styles.creatorManageBtnText}>Manage Creator Settings</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.creatorDescription}>
                Turn on creator mode to offer subscribers exclusive access to your workout programming and nutrition insights.
              </Text>
              <TouchableOpacity
                style={styles.creatorSetupBtn}
                onPress={() => navigation.navigate('CreatorSetup')}
                activeOpacity={0.7}
              >
                <Text style={styles.creatorSetupBtnText}>Set Up Creator Profile</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Integrations */}
        <TouchableOpacity
          style={styles.integrationsBtn}
          onPress={() => navigation.navigate('Integrations')}
          activeOpacity={0.7}
        >
          <Ionicons name="link-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.integrationsBtnText}>Connected Apps</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        {/* Sign Out */}
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={() => supabase.auth.signOut()}
          activeOpacity={0.7}
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Follow Requests Modal */}
      <Modal
        visible={showRequestsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRequestsModal(false)}
      >
        <SafeAreaView style={reqSt.container}>
          <View style={reqSt.header}>
            <Text style={reqSt.headerTitle}>Follow Requests</Text>
            <TouchableOpacity onPress={() => setShowRequestsModal(false)} style={reqSt.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={reqSt.list} showsVerticalScrollIndicator={false}>
            {pendingRequests.length === 0 ? (
              <View style={reqSt.emptyWrap}>
                <Text style={reqSt.emptyText}>No pending requests</Text>
              </View>
            ) : (
              pendingRequests.map(({ followId, profile: requester }) => (
                <View key={followId} style={reqSt.row}>
                  {/* Avatar */}
                  {requester?.avatar_url ? (
                    <Image source={{ uri: requester.avatar_url }} style={reqSt.avatar} resizeMode="cover" />
                  ) : (
                    <View style={reqSt.avatarCircle}>
                      <Text style={reqSt.avatarInitials}>{getInitials(requester?.display_name)}</Text>
                    </View>
                  )}

                  {/* Name */}
                  <View style={reqSt.rowInfo}>
                    <Text style={reqSt.rowName} numberOfLines={1}>{requester?.display_name || 'User'}</Text>
                    {!!requester?.username && (
                      <Text style={reqSt.rowUsername} numberOfLines={1}>@{requester.username}</Text>
                    )}
                  </View>

                  {/* Approve / Decline */}
                  <TouchableOpacity
                    style={reqSt.approveBtn}
                    onPress={() => handleAcceptRequest(followId)}
                    activeOpacity={0.85}
                  >
                    <Text style={reqSt.approveBtnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={reqSt.declineBtn}
                    onPress={() => handleDeclineRequest(followId)}
                    activeOpacity={0.85}
                  >
                    <Text style={reqSt.declineBtnText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Edit Profile Modal */}
      <EditProfileModal
        visible={showEditModal}
        profile={profile}
        onClose={() => setShowEditModal(false)}
        onSaved={() => { refreshProfile(); setAvatarLoadError(false) }}
      />

      {/* Goal Setup Modal */}
      <GoalSetupModal
        visible={showGoalModal}
        profile={profile}
        onClose={() => setShowGoalModal(false)}
        onSaved={() => { refreshProfile(); setShowGoalModal(false) }}
      />
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles — main screen
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.md,
    paddingBottom: 40,
  },

  pageTitle: {
    fontFamily: fonts.bold,
    fontSize: 32,
    color: colors.text,
  },

  // Card base
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },

  // Identity card
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.bgDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xl,
    color: colors.textLight,
  },
  identityInfo: {
    flex: 1,
    gap: 2,
  },
  identityName: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  identityUsername: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  identityJoined: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  editButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  editButtonText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    alignItems: 'center',
    gap: 4,
  },
  statIcon: {
    marginBottom: 2,
  },
  statValue: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xl,
    color: colors.text,
    lineHeight: 24,
  },
  statLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    lineHeight: 14,
  },

  // Section label
  sectionLabel: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },

  // Chart
  chartContainer: {
    paddingTop: spacing.xs,
  },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 4,
  },
  chartBarCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  chartBarValue: {
    fontFamily: fonts.regular,
    fontSize: 9,
    color: colors.textMuted,
    height: 12,
  },
  chartBarTrack: {
    width: '100%',
    height: 80,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  chartBar: {
    width: '100%',
    backgroundColor: colors.border,
    borderRadius: radius.sm,
    minHeight: 4,
  },
  chartBarToday: {
    backgroundColor: colors.bgDark,
  },
  chartBarDay: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  chartBarDayToday: {
    fontFamily: fonts.semiBold,
    color: colors.text,
  },

  // Goals card
  goalCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  editGoalsBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  editGoalsBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    letterSpacing: 0.2,
  },
  goalContent: {
    gap: 2,
  },
  goalTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.bgDark,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    marginBottom: spacing.sm,
  },
  goalTypePillText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs,
    color: colors.textLight,
    letterSpacing: 0.2,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
  },
  goalRowIcon: {
    marginRight: spacing.sm,
  },
  goalRowLabel: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  goalRowValue: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  goalMacroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingVertical: 7,
    paddingLeft: 23,
  },
  goalMacroPill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  goalMacroPillText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.text,
  },
  goalEmptyState: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  goalEmptyTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
    marginTop: spacing.xs,
  },
  goalEmptySubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Follower / following count row (inside identity card)
  followCountRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xl,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  followCountItem: {
    alignItems: 'center',
    gap: 2,
  },
  followCountNum: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xl,
    color: colors.text,
    letterSpacing: -0.5,
  },
  followCountLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  followCountDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
  },

  // Follow requests card
  requestsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  requestsCardEmoji: {
    fontSize: 18,
  },
  requestsCardText: {
    flex: 1,
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
  },

  // Integrations link
  integrationsBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderWidth:     1,
    borderColor:     colors.border,
    borderRadius:    radius.md,
    marginBottom:    spacing.sm,
  },
  integrationsBtnText: {
    fontFamily: fonts.medium,
    fontSize:   fontSize.sm,
    color:      colors.textSecondary,
  },

  // Sign out
  signOutBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  signOutText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },

  // ── Creator dashboard card ─────────────────────────────────────────────────
  creatorCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  creatorLabel: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  creatorActiveBadge: {
    backgroundColor: colors.success + '20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  creatorActiveBadgeText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.success,
  },
  creatorStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  creatorStat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  creatorStatDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.border,
  },
  creatorStatNum: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xl,
    color: colors.text,
    letterSpacing: -0.5,
  },
  creatorStatLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  creatorManageBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  creatorManageBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  creatorDescription: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  creatorSetupBtn: {
    backgroundColor: colors.bgDark,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  creatorSetupBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.textLight,
  },
})

// ---------------------------------------------------------------------------
// Styles — Follow Requests modal
// ---------------------------------------------------------------------------
const reqSt = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.text,
    letterSpacing: -0.3,
  },
  closeBtn: {
    padding: 6,
  },
  list: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  emptyWrap: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bgDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontFamily: fonts.bold,
    fontSize: fontSize.md,
    color: colors.textLight,
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
    letterSpacing: -0.2,
  },
  rowUsername: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  approveBtn: {
    backgroundColor: colors.bgDark,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  approveBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.textLight,
  },
  declineBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  declineBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
})

// ---------------------------------------------------------------------------
// Styles — Edit Profile modal
// ---------------------------------------------------------------------------
const epSt = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerSide: {
    width: 70,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  headerTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.md,
    color: colors.text,
  },
  cancelText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  saveText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.md,
    color: colors.text,
  },

  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: 40,
    gap: spacing.md,
  },

  avatarWrap: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.bgDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xxl,
    color: colors.textLight,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.bgDark,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  avatarEditBadgeText: {
    fontFamily: fonts.semiBold,
    fontSize: 10,
    color: colors.textLight,
  },

  fieldBlock: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  fieldHint: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  input: {
    height: 50,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.regular,
    fontSize: fontSize.md,
    color: colors.text,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  atSign: {
    height: 50,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderRightWidth: 0,
    borderColor: colors.border,
    borderTopLeftRadius: radius.md,
    borderBottomLeftRadius: radius.md,
    paddingHorizontal: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlignVertical: 'center',
    lineHeight: 50,
  },
})
