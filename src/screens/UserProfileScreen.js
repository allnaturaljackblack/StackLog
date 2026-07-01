import { useState, useCallback } from 'react'
import {
  View, Text, Image, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, ActivityIndicator, Alert,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import {
  getFollowStatus, getFollowCounts, sendFollowRequest, unfollowUser,
} from '../lib/socialApi'
import {
  getCreatorSettings, checkSubscription, startSubscribeCheckout,
} from '../lib/creatorApi'
import { colors, fonts, fontSize, spacing, radius } from '../utils/theme'

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

// ---------------------------------------------------------------------------
// Follow button (same logic as ExploreScreen)
// ---------------------------------------------------------------------------
function FollowButton({ status, visibility, targetId, onChange }) {
  const [loading, setLoading] = useState(false)

  async function handleFollow() {
    setLoading(true)
    try {
      await sendFollowRequest(targetId, visibility)
      onChange()
    } catch {
      Alert.alert('Error', 'Could not send follow request.')
    } finally {
      setLoading(false)
    }
  }

  function handleUnfollow() {
    const label = status === 'pending' ? 'withdraw your follow request' : 'unfollow this person'
    Alert.alert(
      status === 'pending' ? 'Withdraw Request?' : 'Unfollow?',
      `Are you sure you want to ${label}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: status === 'pending' ? 'Withdraw' : 'Unfollow',
          style: 'destructive',
          onPress: async () => {
            setLoading(true)
            try {
              await unfollowUser(targetId)
              onChange()
            } catch {
              Alert.alert('Error', 'Could not unfollow.')
            } finally {
              setLoading(false)
            }
          },
        },
      ]
    )
  }

  if (loading) {
    return <ActivityIndicator size="small" color={colors.textMuted} style={{ width: 110 }} />
  }

  if (status === 'accepted') {
    return (
      <TouchableOpacity style={[styles.followBtn, styles.followBtnFollowing]} onPress={handleUnfollow} activeOpacity={0.8}>
        <Ionicons name="checkmark" size={14} color={colors.text} />
        <Text style={[styles.followBtnText, { color: colors.text }]}>Following</Text>
      </TouchableOpacity>
    )
  }

  if (status === 'pending') {
    return (
      <TouchableOpacity style={[styles.followBtn, styles.followBtnPending]} onPress={handleUnfollow} activeOpacity={0.8}>
        <Ionicons name="time-outline" size={14} color={colors.textMuted} />
        <Text style={[styles.followBtnText, { color: colors.textMuted }]}>Requested</Text>
      </TouchableOpacity>
    )
  }

  // 'none' or 'incoming_pending'
  return (
    <TouchableOpacity style={[styles.followBtn, styles.followBtnFollow]} onPress={handleFollow} activeOpacity={0.85}>
      <Text style={[styles.followBtnText, { color: colors.textLight }]}>Follow</Text>
    </TouchableOpacity>
  )
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function UserProfileScreen({ navigation, route }) {
  const { userId } = route.params

  const [viewerId,        setViewerId]        = useState(null)
  const [profile,         setProfile]         = useState(null)
  const [counts,          setCounts]          = useState({ followersCount: 0, followingCount: 0 })
  const [status,          setStatus]          = useState('none')
  const [todayStats,      setTodayStats]      = useState(null)
  const [creatorSettings, setCreatorSettings] = useState(null)
  const [isSubscribed,    setIsSubscribed]    = useState(false)
  const [subscribing,     setSubscribing]     = useState(false)
  const [loading,         setLoading]         = useState(true)

  useFocusEffect(useCallback(() => {
    loadAll()
  }, [userId]))

  async function loadAll() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const currentUserId = user?.id
      setViewerId(currentUserId)

      const today = new Date()
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

      const [profileRes, countsData, statusData, creatorSettingsData] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        getFollowCounts(userId),
        getFollowStatus(userId),
        getCreatorSettings(userId),
      ])

      if (profileRes.data) setProfile(profileRes.data)
      setCounts(countsData)
      setStatus(statusData)
      setCreatorSettings(creatorSettingsData)

      // Check subscription (skip if viewer is the creator)
      const subbed = currentUserId
        ? await checkSubscription(currentUserId, userId)
        : false
      setIsSubscribed(subbed)

      // Only fetch today's stats if viewer can see content
      const paywalled = creatorSettingsData?.paywall_enabled && creatorSettingsData?.is_creator
      const isPrivate = profileRes.data?.visibility === 'private' && statusData !== 'accepted'
      const canView   = !isPrivate && (!paywalled || subbed || currentUserId === userId)

      if (canView) {
        const [foodRes, workoutsRes] = await Promise.all([
          supabase.from('food_logs').select('calories').eq('user_id', userId).eq('log_date', dateStr).is('deleted_at', null),
          supabase.from('workouts').select('id').eq('user_id', userId).gte('started_at', `${dateStr}T00:00:00`).lte('started_at', `${dateStr}T23:59:59`),
        ])
        const totalCal = (foodRes.data || []).reduce((s, r) => s + (r.calories || 0), 0)
        setTodayStats({ calories: Math.round(totalCal), workouts: (workoutsRes.data || []).length })
      }
    } catch (err) {
      console.error('UserProfile load error:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubscribe(planType = 'monthly') {
    if (!viewerId) return
    setSubscribing(true)
    try {
      const result = await startSubscribeCheckout(viewerId, userId, planType)
      if (result.type === 'success' || result.type === 'dismiss') {
        // Recheck subscription after returning from checkout
        const subbed = await checkSubscription(viewerId, userId)
        setIsSubscribed(subbed)
        if (subbed) await loadAll()
      }
    } catch (err) {
      Alert.alert('Subscription error', err.message)
    } finally {
      setSubscribing(false)
    }
  }

  function handleFollowChange() {
    // Re-fetch status + counts after follow/unfollow
    Promise.all([getFollowStatus(userId), getFollowCounts(userId)])
      .then(([newStatus, newCounts]) => {
        setStatus(newStatus)
        setCounts(newCounts)
      })
      .catch(() => {})
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.textMuted} />
        </View>
      </SafeAreaView>
    )
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingWrap}>
          <Text style={styles.errorText}>User not found.</Text>
        </View>
      </SafeAreaView>
    )
  }

  const displayName  = profile.display_name || 'User'
  const isPrivate    = profile.visibility === 'private' && status !== 'accepted'
  const isPaywalled  = creatorSettings?.paywall_enabled && creatorSettings?.is_creator
  const isOwn        = viewerId === userId
  const canView      = !isPrivate && (!isPaywalled || isSubscribed || isOwn)
  const monthlyPrice = creatorSettings?.monthly_price_cents
  const annualPrice  = creatorSettings?.annual_price_cents

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{displayName}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Avatar */}
        <View style={styles.avatarWrap}>
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} resizeMode="cover" />
          ) : (
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitials}>{getInitials(displayName)}</Text>
            </View>
          )}
        </View>

        {/* Name */}
        <Text style={styles.displayName}>{displayName}</Text>
        {!!profile.username && (
          <Text style={styles.username}>@{profile.username}</Text>
        )}

        {/* Follower / Following counts */}
        <View style={styles.countRow}>
          <View style={styles.countItem}>
            <Text style={styles.countNum}>{counts.followersCount}</Text>
            <Text style={styles.countLabel}>Followers</Text>
          </View>
          <View style={styles.countDivider} />
          <View style={styles.countItem}>
            <Text style={styles.countNum}>{counts.followingCount}</Text>
            <Text style={styles.countLabel}>Following</Text>
          </View>
        </View>

        {/* Follow button */}
        {status !== 'incoming_pending' && (
          <View style={styles.followBtnWrap}>
            <FollowButton
              status={status}
              visibility={profile.visibility}
              targetId={userId}
              onChange={handleFollowChange}
            />
          </View>
        )}

        {/* Incoming pending: they follow you */}
        {status === 'incoming_pending' && (
          <View style={styles.incomingRow}>
            <Text style={styles.incomingText}>This person sent you a follow request — check your Profile tab.</Text>
          </View>
        )}

        {/* Divider */}
        <View style={styles.divider} />

        {/* Content area */}
        {isPrivate ? (
          <View style={styles.privateWrap}>
            <Ionicons name="lock-closed-outline" size={32} color={colors.border} />
            <Text style={styles.privateTitle}>This account is private</Text>
            <Text style={styles.privateSubtitle}>Follow this person to see their posts.</Text>
          </View>

        ) : !canView ? (
          /* ── Paywall teaser ───────────────────────────────────────────────── */
          <View style={styles.paywallWrap}>
            {/* Teaser images */}
            {(creatorSettings?.teaser_image_urls || []).length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.teaserImgScroll}>
                {creatorSettings.teaser_image_urls.map((url, i) => (
                  <Image key={i} source={{ uri: url }} style={styles.teaserImg} />
                ))}
              </ScrollView>
            )}

            {/* Lock badge */}
            <View style={styles.paywallBadge}>
              <Ionicons name="lock-closed" size={18} color={colors.textLight} />
              <Text style={styles.paywallBadgeText}>Subscribers Only</Text>
            </View>

            {/* Teaser text */}
            {!!creatorSettings?.teaser_text && (
              <Text style={styles.teaserText}>{creatorSettings.teaser_text}</Text>
            )}

            {/* Subscribe buttons */}
            <View style={styles.subscribeActions}>
              {monthlyPrice > 0 && (
                <TouchableOpacity
                  style={[styles.subscribeBtn, subscribing && styles.btnDisabled]}
                  onPress={() => handleSubscribe('monthly')}
                  disabled={subscribing}
                  activeOpacity={0.85}
                >
                  {subscribing
                    ? <ActivityIndicator size="small" color={colors.textLight} />
                    : <Text style={styles.subscribeBtnText}>
                        Subscribe — ${(monthlyPrice / 100).toFixed(2)}/mo
                      </Text>}
                </TouchableOpacity>
              )}
              {annualPrice > 0 && (
                <TouchableOpacity
                  style={[styles.subscribeBtn, styles.subscribeBtnAlt, subscribing && styles.btnDisabled]}
                  onPress={() => handleSubscribe('annual')}
                  disabled={subscribing}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.subscribeBtnText, { color: colors.text }]}>
                    Annual — ${(annualPrice / 100).toFixed(2)}/yr
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

        ) : todayStats && (todayStats.calories > 0 || todayStats.workouts > 0) ? (
          /* ── Today's stats ────────────────────────────────────────────────── */
          <View style={styles.todayCard}>
            <Text style={styles.todayTitle}>Today</Text>
            <View style={styles.todayRow}>
              {todayStats.calories > 0 && (
                <View style={styles.todayStat}>
                  <Ionicons name="nutrition-outline" size={18} color={colors.textSecondary} />
                  <Text style={styles.todayStatVal}>{todayStats.calories.toLocaleString()}</Text>
                  <Text style={styles.todayStatLabel}>cal</Text>
                </View>
              )}
              {todayStats.workouts > 0 && (
                <View style={styles.todayStat}>
                  <Ionicons name="barbell-outline" size={18} color={colors.textSecondary} />
                  <Text style={styles.todayStatVal}>{todayStats.workouts}</Text>
                  <Text style={styles.todayStatLabel}>{todayStats.workouts === 1 ? 'workout' : 'workouts'}</Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.nothingWrap}>
            <Text style={styles.nothingText}>Nothing logged today yet.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.md,
    color: colors.textMuted,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.text,
    letterSpacing: -0.3,
    flex: 1,
    textAlign: 'center',
  },

  // Avatar
  avatarWrap: {
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  avatar: {
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
    fontSize: 28,
    color: colors.textLight,
  },

  // Name
  displayName: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xl,
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.3,
    paddingHorizontal: spacing.md,
  },
  username: {
    fontFamily: fonts.regular,
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 2,
  },

  // Counts
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  countItem: {
    alignItems: 'center',
    gap: 2,
  },
  countNum: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xl,
    color: colors.text,
    letterSpacing: -0.5,
  },
  countLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  countDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
  },

  // Follow button
  followBtnWrap: {
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  followBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.xl,
    paddingVertical: 12,
    borderRadius: radius.full,
    minWidth: 140,
  },
  followBtnFollow: {
    backgroundColor: colors.bgDark,
  },
  followBtnFollowing: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  followBtnPending: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  followBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
  },

  // Incoming request note
  incomingRow: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  incomingText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },

  // Private account
  privateWrap: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  privateTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
  },
  privateSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Today's stats card
  todayCard: {
    marginHorizontal: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  todayTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  todayRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  todayStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  todayStatVal: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.text,
    letterSpacing: -0.3,
  },
  todayStatLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },

  // Nothing logged state
  nothingWrap: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  nothingText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },

  // Paywall teaser
  paywallWrap: {
    marginHorizontal: spacing.md,
    gap:              spacing.md,
  },
  teaserImgScroll: {
    marginHorizontal: -spacing.md,
    paddingHorizontal: spacing.md,
  },
  teaserImg: {
    width:        240,
    height:       160,
    borderRadius: radius.md,
    marginRight:  spacing.sm,
  },
  paywallBadge: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            spacing.xs,
    backgroundColor: colors.bgDark,
    alignSelf:      'flex-start',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical:   spacing.xs + 1,
    borderRadius:   radius.full,
  },
  paywallBadgeText: {
    fontFamily: fonts.semiBold,
    fontSize:   fontSize.xs,
    color:      colors.textLight,
  },
  teaserText: {
    fontFamily: fonts.regular,
    fontSize:   fontSize.md,
    color:      colors.text,
    lineHeight: 24,
  },
  subscribeActions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  subscribeBtn: {
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: colors.bgDark,
    borderRadius:    radius.full,
    paddingVertical: spacing.sm + 4,
  },
  subscribeBtnAlt: {
    backgroundColor: colors.bgSecondary,
    borderWidth:     1,
    borderColor:     colors.border,
  },
  subscribeBtnText: {
    fontFamily: fonts.semiBold,
    fontSize:   fontSize.md,
    color:      colors.textLight,
  },
  btnDisabled: {
    opacity: 0.5,
  },
})
