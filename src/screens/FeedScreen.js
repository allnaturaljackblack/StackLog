import { useState, useEffect, useCallback, Fragment } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, Modal, TextInput,
  Image, Pressable, StyleSheet, SafeAreaView, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert, Linking,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { useProfile } from '../hooks/useProfile'
import { useTodayLogs } from '../hooks/useTodayLogs'
import { supabase } from '../lib/supabase'
import { getFeedPosts } from '../lib/socialApi'
import { batchGetCreatorSettings, batchCheckSubscriptions, startSubscribeCheckout } from '../lib/creatorApi'
import DateHeader, { getToday, formatDateLabel } from '../components/DateHeader'
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

function formatTime(isoString) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

const MEAL_LABELS = {
  breakfast: 'Breakfast',
  lunch:     'Lunch',
  dinner:    'Dinner',
  snack:     'Snacks',
}

// ---------------------------------------------------------------------------
// Media upload helpers
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

async function uploadPostMedia(uri, userId, logDate, isVideo) {
  const ext         = isVideo ? 'mp4' : 'jpg'
  const contentType = isVideo ? 'video/mp4' : 'image/jpeg'
  const path        = `${userId}/posts/${logDate}-${Date.now()}.${ext}`

  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' })
  const bytes  = b64ToBytes(base64)

  const { error: upErr } = await supabase.storage
    .from('avatars')
    .upload(path, bytes, { contentType, upsert: false })
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`)

  const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
  return publicUrl
}

// ---------------------------------------------------------------------------
// Media attachment (image or video) inside the post card
// ---------------------------------------------------------------------------
function MediaAttachment({ mediaUrl, mediaType, onRemove }) {
  if (!mediaUrl) return null
  const isVideo = mediaType === 'video'

  return (
    <View style={styles.mediaContainer}>
      {isVideo ? (
        <TouchableOpacity
          style={styles.videoPlaceholder}
          onPress={() => Linking.openURL(mediaUrl)}
          activeOpacity={0.85}
        >
          <Ionicons name="play-circle" size={56} color={colors.textLight} />
          <Text style={styles.videoLabel}>Tap to play video</Text>
        </TouchableOpacity>
      ) : (
        <Image
          source={{ uri: mediaUrl }}
          style={styles.mediaImage}
          resizeMode="cover"
        />
      )}
      {/* Remove button — only shown when an onRemove handler is provided */}
      {!!onRemove && (
        <TouchableOpacity style={styles.mediaRemoveBtn} onPress={onRemove} activeOpacity={0.75}>
          <Ionicons name="close-circle" size={26} color={colors.textLight} />
        </TouchableOpacity>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Note / Comment sheet
// ---------------------------------------------------------------------------
function NoteEditSheet({ visible, initialNote, title, onSave, onClose, saving }) {
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (visible) setDraft(initialNote || '')
  }, [visible, initialNote])

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={nSt.backdrop} onPress={onClose}>
          <Pressable style={nSt.sheet}>
            <View style={nSt.dragHandle} />
            <Text style={nSt.sheetTitle}>{title}</Text>

            <TextInput
              style={nSt.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Write something…"
              placeholderTextColor={colors.textMuted}
              multiline
              autoFocus
              maxLength={500}
              textAlignVertical="top"
            />
            <Text style={nSt.charCount}>{draft.length}/500</Text>

            <View style={nSt.btnRow}>
              <TouchableOpacity onPress={onClose} style={nSt.cancelBtn} activeOpacity={0.7}>
                <Text style={nSt.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onSave(draft.trim())}
                style={[nSt.saveBtn, saving && { opacity: 0.5 }]}
                disabled={saving}
                activeOpacity={0.85}
              >
                <Text style={nSt.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Nutrition section (inside post card)
// ---------------------------------------------------------------------------
function NutritionSection({ totals, mealGroups, goalCal }) {
  const consumed  = Math.round(totals.calories)
  const remaining = goalCal > 0 ? goalCal - consumed : null
  const isOver    = remaining !== null && remaining < 0
  const fillPct   = goalCal > 0 ? Math.min(consumed / goalCal, 1) : 0

  const activeMeals = ['breakfast', 'lunch', 'dinner', 'snack'].filter(
    key => (mealGroups[key] || []).length > 0
  )

  return (
    <View style={styles.section}>
      {/* Label */}
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionEmoji}>🥗</Text>
        <Text style={styles.sectionTitle}>Nutrition</Text>
      </View>

      {/* Calorie total */}
      <View style={styles.calRow}>
        <Text style={[styles.calBig, isOver && styles.calBigOver]}>
          {consumed.toLocaleString()}
        </Text>
        <View style={styles.calMeta}>
          <Text style={styles.calUnit}>cal</Text>
          {goalCal > 0 && (
            <Text style={styles.calGoal}>/ {goalCal.toLocaleString()} goal</Text>
          )}
        </View>
      </View>

      {/* Progress bar */}
      {goalCal > 0 && (
        <>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${fillPct * 100}%` },
                isOver && styles.progressFillOver,
              ]}
            />
          </View>
          <Text style={[styles.remainingText, isOver && styles.remainingTextOver]}>
            {isOver
              ? `${Math.abs(remaining).toLocaleString()} cal over goal`
              : `${remaining.toLocaleString()} cal remaining`}
          </Text>
        </>
      )}

      {/* Macro pills */}
      <View style={styles.macroPillRow}>
        {[
          { label: 'P', value: Math.round(totals.protein) },
          { label: 'C', value: Math.round(totals.carbs)   },
          { label: 'F', value: Math.round(totals.fat)     },
        ].map(m => (
          <View key={m.label} style={styles.macroPill}>
            <Text style={styles.macroPillText}>{m.label} {m.value}g</Text>
          </View>
        ))}
      </View>

      {/* Meal breakdown */}
      {activeMeals.length > 0 && (
        <View style={styles.mealList}>
          {activeMeals.map(key => {
            const items = mealGroups[key] || []
            const cal = Math.round(items.reduce((a, l) => a + (l.calories || 0), 0))
            return (
              <View key={key} style={styles.mealRow}>
                <Text style={styles.mealRowLabel}>{MEAL_LABELS[key]}</Text>
                <Text style={styles.mealRowCal}>{cal} cal</Text>
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Workout section (inside post card)
// ---------------------------------------------------------------------------
function WorkoutSection({ workout, onEditNote, readOnly = false }) {
  const exercises = workout.workout_exercises || []
  const sorted    = [...exercises].sort((a, b) => a.order_index - b.order_index)

  const setCount  = exercises.reduce((acc, ex) => acc + (ex.workout_sets || []).length, 0)
  const volumeLbs = Math.round(
    exercises.reduce((total, ex) =>
      total + (ex.workout_sets || []).reduce(
        (sum, s) => sum + (s.weight_kg || 0) * 2.20462 * (s.reps || 0), 0
      ), 0
    )
  )
  const calBurned = workout.calories_burned || 0

  const names = sorted.map(ex => ex.exercises?.name).filter(Boolean)
  const namesSummary = names.length > 0
    ? names.slice(0, 3).join(' · ') + (names.length > 3 ? ` +${names.length - 3}` : '')
    : null

  const stats = [
    { val: exercises.length, label: 'exercises' },
    { val: setCount,         label: 'sets' },
    ...(volumeLbs > 0 ? [{ val: volumeLbs.toLocaleString(), label: 'lbs vol.' }] : []),
  ]

  return (
    <View style={styles.section}>
      {/* Title row: emoji + name + time */}
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionEmoji}>💪</Text>
        <Text style={styles.sectionTitle} numberOfLines={1}>
          {workout.name || 'Workout'}
        </Text>
        <Text style={styles.workoutTime}>{formatTime(workout.started_at)}</Text>
      </View>

      {/* Stats: "4 exercises · 16 sets · 12,400 lbs vol." */}
      <View style={styles.workoutStatRow}>
        {stats.map((stat, i) => (
          <Fragment key={stat.label}>
            <Text style={styles.workoutStatText}>
              <Text style={styles.workoutStatVal}>{stat.val}</Text>
              {' '}{stat.label}
            </Text>
            {i < stats.length - 1 && (
              <Text style={styles.workoutStatDot}>·</Text>
            )}
          </Fragment>
        ))}

        {/* Calories burned — shown inline in red with flame */}
        {calBurned > 0 && (
          <>
            {stats.length > 0 && <Text style={styles.workoutStatDot}>·</Text>}
            <View style={styles.workoutCalBurnBadge}>
              <Ionicons name="flame" size={11} color={colors.accentRed} />
              <Text style={styles.workoutCalBurnText}>{calBurned.toLocaleString()} cal</Text>
            </View>
          </>
        )}
      </View>

      {/* Exercise name summary */}
      {namesSummary && (
        <Text style={styles.exerciseSummary}>{namesSummary}</Text>
      )}

      {/* Workout note / add note button */}
      {readOnly ? (
        !!workout.notes && (
          <Text style={styles.workoutNoteText}>"{workout.notes}"</Text>
        )
      ) : (
        <TouchableOpacity onPress={onEditNote} style={styles.workoutNoteBtn} activeOpacity={0.7}>
          {workout.notes ? (
            <Text style={styles.workoutNoteText}>"{workout.notes}"</Text>
          ) : (
            <View style={styles.addNoteRow}>
              <Ionicons name="pencil-outline" size={12} color={colors.textMuted} />
              <Text style={styles.addNoteText}>Add workout note</Text>
            </View>
          )}
        </TouchableOpacity>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Calories burned summary section (inside post card)
// ---------------------------------------------------------------------------
function BurnSummarySection({ workouts, calorieBurns, totalBurned }) {
  // Only workouts that actually have a calories_burned value
  const workoutsWithCal = workouts.filter(w => w.calories_burned > 0)
  // Show breakdown only when there's more than one source
  const showBreakdown = workoutsWithCal.length + calorieBurns.length > 1

  return (
    <View style={styles.section}>
      <View style={styles.sectionTitleRow}>
        <Ionicons name="flame" size={15} color={colors.accentRed} />
        <Text style={[styles.sectionTitle, styles.burnSectionTitle]}>Calories Burned</Text>
      </View>

      {/* Total */}
      <View style={styles.burnTotalRow}>
        <Text style={styles.burnTotalNum}>{totalBurned.toLocaleString()}</Text>
        <Text style={styles.burnTotalUnit}>cal burned</Text>
      </View>

      {/* Per-source breakdown */}
      {showBreakdown && (
        <View style={styles.burnList}>
          {workoutsWithCal.map(w => (
            <View key={w.id} style={styles.burnRow}>
              <Ionicons name="barbell-outline" size={12} color={colors.textMuted} />
              <Text style={styles.burnRowLabel} numberOfLines={1}>
                {w.name || 'Workout'}
              </Text>
              <Text style={styles.burnRowCal}>{w.calories_burned.toLocaleString()} cal</Text>
            </View>
          ))}
          {calorieBurns.map(b => (
            <View key={b.id} style={styles.burnRow}>
              <Ionicons name="pencil-outline" size={12} color={colors.textMuted} />
              <Text style={styles.burnRowLabel} numberOfLines={1}>
                {b.notes || 'Manual entry'}
              </Text>
              <Text style={styles.burnRowCal}>{b.calories.toLocaleString()} cal</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Daily post card
// ---------------------------------------------------------------------------
function DailyPost({
  date, profile, avatarLoadError, onAvatarError,
  totals, mealGroups, workouts, calorieBurns, totalBurned, dailyLog,
  onEditComment, onEditWorkoutNote, goalCal,
  onPickMedia, onRemoveMedia, mediaUploading,
  readOnly = false, onPressProfile,
}) {
  const hasFoodData = ['breakfast', 'lunch', 'dinner', 'snack'].some(
    k => (mealGroups[k] || []).length > 0
  )
  const displayName = profile?.display_name || 'You'
  const username    = profile?.username
  const comment     = dailyLog?.notes
  const mediaUrl    = dailyLog?.media_url   ?? null
  const mediaType   = dailyLog?.media_type  ?? null

  // Avatar + meta elements (shared between tappable and non-tappable cases)
  const avatarEl = profile?.avatar_url && !avatarLoadError ? (
    <Image
      source={{ uri: profile.avatar_url }}
      style={styles.postAvatar}
      resizeMode="cover"
      onError={onAvatarError}
    />
  ) : (
    <View style={styles.postAvatarCircle}>
      <Text style={styles.postAvatarInitials}>{getInitials(displayName)}</Text>
    </View>
  )

  const metaEl = (
    <View style={styles.postHeaderMeta}>
      <Text style={styles.postName}>{displayName}</Text>
      <Text style={styles.postSubline}>
        {username ? `@${username} · ` : ''}{formatDateLabel(date)}
      </Text>
    </View>
  )

  return (
    <View style={styles.post}>
      {/* ── Post header: avatar + name + date + icons ── */}
      <View style={styles.postHeader}>
        {/* Left side: avatar + name — tappable when onPressProfile is provided */}
        {onPressProfile ? (
          <TouchableOpacity style={styles.postHeaderLeft} onPress={onPressProfile} activeOpacity={0.75}>
            {avatarEl}
            {metaEl}
          </TouchableOpacity>
        ) : (
          <View style={styles.postHeaderLeft}>
            {avatarEl}
            {metaEl}
          </View>
        )}

        {/* Action buttons — hidden in readOnly mode */}
        {!readOnly && (
          <>
            {/* Camera / media button */}
            <TouchableOpacity
              onPress={onPickMedia}
              style={styles.commentIconBtn}
              activeOpacity={0.7}
              disabled={mediaUploading}
            >
              {mediaUploading ? (
                <ActivityIndicator size="small" color={colors.textMuted} />
              ) : (
                <Ionicons
                  name={mediaUrl ? 'camera' : 'camera-outline'}
                  size={18}
                  color={mediaUrl ? colors.text : colors.textMuted}
                />
              )}
            </TouchableOpacity>

            {/* Comment / note button */}
            <TouchableOpacity onPress={onEditComment} style={styles.commentIconBtn} activeOpacity={0.7}>
              <Ionicons
                name={comment ? 'pencil-outline' : 'chatbubble-outline'}
                size={17}
                color={colors.textMuted}
              />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ── Caption / comment ── */}
      {!!comment && (
        <Text style={styles.postCaption}>{comment}</Text>
      )}

      {/* ── Attached media ── */}
      {!!mediaUrl && (
        <MediaAttachment
          mediaUrl={mediaUrl}
          mediaType={mediaType}
          onRemove={readOnly ? null : onRemoveMedia}
        />
      )}

      {/* ── Nutrition section ── */}
      {hasFoodData && (
        <>
          <View style={styles.sectionDivider} />
          <NutritionSection totals={totals} mealGroups={mealGroups} goalCal={goalCal} />
        </>
      )}

      {/* ── Workout section(s) ── */}
      {workouts.map(w => (
        <Fragment key={w.id}>
          <View style={styles.sectionDivider} />
          <WorkoutSection
            workout={w}
            onEditNote={() => onEditWorkoutNote?.(w)}
            readOnly={readOnly}
          />
        </Fragment>
      ))}

      {/* ── Calories burned summary ── */}
      {totalBurned > 0 && (
        <>
          <View style={styles.sectionDivider} />
          <BurnSummarySection
            workouts={workouts}
            calorieBurns={calorieBurns || []}
            totalBurned={totalBurned}
          />
        </>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Locked card for paid creators the viewer isn't subscribed to
// ---------------------------------------------------------------------------
function LockedCreatorCard({ post, settings, subscribing, onSubscribe, onPressProfile }) {
  const { profile } = post
  const initials = getInitials(profile.display_name || profile.username)
  const monthlyDollars = settings.monthly_price_cents
    ? (settings.monthly_price_cents / 100).toFixed(0)
    : null
  const annualDollars = settings.annual_price_cents
    ? (settings.annual_price_cents / 100).toFixed(0)
    : null

  return (
    <View style={styles.post}>
      <TouchableOpacity style={styles.postHeader} onPress={onPressProfile} activeOpacity={0.8}>
        <View style={styles.postHeaderLeft}>
          {profile.avatar_url
            ? <Image source={{ uri: profile.avatar_url }} style={styles.postAvatar} />
            : (
              <View style={styles.postAvatarCircle}>
                <Text style={styles.postAvatarInitials}>{initials}</Text>
              </View>
            )
          }
          <View style={styles.postHeaderMeta}>
            <Text style={styles.postName}>{profile.display_name || profile.username}</Text>
            {!!profile.username && (
              <Text style={styles.postSubline}>@{profile.username}</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>

      <View style={styles.lockedBody}>
        <Ionicons name="lock-closed" size={26} color={colors.textMuted} />
        <Text style={styles.lockedTitle}>Subscriber-only content</Text>
        {!!settings.teaser_text && (
          <Text style={styles.lockedTeaser} numberOfLines={3}>{settings.teaser_text}</Text>
        )}
        {monthlyDollars && (
          <TouchableOpacity
            style={[styles.lockedSubscribeBtn, subscribing && { opacity: 0.6 }]}
            onPress={() => onSubscribe('monthly')}
            disabled={!!subscribing}
            activeOpacity={0.8}
          >
            {subscribing
              ? <ActivityIndicator size="small" color={colors.textLight} />
              : <Text style={styles.lockedSubscribeBtnText}>Subscribe · ${monthlyDollars}/mo</Text>
            }
          </TouchableOpacity>
        )}
        {annualDollars && (
          <TouchableOpacity
            style={[styles.lockedSubscribeBtnAlt, subscribing && { opacity: 0.6 }]}
            onPress={() => onSubscribe('annual')}
            disabled={!!subscribing}
            activeOpacity={0.8}
          >
            <Text style={styles.lockedSubscribeBtnAltText}>${annualDollars}/yr</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Following feed — read-only posts from followed users
// ---------------------------------------------------------------------------
function FollowingFeed({ date, navigation }) {
  const [feedPosts,    setFeedPosts]    = useState([])
  const [feedLoading,  setFeedLoading]  = useState(true)
  const [creatorMap,   setCreatorMap]   = useState(new Map()) // userId → creator_settings
  const [subscribedTo, setSubscribedTo] = useState(new Set()) // Set of subscribed creatorIds
  const [viewerId,     setViewerId]     = useState(null)
  const [subscribing,  setSubscribing]  = useState(null) // creatorId currently in checkout

  useEffect(() => {
    loadFeed()
  }, [date])

  async function loadFeed() {
    setFeedLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setViewerId(user?.id ?? null)

      const posts = await getFeedPosts(date)
      setFeedPosts(posts)

      if (posts.length > 0 && user?.id) {
        const creatorIds = posts.map(p => p.profile.id)
        const [cMap, subSet] = await Promise.all([
          batchGetCreatorSettings(creatorIds),
          batchCheckSubscriptions(user.id, creatorIds),
        ])
        setCreatorMap(cMap)
        setSubscribedTo(subSet)
      }
    } catch (err) {
      console.error('FollowingFeed error:', err)
    } finally {
      setFeedLoading(false)
    }
  }

  async function handleSubscribe(creatorId, planType) {
    if (!viewerId) return
    setSubscribing(creatorId)
    try {
      await startSubscribeCheckout(viewerId, creatorId, planType)
      // Re-check after returning from Stripe Checkout
      const creatorIds = feedPosts.map(p => p.profile.id)
      const subSet = await batchCheckSubscriptions(viewerId, creatorIds)
      setSubscribedTo(subSet)
    } catch (err) {
      Alert.alert('Checkout failed', err.message)
    } finally {
      setSubscribing(null)
    }
  }

  if (feedLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color={colors.textMuted} />
      </View>
    )
  }

  if (feedPosts.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyEmoji}>👥</Text>
        <Text style={styles.emptyTitle}>No posts yet</Text>
        <Text style={styles.emptySubtitle}>
          Follow friends on the Explore tab to see their posts here
        </Text>
      </View>
    )
  }

  return (
    <View style={{ gap: spacing.md }}>
      {feedPosts.map(post => {
        const settings   = creatorMap.get(post.profile.id)
        const isPaywalled = settings?.paywall_enabled && settings?.is_creator
        const canView    = !isPaywalled || subscribedTo.has(post.profile.id) || viewerId === post.profile.id

        if (!canView) {
          return (
            <LockedCreatorCard
              key={post.profile.id}
              post={post}
              settings={settings}
              subscribing={subscribing === post.profile.id}
              onSubscribe={(planType) => handleSubscribe(post.profile.id, planType)}
              onPressProfile={() => navigation.navigate('UserProfile', { userId: post.profile.id })}
            />
          )
        }

        return (
          <DailyPost
            key={post.profile.id}
            date={date}
            profile={post.profile}
            totals={post.totals}
            mealGroups={post.mealGroups}
            workouts={post.workouts}
            calorieBurns={post.calorieBurns}
            totalBurned={post.totalBurned}
            dailyLog={post.dailyLog}
            goalCal={0}
            readOnly
            onPressProfile={() => navigation.navigate('UserProfile', { userId: post.profile.id })}
          />
        )
      })}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function EmptyState({ date }) {
  const isToday = date === getToday()
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyEmoji}>📋</Text>
      <Text style={styles.emptyTitle}>
        {isToday ? 'Nothing logged yet today' : 'Nothing logged this day'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {isToday
          ? 'Tap + to log a meal or start a workout'
          : 'No food or workouts were logged on this day'}
      </Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function FeedScreen({ navigation }) {
  const [selectedDate, setSelectedDate] = useState(getToday)
  const [activeTab,    setActiveTab]    = useState('mine') // 'mine' | 'following'
  const { profile } = useProfile()
  const { totals, mealGroups, workouts, calorieBurns, totalBurned, loading, refresh } = useTodayLogs(selectedDate)

  const [dailyLog,        setDailyLog]        = useState(null)
  const [logLoading,      setLogLoading]      = useState(true)
  const [avatarLoadError, setAvatarLoadError] = useState(false)
  const [mediaUploading,  setMediaUploading]  = useState(false)

  // Note / comment sheet state
  const [sheetVisible, setSheetVisible] = useState(false)
  const [sheetTarget,  setSheetTarget]  = useState(null)
  const [noteSaving,   setNoteSaving]   = useState(false)

  // ── Data fetching ──────────────────────────────────────────────────────────

  async function fetchDailyLog() {
    setLogLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('log_date', selectedDate)
        .maybeSingle()
      setDailyLog(data ?? null)
    } finally {
      setLogLoading(false)
    }
  }

  useFocusEffect(useCallback(() => {
    refresh()
    fetchDailyLog()
    setAvatarLoadError(false)
  }, [selectedDate]))

  // ── Sheet handlers ─────────────────────────────────────────────────────────

  function openCommentSheet() {
    setSheetTarget({ type: 'nutrition', initialNote: dailyLog?.notes ?? '' })
    setSheetVisible(true)
  }

  function openWorkoutNoteSheet(workout) {
    setSheetTarget({ type: 'workout', workoutId: workout.id, initialNote: workout.notes ?? '' })
    setSheetVisible(true)
  }

  async function handleSaveNote(text) {
    setNoteSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (sheetTarget?.type === 'nutrition') {
        const { data, error } = await supabase
          .from('daily_logs')
          .upsert(
            { user_id: user.id, log_date: selectedDate, notes: text || null },
            { onConflict: 'user_id,log_date' }
          )
          .select()
          .single()
        if (error) throw error
        setDailyLog(data)

      } else if (sheetTarget?.type === 'workout') {
        const { error } = await supabase
          .from('workouts')
          .update({ notes: text || null })
          .eq('id', sheetTarget.workoutId)
          .eq('user_id', user.id)
        if (error) throw error
        refresh()
      }

      setSheetVisible(false)
    } catch {
      Alert.alert('Error', 'Could not save. Please try again.')
    } finally {
      setNoteSaving(false)
    }
  }

  // ── Media handlers ─────────────────────────────────────────────────────────

  async function pickAndUploadMedia() {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert(
          'Permission needed',
          'Allow photo library access in Settings to add photos or videos to your post.'
        )
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.85,
        videoMaxDuration: 60,
      })
      if (result.canceled) return

      const asset   = result.assets[0]
      const isVideo = asset.type === 'video'

      setMediaUploading(true)

      const { data: { user } } = await supabase.auth.getUser()
      const publicUrl  = await uploadPostMedia(asset.uri, user.id, selectedDate, isVideo)
      const mediaType  = isVideo ? 'video' : 'image'

      const { data, error } = await supabase
        .from('daily_logs')
        .upsert(
          { user_id: user.id, log_date: selectedDate, media_url: publicUrl, media_type: mediaType },
          { onConflict: 'user_id,log_date' }
        )
        .select()
        .single()
      if (error) throw new Error(error.message)
      setDailyLog(data)
    } catch (err) {
      console.error('Media upload error:', err)
      Alert.alert('Upload failed', err?.message || 'Could not upload media. Please try again.')
    } finally {
      setMediaUploading(false)
    }
  }

  async function handleRemoveMedia() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('daily_logs')
        .upsert(
          { user_id: user.id, log_date: selectedDate, media_url: null, media_type: null },
          { onConflict: 'user_id,log_date' }
        )
        .select()
        .single()
      if (error) throw new Error(error.message)
      setDailyLog(data)
    } catch {
      Alert.alert('Error', 'Could not remove media. Please try again.')
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const hasFoodData = ['breakfast', 'lunch', 'dinner', 'snack'].some(
    k => (mealGroups[k] || []).length > 0
  )
  const hasAnyData = hasFoodData || workouts.length > 0 || !!dailyLog?.notes || !!dailyLog?.media_url
  const goalCal    = profile?.goal_calories || 0
  const isLoading  = loading || logLoading

  const sheetTitle = sheetTarget?.type === 'workout' ? 'Workout Note' : 'Post Comment'

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header row: title + camera (only on My Post tab) ── */}
        <View style={styles.feedHeaderRow}>
          <Text style={styles.pageTitle}>Feed</Text>
          {activeTab === 'mine' && (
            <TouchableOpacity
              style={styles.cameraBtn}
              onPress={pickAndUploadMedia}
              disabled={mediaUploading || isLoading}
              activeOpacity={0.8}
            >
              {mediaUploading ? (
                <ActivityIndicator size="small" color={colors.textLight} />
              ) : (
                <Ionicons name="camera-outline" size={18} color={colors.textLight} />
              )}
            </TouchableOpacity>
          )}
        </View>

        <DateHeader date={selectedDate} onChange={setSelectedDate} />

        {/* ── Tab switcher ── */}
        <View style={styles.tabSwitcher}>
          <TouchableOpacity
            style={[styles.switcherPill, activeTab === 'mine' && styles.switcherPillActive]}
            onPress={() => setActiveTab('mine')}
            activeOpacity={0.75}
          >
            <Text style={[styles.switcherLabel, activeTab === 'mine' && styles.switcherLabelActive]}>
              My Post
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.switcherPill, activeTab === 'following' && styles.switcherPillActive]}
            onPress={() => setActiveTab('following')}
            activeOpacity={0.75}
          >
            <Text style={[styles.switcherLabel, activeTab === 'following' && styles.switcherLabelActive]}>
              Following
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Tab content ── */}
        {activeTab === 'mine' ? (
          isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={colors.textMuted} />
            </View>
          ) : !hasAnyData ? (
            <EmptyState date={selectedDate} />
          ) : (
            <DailyPost
              date={selectedDate}
              profile={profile}
              avatarLoadError={avatarLoadError}
              onAvatarError={() => setAvatarLoadError(true)}
              totals={totals}
              mealGroups={mealGroups}
              workouts={workouts}
              calorieBurns={calorieBurns}
              totalBurned={totalBurned}
              dailyLog={dailyLog}
              onEditComment={openCommentSheet}
              onEditWorkoutNote={openWorkoutNoteSheet}
              goalCal={goalCal}
              onPickMedia={pickAndUploadMedia}
              onRemoveMedia={handleRemoveMedia}
              mediaUploading={mediaUploading}
            />
          )
        ) : (
          <FollowingFeed date={selectedDate} navigation={navigation} />
        )}
      </ScrollView>

      <NoteEditSheet
        visible={sheetVisible}
        initialNote={sheetTarget?.initialNote ?? ''}
        title={sheetTitle}
        onSave={handleSaveNote}
        onClose={() => setSheetVisible(false)}
        saving={noteSaving}
      />
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
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

  // Loading
  loadingWrap: {
    paddingVertical: 60,
    alignItems: 'center',
  },

  // Empty state
  emptyCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyEmoji: {
    fontSize: 36,
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.md,
    color: colors.text,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Post card ──────────────────────────────────────────────────────────────
  post: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },

  // Header row
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    paddingBottom: spacing.sm,
  },
  postHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  postAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  postAvatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bgDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postAvatarInitials: {
    fontFamily: fonts.bold,
    fontSize: fontSize.md,
    color: colors.textLight,
  },
  postHeaderMeta: {
    flex: 1,
    gap: 2,
  },
  postName: {
    fontFamily: fonts.bold,
    fontSize: fontSize.md,
    color: colors.text,
    letterSpacing: -0.2,
  },
  postSubline: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  commentIconBtn: {
    padding: 6,
  },

  // Caption
  postCaption: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: 20,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },

  // Section divider (full-width inside card)
  sectionDivider: {
    height: 1,
    backgroundColor: colors.border,
  },

  // ── Section shared ─────────────────────────────────────────────────────────
  section: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sectionEmoji: {
    fontSize: 15,
  },
  sectionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
    flex: 1,
    letterSpacing: -0.2,
  },

  // ── Nutrition section ──────────────────────────────────────────────────────
  calRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  calBig: {
    fontFamily: fonts.bold,
    fontSize: 36,
    color: colors.text,
    letterSpacing: -1,
    lineHeight: 40,
  },
  calBigOver: {
    color: colors.accentRed,
  },
  calMeta: {
    gap: 1,
  },
  calUnit: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  calGoal: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  progressTrack: {
    height: 5,
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.bgDark,
    borderRadius: radius.full,
  },
  progressFillOver: {
    backgroundColor: colors.accentRed,
  },
  remainingText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: -4,
  },
  remainingTextOver: {
    color: colors.accentRed,
  },
  macroPillRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  macroPill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  macroPillText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.text,
  },
  mealList: {
    gap: 2,
    marginTop: spacing.xs,
  },
  mealRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  mealRowLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  mealRowCal: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
  },

  // ── Workout calorie burn inline badge ─────────────────────────────────────
  workoutCalBurnBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  workoutCalBurnText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.accentRed,
  },

  // ── Burn summary section ───────────────────────────────────────────────────
  burnSectionTitle: {
    color: colors.accentRed,
  },
  burnTotalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  burnTotalNum: {
    fontFamily: fonts.bold,
    fontSize: 36,
    color: colors.accentRed,
    letterSpacing: -1,
    lineHeight: 40,
  },
  burnTotalUnit: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  burnList: {
    gap: 2,
    marginTop: spacing.xs,
  },
  burnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 4,
  },
  burnRowLabel: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  burnRowCal: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
  },

  // ── Workout section ────────────────────────────────────────────────────────
  workoutTime: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  workoutStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  workoutStatText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  workoutStatVal: {
    fontFamily: fonts.semiBold,
    color: colors.text,
  },
  workoutStatDot: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  exerciseSummary: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  workoutNoteBtn: {
    marginTop: 2,
  },
  workoutNoteText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  addNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addNoteText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },

  // ── Feed header row ─────────────────────────────────────────────────────────
  feedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },

  // ── Tab switcher (My Post / Following) ──────────────────────────────────────
  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
    gap: 2,
  },
  switcherPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  switcherPillActive: {
    backgroundColor: colors.bgDark,
  },
  switcherLabel: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  switcherLabelActive: {
    color: colors.textLight,
  },
  cameraBtn: {
    backgroundColor: colors.bgDark,
    borderRadius: radius.full,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },

  // ── Media attachment ────────────────────────────────────────────────────────
  mediaContainer: {
    position: 'relative',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.bgSecondary,
  },
  mediaImage: {
    width: '100%',
    height: 220,
    borderRadius: radius.md,
  },
  videoPlaceholder: {
    width: '100%',
    height: 180,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
  },
  videoLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.7)',
  },
  mediaRemoveBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: radius.full,
    padding: 1,
  },

  // ── Locked creator card ─────────────────────────────────────────────────────
  lockedBody: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  lockedTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
    letterSpacing: -0.2,
  },
  lockedTeaser: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  lockedSubscribeBtn: {
    backgroundColor: colors.bgDark,
    borderRadius: radius.full,
    height: 46,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  lockedSubscribeBtnText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.sm,
    color: colors.textLight,
  },
  lockedSubscribeBtnAlt: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    height: 40,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedSubscribeBtnAltText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
})

// ---------------------------------------------------------------------------
// Note sheet styles
// ---------------------------------------------------------------------------
const nSt = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? 36 : spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  dragHandle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: radius.full,
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  sheetTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.text,
    letterSpacing: -0.3,
  },
  input: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontFamily: fonts.regular,
    fontSize: fontSize.md,
    color: colors.text,
    minHeight: 100,
    maxHeight: 200,
    lineHeight: 22,
  },
  charCount: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: -4,
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  cancelBtn: {
    flex: 1,
    height: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  saveBtn: {
    flex: 2,
    height: 50,
    backgroundColor: colors.bgDark,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.md,
    color: colors.textLight,
    letterSpacing: -0.2,
  },
})
