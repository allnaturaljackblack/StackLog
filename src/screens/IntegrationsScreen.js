import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Platform, Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { colors, fonts, fontSize, spacing, radius } from '../utils/theme'
import {
  isNativeModuleReady as hkIsNativeReady,
  isHealthKitAvailable,
  requestHealthKitPermissions,
  fetchWorkoutsSince as hkFetch,
  getLastSyncDate    as hkGetLast,
  setLastSyncDate    as hkSetLast,
} from '../lib/integrations/healthkit'
import {
  connectStrava,
  disconnectStrava,
  isStravaConnected,
  fetchActivitiesSince as stravaFetch,
  getLastSyncDate      as stravaGetLast,
  setLastSyncDate      as stravaSetLast,
} from '../lib/integrations/strava'
import {
  connectWhoop,
  disconnectWhoop,
  isWhoopConnected,
  fetchWorkoutsSince as whoopFetch,
  getLastSyncDate    as whoopGetLast,
  setLastSyncDate    as whoopSetLast,
} from '../lib/integrations/whoop'
import { saveExternalWorkouts } from '../lib/syncEngine'
import { supabase } from '../lib/supabase'

// ─── Data ─────────────────────────────────────────────────────────────────────

const INTEGRATIONS = [
  {
    id:          'healthkit',
    name:        'Apple Health',
    subtitle:    'Syncs workouts from Apple Watch, Apple Fitness+, and any app that writes to Health.',
    iconName:    'heart',
    iconColor:   '#FF3730',
    iosOnly:     true,
  },
  {
    id:          'strava',
    name:        'Strava',
    subtitle:    'Import runs, rides, and other activities logged in Strava.',
    iconName:    'bicycle',
    iconColor:   '#FC4C02',
    iosOnly:     false,
  },
  {
    id:          'whoop',
    name:        'Whoop',
    subtitle:    'Import strain workouts and recovery data from your Whoop strap.',
    iconName:    'watch',
    iconColor:   '#00C48C',
    iosOnly:     false,
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function IntegrationsScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const [userId,       setUserId]       = useState(null)
  const [status,       setStatus]       = useState({}) // { healthkit: bool, strava: bool, whoop: bool }
  const [syncing,      setSyncing]      = useState({}) // { [id]: bool }
  const [lastSync,     setLastSync]     = useState({}) // { [id]: Date|null }
  const [loading,      setLoading]      = useState(true)
  const [hkNativeReady] = useState(() => hkIsNativeReady()) // stable — only changes after rebuild

  // ── Load current user + connection status ────────────────────────────────
  const loadStatus = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id || null)

      const [hkAvail, stravaConn, whoopConn] = await Promise.all([
        Platform.OS === 'ios' ? isHealthKitAvailable() : Promise.resolve(false),
        isStravaConnected(),
        isWhoopConnected(),
      ])

      const [hkLast, stravaLast, whoopLast] = await Promise.all([
        hkGetLast(),
        stravaGetLast(),
        whoopGetLast(),
      ])

      setStatus({ healthkit: hkAvail, strava: stravaConn, whoop: whoopConn })
      setLastSync({ healthkit: hkLast, strava: stravaLast, whoop: whoopLast })
    } catch (err) {
      console.warn('[IntegrationsScreen] loadStatus error:', err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  // ── Connect ──────────────────────────────────────────────────────────────
  async function handleConnect(id) {
    setSyncing((s) => ({ ...s, [id]: true }))
    try {
      if (id === 'healthkit') {
        await requestHealthKitPermissions()
        setStatus((s) => ({ ...s, healthkit: true }))
      } else if (id === 'strava') {
        await connectStrava()
        setStatus((s) => ({ ...s, strava: true }))
      } else if (id === 'whoop') {
        await connectWhoop()
        setStatus((s) => ({ ...s, whoop: true }))
      }
      // Immediately run a first sync after connecting
      await handleSync(id)
    } catch (err) {
      Alert.alert('Connection failed', err.message)
    } finally {
      setSyncing((s) => ({ ...s, [id]: false }))
    }
  }

  // ── Disconnect ───────────────────────────────────────────────────────────
  async function handleDisconnect(id) {
    Alert.alert(
      'Disconnect',
      `Stop syncing from ${INTEGRATIONS.find((i) => i.id === id)?.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            if (id === 'strava') await disconnectStrava()
            else if (id === 'whoop') await disconnectWhoop()
            // HealthKit: just revoke our stored "last sync" — permissions live in iOS Settings
            setStatus((s) => ({ ...s, [id]: false }))
          },
        },
      ]
    )
  }

  // ── Manual sync ──────────────────────────────────────────────────────────
  async function handleSync(id) {
    if (!userId) return
    setSyncing((s) => ({ ...s, [id]: true }))
    const now = new Date()

    try {
      let workouts = []

      if (id === 'healthkit') {
        const since = await hkGetLast()
        workouts    = await hkFetch(since)
        await hkSetLast(now)
      } else if (id === 'strava') {
        const since = await stravaGetLast()
        workouts    = await stravaFetch(since)
        await stravaSetLast(now)
      } else if (id === 'whoop') {
        const since = await whoopGetLast()
        workouts    = await whoopFetch(since)
        await whoopSetLast(now)
      }

      const { saved, skipped, errors } = await saveExternalWorkouts(userId, workouts)
      setLastSync((s) => ({ ...s, [id]: now }))

      if (errors.length > 0) {
        Alert.alert('Sync partially failed', `${saved} imported, ${errors.length} error(s).`)
      } else if (saved === 0 && skipped === 0 && workouts.length === 0) {
        Alert.alert('Up to date', 'No new workouts found.')
      } else {
        Alert.alert(
          'Sync complete',
          saved > 0 ? `${saved} workout${saved !== 1 ? 's' : ''} imported.` : 'Already up to date.'
        )
      }
    } catch (err) {
      Alert.alert('Sync failed', err.message)
    } finally {
      setSyncing((s) => ({ ...s, [id]: false }))
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  function formatLastSync(date) {
    if (!date) return 'Never synced'
    const d = date instanceof Date ? date : new Date(date)
    const diff = Date.now() - d.getTime()
    const mins  = Math.floor(diff / 60000)
    if (mins < 1)  return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24)  return `${hrs}h ago`
    return d.toLocaleDateString()
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.text} />
      </View>
    )
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Integrations</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionHint}>
          Connect your fitness apps to automatically import workouts into StackLog.
        </Text>

        {INTEGRATIONS.map((item) => {
          if (item.iosOnly && Platform.OS !== 'ios') return null

          const connected  = status[item.id]
          const isSyncing  = syncing[item.id]
          const last       = lastSync[item.id]
          // HealthKit needs a native build — disable connect until rebuilt
          const needsBuild = item.id === 'healthkit' && !hkNativeReady

          return (
            <View key={item.id} style={styles.card}>
              {/* Icon + info */}
              <View style={styles.cardTop}>
                <View style={[styles.iconBadge, { backgroundColor: item.iconColor + '18' }]}>
                  <Ionicons name={item.iconName} size={22} color={item.iconColor} />
                </View>
                <View style={styles.cardInfo}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.cardName}>{item.name}</Text>
                    {connected && (
                      <View style={styles.connectedBadge}>
                        <Text style={styles.connectedText}>Connected</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
                  {connected && (
                    <Text style={styles.lastSyncText}>Last sync: {formatLastSync(last)}</Text>
                  )}
                  {needsBuild && (
                    <Text style={styles.needsBuildText}>Requires an EAS dev client build to activate.</Text>
                  )}
                </View>
              </View>

              {/* Action buttons */}
              <View style={styles.cardActions}>
                {connected ? (
                  <>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnSecondary]}
                      onPress={() => handleDisconnect(item.id)}
                      disabled={isSyncing}
                    >
                      <Text style={styles.btnSecondaryText}>Disconnect</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnPrimary, isSyncing && styles.btnDisabled]}
                      onPress={() => handleSync(item.id)}
                      disabled={isSyncing}
                    >
                      {isSyncing
                        ? <ActivityIndicator size="small" color={colors.textLight} />
                        : <Text style={styles.btnPrimaryText}>Sync Now</Text>}
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={[styles.btn, styles.btnPrimary, (isSyncing || needsBuild) && styles.btnDisabled]}
                    onPress={() => !needsBuild && handleConnect(item.id)}
                    disabled={isSyncing || needsBuild}
                  >
                    {isSyncing
                      ? <ActivityIndicator size="small" color={colors.textLight} />
                      : <Text style={styles.btnPrimaryText}>Connect</Text>}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )
        })}

        <Text style={styles.footerNote}>
          Imported workouts appear in your Exercise log and count toward your daily calorie burn.
          Duplicate workouts are automatically skipped.
        </Text>
      </ScrollView>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: colors.bg,
  },
  centered: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontFamily: fonts.semiBold,
    fontSize:   fontSize.md,
    color:      colors.text,
  },
  scroll: {
    padding: spacing.md,
    gap:     spacing.md,
  },
  sectionHint: {
    fontFamily: fonts.regular,
    fontSize:   fontSize.sm,
    color:      colors.textSecondary,
    lineHeight: 20,
  },

  // ── Card ──────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: colors.bgCard,
    borderRadius:    radius.lg,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         spacing.md,
    gap:             spacing.md,
  },
  cardTop: {
    flexDirection: 'row',
    gap:           spacing.sm + 4,
  },
  iconBadge: {
    width:          44,
    height:         44,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
    gap:  4,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
  },
  cardName: {
    fontFamily: fonts.semiBold,
    fontSize:   fontSize.md,
    color:      colors.text,
  },
  connectedBadge: {
    backgroundColor: colors.success + '20',
    paddingHorizontal: 8,
    paddingVertical:   2,
    borderRadius:      radius.full,
  },
  connectedText: {
    fontFamily: fonts.medium,
    fontSize:   fontSize.xs,
    color:      colors.success,
  },
  cardSubtitle: {
    fontFamily: fonts.regular,
    fontSize:   fontSize.sm,
    color:      colors.textSecondary,
    lineHeight: 19,
  },
  lastSyncText: {
    fontFamily: fonts.regular,
    fontSize:   fontSize.xs,
    color:      colors.textMuted,
    marginTop:  2,
  },
  needsBuildText: {
    fontFamily: fonts.regular,
    fontSize:   fontSize.xs,
    color:      colors.warn,
    marginTop:  4,
  },

  // ── Buttons ───────────────────────────────────────────────────────────────
  cardActions: {
    flexDirection: 'row',
    gap:           spacing.sm,
  },
  btn: {
    flex:            1,
    height:          40,
    borderRadius:    radius.full,
    alignItems:      'center',
    justifyContent:  'center',
  },
  btnPrimary: {
    backgroundColor: colors.bgDark,
  },
  btnPrimaryText: {
    fontFamily: fonts.semiBold,
    fontSize:   fontSize.sm,
    color:      colors.textLight,
  },
  btnSecondary: {
    borderWidth:  1,
    borderColor:  colors.border,
  },
  btnSecondaryText: {
    fontFamily: fonts.medium,
    fontSize:   fontSize.sm,
    color:      colors.textSecondary,
  },
  btnDisabled: {
    opacity: 0.6,
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footerNote: {
    fontFamily: fonts.regular,
    fontSize:   fontSize.xs,
    color:      colors.textMuted,
    textAlign:  'center',
    lineHeight: 18,
    paddingHorizontal: spacing.md,
  },
})
