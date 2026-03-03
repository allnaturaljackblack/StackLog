import { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl
} from 'react-native'
import { useProfile } from '../hooks/useProfile'
import { useTodayLogs } from '../hooks/useTodayLogs'
import { colors, spacing, radius, fontSize } from '../utils/theme'
import { supabase } from '../lib/supabase'
import { logWater } from '../lib/waterLog'

// ---------------------------------------------------------------------------
// Workout helpers
// ---------------------------------------------------------------------------
function getWorkoutTimeLabel(startedAt) {
  const h = new Date(startedAt).getHours()
  if (h < 12) return 'MORNING'
  if (h < 17) return 'AFTERNOON'
  return 'EVENING'
}

function getWorkoutTimeStr(startedAt) {
  return new Date(startedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function formatSetSummary(sets) {
  if (!sets || !sets.length) return ''
  const sorted = [...sets].sort((a, b) => a.set_number - b.set_number)
  const reps = sorted.map(s => s.reps)
  const weightLbs = sorted.map(s => Math.round(s.weight_kg * 2.205))
  const sameWeight = weightLbs.every(w => w === weightLbs[0])
  const sameReps = reps.every(r => r === reps[0])

  if (sameWeight && sameReps) {
    return `${sorted.length} × ${reps[0]}${weightLbs[0] ? ` @ ${weightLbs[0]} lbs` : ''}`
  }
  if (sameWeight) {
    return `${reps.join(', ')}${weightLbs[0] ? ` @ ${weightLbs[0]} lbs` : ''}`
  }
  return `${sorted.length} set${sorted.length !== 1 ? 's' : ''}`
}

function ProgressBar({ value, max, color, height = 5 }) {
  const pct = Math.min(value / (max || 1), 1)
  return (
    <View style={{ height, backgroundColor: '#E5E4DE', borderRadius: 99, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height, backgroundColor: color, borderRadius: 99 }} />
    </View>
  )
}

function CalorieRing({ consumed, target }) {
  const pct = Math.min(consumed / (target || 1), 1)
  const size = 110
  const over = consumed > target
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        position: 'absolute', width: size, height: size,
        borderRadius: size / 2, borderWidth: 10, borderColor: '#1a1a1a'
      }} />
      <View style={{
        position: 'absolute', width: size, height: size,
        borderRadius: size / 2, borderWidth: 10,
        borderColor: over ? colors.warn : colors.accent,
        opacity: Math.max(pct, 0.1)
      }} />
      <Text style={{
        fontFamily: 'BarlowCondensed_900Black',
        fontSize: 18, color: colors.textLight, letterSpacing: -0.5
      }}>{Math.round(pct * 100)}%</Text>
    </View>
  )
}

function DateStrip({ selectedDate, onSelectDate }) {
  const dates = []
  for (let i = -3; i <= 3; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    dates.push(d)
  }
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const today = new Date().toISOString().split('T')[0]

  return (
    <View style={dateStyles.container}>
      {dates.map(d => {
        const dateStr = d.toISOString().split('T')[0]
        const isSelected = dateStr === selectedDate
        const isToday = dateStr === today
        const isFuture = dateStr > today
        return (
          <TouchableOpacity
            key={dateStr}
            style={[
              dateStyles.day,
              isSelected && dateStyles.daySelected,
              isFuture && !isSelected && dateStyles.dayFuture,
            ]}
            onPress={() => onSelectDate(dateStr)}
            activeOpacity={0.7}
          >
            <Text style={[dateStyles.dayName, isSelected && dateStyles.dayNameSelected]}>
              {isToday ? 'Today' : dayNames[d.getDay()]}
            </Text>
            <Text style={[dateStyles.dayNum, isSelected && dateStyles.dayNumSelected]}>
              {d.getDate()}
            </Text>
            {isFuture && !isSelected && <View style={dateStyles.futureDot} />}
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const dateStyles = StyleSheet.create({
  container: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  day: { alignItems: 'center', padding: spacing.sm, borderRadius: radius.md, minWidth: 44 },
  daySelected: { backgroundColor: colors.bgDark },
  dayFuture: { opacity: 0.5 },
  dayName: { fontFamily: 'Barlow_400Regular', fontSize: 10, color: colors.textMuted, marginBottom: 4 },
  dayNameSelected: { color: colors.accent },
  dayNum: { fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: 18, color: colors.text },
  dayNumSelected: { color: colors.textLight },
  futureDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 3 },
})

const MEALS = [
  { key: 'breakfast', label: 'Breakfast', icon: '🌅' },
  { key: 'lunch',     label: 'Lunch',     icon: '☀️'  },
  { key: 'dinner',    label: 'Dinner',    icon: '🌙'  },
  { key: 'snack',     label: 'Snacks',    icon: '🍎'  },
]

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export default function HomeScreen({ navigation }) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const { profile, loading: profileLoading } = useProfile()
  const { totals, mealGroups, workouts, totalWaterMl, loading: logsLoading, refresh } = useTodayLogs(selectedDate)

  const isLoading = profileLoading || logsLoading

  const calorieTarget = profile?.calorie_target  || 2000
  const proteinTarget = profile?.protein_target_g || 150
  const carbsTarget   = profile?.carbs_target_g   || 200
  const fatTarget     = profile?.fat_target_g     || 60
  const waterTarget   = profile?.water_target_ml  || 2500
  const displayName   = profile?.display_name || 'there'

  const today = new Date().toISOString().split('T')[0]
  const isToday = selectedDate === today
  const selectedDateObj = new Date(selectedDate + 'T12:00:00')

  const greeting = (() => {
    const h = new Date().getHours()
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  })()

  const dateLabel = selectedDateObj
    .toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    .toUpperCase()

  const dayOfWeek = selectedDateObj.getDay()
  const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1

  const remaining = Math.max(calorieTarget - totals.calories, 0)
  const over = totals.calories > calorieTarget
  const waterDots = Math.min(Math.round(totalWaterMl / 250), 10)
  const waterTargetDots = Math.min(Math.round(waterTarget / 250), 10)

  async function goToFoodLog(mealType, hasLogs) {
    const { data: { user } } = await supabase.auth.getUser()
    if (hasLogs) {
      navigation.navigate('FoodLog', {
        screen: 'MealDetail',
        params: { mealType, logDate: selectedDate, userId: user.id }
      })
    } else {
      navigation.navigate('FoodLog', {
        screen: 'FoodSearch',
        params: { mealType, logDate: selectedDate, userId: user.id }
      })
    }
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: 18, color: colors.textMuted }}>LOADING...</Text>
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor={colors.accentRed} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.dateLabel}>{dateLabel}</Text>
          <Text style={styles.greeting}>
            {isToday ? `${greeting}, ${displayName.split(' ')[0]}.` : `${displayName.split(' ')[0]}'s log.`}
          </Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
        </View>
      </View>

      {/* Date strip */}
      <DateStrip selectedDate={selectedDate} onSelectDate={setSelectedDate} />

      {/* Calorie Hero Card */}
      <View style={styles.heroCard}>
        <View style={styles.heroLeft}>
          <Text style={styles.heroLabel}>CALORIES {isToday ? 'TODAY' : dateLabel.split(',')[0]}</Text>
          <View style={styles.heroNumbers}>
            <Text style={styles.heroConsumed}>{Math.round(totals.calories).toLocaleString()}</Text>
            <Text style={styles.heroTarget}> / {calorieTarget.toLocaleString()}</Text>
          </View>
          <Text style={styles.heroRemaining}>
            {over
              ? <Text style={{ color: colors.warn }}>{Math.round(totals.calories - calorieTarget)} cal over</Text>
              : <><Text style={{ color: colors.accent, fontFamily: 'Barlow_700Bold' }}>{Math.round(remaining).toLocaleString()} cal</Text> remaining</>
            }
          </Text>
        </View>
        <CalorieRing consumed={totals.calories} target={calorieTarget} />
      </View>

      {/* Macro bars */}
      <View style={styles.macroRow}>
        {[
          { label: 'Protein', value: totals.protein, target: proteinTarget, color: colors.accentRed },
          { label: 'Carbs',   value: totals.carbs,   target: carbsTarget,   color: colors.accentBlue },
          { label: 'Fat',     value: totals.fat,      target: fatTarget,     color: colors.warn },
        ].map(m => (
          <View key={m.label} style={styles.macroCard}>
            <View style={styles.macroTop}>
              <Text style={styles.macroLabel}>{m.label}</Text>
              <Text style={styles.macroValue}>{Math.round(m.value)}g</Text>
            </View>
            <ProgressBar value={m.value} max={m.target} color={m.color} />
            <Text style={styles.macroTarget}>/ {m.target}g</Text>
          </View>
        ))}
      </View>

      {/* Water */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Hydration</Text>
        <View style={styles.waterCard}>
          <View style={styles.waterDots}>
            {Array.from({ length: waterTargetDots }).map((_, i) => (
              <View key={i} style={[styles.waterDot, i < waterDots && styles.waterDotFilled]} />
            ))}
          </View>
          <Text style={styles.waterAmount}>
            {totalWaterMl >= 1000 ? `${(totalWaterMl / 1000).toFixed(1)}L` : `${totalWaterMl}ml`}
            {' / '}
            {waterTarget >= 1000 ? `${(waterTarget / 1000).toFixed(1)}L` : `${waterTarget}ml`}
          </Text>
          <View style={styles.waterButtons}>
            {[250, 500, 750, 1000].map(ml => (
            <TouchableOpacity
              key={ml}
              style={styles.waterBtn}
              onPress={async () => {
                const { data: { user } } = await supabase.auth.getUser()
                await logWater(user.id, ml, selectedDate)
                refresh()
              }}
            >
              <Text style={styles.waterBtnText}>+{ml < 1000 ? `${ml}ml` : '1L'}</Text>
            </TouchableOpacity>
          ))}
          </View>
        </View>
      </View>

      {/* Meals */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{isToday ? "Today's Meals" : 'Meals'}</Text>
          <TouchableOpacity onPress={() => goToFoodLog('breakfast', false)}>
            <Text style={styles.sectionAction}>+ Log Food</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.mealsCard}>
          {MEALS.map((meal, i) => {
            const logs = mealGroups[meal.key] || []
            const mealCal = logs.reduce((acc, l) => acc + (l.calories || 0), 0)
            const hasLogs = logs.length > 0
            return (
              <TouchableOpacity
                key={meal.key}
                style={[styles.mealRow, i < MEALS.length - 1 && styles.mealRowBorder]}
                onPress={() => goToFoodLog(meal.key, hasLogs)}
                activeOpacity={0.6}
              >
                <Text style={styles.mealIcon}>{meal.icon}</Text>
                <Text style={styles.mealLabel}>{meal.label}</Text>
                <View style={styles.mealRight}>
                  <Text style={[styles.mealCal, !hasLogs && { color: colors.textMuted }]}>
                    {hasLogs ? `${Math.round(mealCal)} cal` : '—'}
                  </Text>
                  {hasLogs
                    ? <View style={styles.checkDone}><Text style={styles.checkText}>✓</Text></View>
                    : <View style={styles.checkEmpty} />
                  }
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      {/* Workouts */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{isToday ? "Today's Activity" : 'Activity'}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('WorkoutLog')}>
            <Text style={styles.sectionAction}>+ Log</Text>
          </TouchableOpacity>
        </View>
        {workouts.length > 0 ? (
          <View style={styles.workoutList}>
            {workouts.map(w => {
              const exercises = [...(w.workout_exercises || [])]
                .sort((a, b) => a.order_index - b.order_index)
                .filter(we => we.exercises?.name)
              const visible = exercises.slice(0, 5)
              const overflow = exercises.length - visible.length
              return (
                <View key={w.id} style={styles.workoutCard}>
                  {/* Card header */}
                  <View style={styles.workoutCardHeader}>
                    <Text style={styles.workoutCardLabel}>
                      {getWorkoutTimeLabel(w.started_at)}
                    </Text>
                    <Text style={styles.workoutCardTime}>
                      {getWorkoutTimeStr(w.started_at)}
                    </Text>
                  </View>

                  {/* Exercise rows */}
                  {visible.length > 0 && (
                    <>
                      <View style={styles.workoutDivider} />
                      {visible.map((we, i) => (
                        <View key={i} style={styles.workoutExRow}>
                          <Text style={styles.workoutExName} numberOfLines={1}>
                            {we.exercises.name}
                          </Text>
                          <Text style={styles.workoutExSets}>
                            {formatSetSummary(we.workout_sets)}
                          </Text>
                        </View>
                      ))}
                      {overflow > 0 && (
                        <Text style={styles.workoutExOverflow}>+{overflow} more</Text>
                      )}
                    </>
                  )}
                </View>
              )
            })}
          </View>
        ) : (
          <View style={styles.emptyWorkout}>
            <Text style={styles.emptyWorkoutText}>No workouts logged yet</Text>
            <TouchableOpacity
              style={styles.emptyWorkoutBtn}
              onPress={() => navigation.navigate('WorkoutLog')}
            >
              <Text style={styles.emptyWorkoutBtnText}>LOG A WORKOUT</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Weekly strip */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>This Week</Text>
        <View style={styles.weekCard}>
          <View style={styles.weekStrip}>
            {DAY_LABELS.map((d, i) => {
              const isActiveDay = i === adjustedDay
              const isPast = i < adjustedDay
              return (
                <View key={i} style={styles.weekDay}>
                  <View style={[
                    styles.weekDot,
                    isPast && styles.weekDotPast,
                    isActiveDay && styles.weekDotToday,
                  ]}>
                    {(isActiveDay || isPast) && <Text style={styles.weekDotCheck}>✓</Text>}
                  </View>
                  <Text style={[styles.weekLabel, isActiveDay && styles.weekLabelToday]}>{d}</Text>
                </View>
              )
            })}
          </View>
          <Text style={styles.streakText}>
            <Text style={{ color: colors.text, fontFamily: 'Barlow_700Bold' }}>{adjustedDay + 1}-day streak</Text> — keep it up 🔥
          </Text>
        </View>
      </View>

    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: 32 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, paddingTop: 56 },
  dateLabel: { fontFamily: 'Barlow_500Medium', fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1 },
  greeting: { fontFamily: 'BarlowCondensed_900Black', fontSize: 28, color: colors.text, letterSpacing: -0.5 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.bgDark, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: 18, color: colors.accent },

  heroCard: { marginHorizontal: spacing.lg, backgroundColor: colors.bgDark, borderRadius: radius.xl, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroLeft: { flex: 1 },
  heroLabel: { fontFamily: 'Barlow_600SemiBold', fontSize: fontSize.xs, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  heroNumbers: { flexDirection: 'row', alignItems: 'baseline' },
  heroConsumed: { fontFamily: 'BarlowCondensed_900Black', fontSize: 52, color: colors.textLight, letterSpacing: -2, lineHeight: 56 },
  heroTarget: { fontFamily: 'BarlowCondensed_600SemiBold', fontSize: 20, color: '#666' },
  heroRemaining: { fontFamily: 'Barlow_400Regular', fontSize: fontSize.sm, color: '#888', marginTop: 4 },

  macroRow: { flexDirection: 'row', marginHorizontal: spacing.lg, marginTop: spacing.sm, gap: spacing.sm },
  macroCard: { flex: 1, backgroundColor: colors.bgCard, borderRadius: radius.md, padding: spacing.sm, gap: 5 },
  macroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  macroLabel: { fontFamily: 'Barlow_500Medium', fontSize: 10, color: colors.textMuted },
  macroValue: { fontFamily: 'BarlowCondensed_700Bold', fontSize: 14, color: colors.text },
  macroTarget: { fontFamily: 'Barlow_400Regular', fontSize: 10, color: colors.textMuted },

  waterCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  waterDots: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  waterDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.border },
  waterDotFilled: { backgroundColor: colors.accentBlue },
  waterAmount: { fontFamily: 'BarlowCondensed_700Bold', fontSize: 16, color: colors.text },
  waterButtons: { flexDirection: 'row', gap: spacing.sm },
  waterBtn: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.sm, padding: spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  waterBtnText: { fontFamily: 'Barlow_600SemiBold', fontSize: 12, color: colors.text },

  section: { marginTop: spacing.lg, marginHorizontal: spacing.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sectionTitle: { fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: 20, color: colors.text, letterSpacing: -0.3, marginBottom: spacing.sm },
  sectionAction: { fontFamily: 'Barlow_600SemiBold', fontSize: fontSize.sm, color: colors.accentRed },

  mealsCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, overflow: 'hidden' },
  mealRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
  mealRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  mealIcon: { fontSize: 18 },
  mealLabel: { fontFamily: 'Barlow_500Medium', fontSize: fontSize.md, color: colors.text, flex: 1 },
  mealRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mealCal: { fontFamily: 'BarlowCondensed_700Bold', fontSize: 15, color: colors.text },
  checkDone: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  checkText: { color: '#fff', fontSize: 11 },
  checkEmpty: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border },

  workoutList: { gap: spacing.sm },
  workoutCard: { backgroundColor: colors.bgDark, borderRadius: radius.lg, padding: spacing.md },
  workoutCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  workoutCardLabel: { fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: fontSize.md, color: colors.textLight, letterSpacing: 1 },
  workoutCardTime: { fontFamily: 'Barlow_400Regular', fontSize: fontSize.sm, color: 'rgba(255,255,255,0.4)' },
  workoutDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: spacing.sm },
  workoutExRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  workoutExName: { fontFamily: 'Barlow_500Medium', fontSize: fontSize.sm, color: colors.textLight, flex: 1, marginRight: spacing.sm },
  workoutExSets: { fontFamily: 'BarlowCondensed_700Bold', fontSize: fontSize.sm, color: colors.accentRed },
  workoutExOverflow: { fontFamily: 'Barlow_400Regular', fontSize: fontSize.sm, color: 'rgba(255,255,255,0.35)', marginTop: 4 },
  emptyWorkout: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center', gap: spacing.sm },
  emptyWorkoutText: { fontFamily: 'Barlow_400Regular', fontSize: fontSize.sm, color: colors.textMuted },
  emptyWorkoutBtn: { backgroundColor: colors.bgDark, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  emptyWorkoutBtnText: { fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: 14, color: colors.textLight, letterSpacing: 0.5 },

  weekCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  weekStrip: { flexDirection: 'row', justifyContent: 'space-between' },
  weekDay: { alignItems: 'center', gap: 5 },
  weekDot: { width: 34, height: 34, borderRadius: 8, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  weekDotToday: { backgroundColor: colors.accentRed },
  weekDotPast: { backgroundColor: colors.bgDark },
  weekDotCheck: { color: '#fff', fontSize: 14 },
  weekLabel: { fontFamily: 'Barlow_400Regular', fontSize: 11, color: colors.textMuted },
  weekLabelToday: { fontFamily: 'Barlow_700Bold', color: colors.accentRed },
  streakText: { fontFamily: 'Barlow_400Regular', fontSize: fontSize.sm, color: colors.textMuted },
})