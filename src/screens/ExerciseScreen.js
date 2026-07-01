import { useState, useCallback, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Modal, TextInput,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { useTodayLogs } from '../hooks/useTodayLogs'
import DateHeader, { getToday } from '../components/DateHeader'
import { colors, fonts, fontSize, spacing, radius } from '../utils/theme'
import { logCalorieBurn, updateCalorieBurn, deleteCalorieBurn } from '../lib/calorieBurnLog'
import { supabase } from '../lib/supabase'

const KG_TO_LBS = 2.20462

function formatSetLine(set) {
  const lbs = set.weight_kg ? Math.round(set.weight_kg * KG_TO_LBS) : 0
  const reps = set.reps || 0
  if (lbs > 0) {
    return `${set.set_number} × ${reps} @ ${lbs} lbs`
  }
  return `${set.set_number} × ${reps}`
}

function calcWorkoutStats(workouts) {
  let exerciseCount = 0
  let setCount = 0
  let volumeLbs = 0
  let totalCalBurned = 0

  for (const w of workouts) {
    totalCalBurned += w.calories_burned || 0
    const exercises = w.workout_exercises || []
    exerciseCount += exercises.length
    for (const ex of exercises) {
      const sets = ex.workout_sets || []
      setCount += sets.length
      for (const s of sets) {
        const lbs = (s.weight_kg || 0) * KG_TO_LBS
        volumeLbs += lbs * (s.reps || 0)
      }
    }
  }

  return { exerciseCount, setCount, volumeLbs: Math.round(volumeLbs), totalCalBurned }
}

// ---------------------------------------------------------------------------
// Log / Edit burn sheet
// ---------------------------------------------------------------------------
function LogBurnSheet({ visible, logDate, editEntry, onSaved, onDismiss }) {
  const [calories, setCalories] = useState('')
  const [notes, setNotes]       = useState('')
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    if (visible) {
      setCalories(editEntry ? String(editEntry.calories) : '')
      setNotes(editEntry?.notes || '')
    }
  }, [visible, editEntry])

  async function handleSave() {
    const cal = parseInt(calories, 10)
    if (!cal || cal <= 0) {
      Alert.alert('Invalid calories', 'Enter a number greater than 0.')
      return
    }
    setSaving(true)
    try {
      if (editEntry) {
        await updateCalorieBurn(editEntry.id, { calories: cal, notes: notes.trim() })
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        await logCalorieBurn({ userId: user.id, logDate, calories: cal, notes: notes.trim() })
      }
      setCalories(''); setNotes('')
      onSaved()
    } catch {
      Alert.alert('Error', 'Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const isEditing = !!editEntry

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={lbStyles.backdrop} activeOpacity={1} onPress={onDismiss} />
        <View style={lbStyles.sheet}>
          <View style={lbStyles.handle} />
          <Text style={lbStyles.title}>{isEditing ? 'Edit Calories Burned' : 'Log Calories Burned'}</Text>

          <Text style={lbStyles.fieldLabel}>CALORIES BURNED</Text>
          <View style={lbStyles.calInputRow}>
            <TextInput
              style={lbStyles.calInput}
              value={calories}
              onChangeText={setCalories}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              returnKeyType="done"
              selectTextOnFocus
              autoFocus
            />
            <Text style={lbStyles.calUnit}>cal</Text>
          </View>

          <Text style={lbStyles.fieldLabel}>NOTES (optional)</Text>
          <TextInput
            style={lbStyles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. Morning run, bike ride…"
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            multiline
          />

          <TouchableOpacity
            style={[lbStyles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Text style={lbStyles.saveBtnText}>{saving ? 'Saving…' : isEditing ? 'Update' : 'Log Burn'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={lbStyles.cancelBtn} onPress={onDismiss} activeOpacity={0.7}>
            <Text style={lbStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

export default function ExerciseScreen({ navigation }) {
  const [selectedDate, setSelectedDate] = useState(getToday)
  const [showBurnSheet, setShowBurnSheet] = useState(false)
  const [editingBurn, setEditingBurn] = useState(null)
  const { workouts, calorieBurns, totalBurned, loading, refresh } = useTodayLogs(selectedDate)

  useFocusEffect(useCallback(() => { refresh() }, [selectedDate]))

  function handleDeleteBurn(id) {
    Alert.alert('Delete entry', 'Remove this calorie burn entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try { await deleteCalorieBurn(id); refresh() } catch { Alert.alert('Error', 'Could not delete entry.') }
        },
      },
    ])
  }

  function openAddBurn() { setEditingBurn(null); setShowBurnSheet(true) }
  function openEditBurn(burn) { setEditingBurn(burn); setShowBurnSheet(true) }

  function handleAddWorkout() {
    navigation.getParent()?.navigate('WorkoutLog', {
      screen: 'WorkoutSession',
      params: { logDate: selectedDate },
    })
  }

  const { exerciseCount, setCount, volumeLbs } = calcWorkoutStats(workouts)

  const hasWorkouts = workouts.length > 0

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Page header row */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.pageTitle}>Exercise</Text>
            <Text style={styles.pageSubtitle}>Track your workouts and progress</Text>
          </View>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={handleAddWorkout}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={16} color={colors.textLight} />
            <Text style={styles.ctaButtonText}>Add Workout</Text>
          </TouchableOpacity>
        </View>

        {/* Date picker */}
        <DateHeader date={selectedDate} onChange={setSelectedDate} />

        {/* Today's summary card */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>TODAY'S SUMMARY</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryValue}>{exerciseCount}</Text>
              <Text style={styles.summaryUnit}>Exercises</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryCol}>
              <Text style={styles.summaryValue}>{setCount}</Text>
              <Text style={styles.summaryUnit}>Sets</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryCol}>
              <Text style={styles.summaryValue}>
                {volumeLbs >= 1000
                  ? `${(volumeLbs / 1000).toFixed(1)}k`
                  : volumeLbs}
              </Text>
              <Text style={styles.summaryUnit}>Vol (lbs)</Text>
            </View>
            {totalBurned > 0 && (
              <>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryCol}>
                  <Text style={[styles.summaryValue, styles.summaryValueBurn]}>
                    {totalBurned >= 1000
                      ? `${(totalBurned / 1000).toFixed(1)}k`
                      : totalBurned}
                  </Text>
                  <Text style={styles.summaryUnit}>Cal Burned</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Workout cards or empty state */}
        {hasWorkouts ? (
          workouts.map(w => {
            const exercises = [...(w.workout_exercises || [])]
              .sort((a, b) => a.order_index - b.order_index)

            const timeStr = new Date(w.started_at).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })

            return (
              <View key={w.id} style={styles.card}>
                <View style={styles.workoutCardHeader}>
                  <Text style={styles.workoutCardTitle}>
                    {w.name || 'Workout'}
                  </Text>
                  <View style={styles.workoutCardMeta}>
                    {!!w.calories_burned && (
                      <View style={styles.calBurnBadge}>
                        <Ionicons name="flame" size={11} color={colors.accentRed} />
                        <Text style={styles.calBurnText}>{w.calories_burned} cal</Text>
                      </View>
                    )}
                    <Text style={styles.workoutCardTime}>{timeStr}</Text>
                  </View>
                </View>

                <View style={styles.divider} />

                {exercises.map((ex, i) => {
                  const exName = ex.exercises?.name || 'Exercise'
                  const sets = [...(ex.workout_sets || [])].sort(
                    (a, b) => a.set_number - b.set_number
                  )

                  // Build compact summary: e.g. "3 × 8 @ 135 lbs" or per-set list
                  let setSummary = ''
                  if (sets.length > 0) {
                    const allSameWeight = sets.every(
                      s => s.weight_kg === sets[0].weight_kg
                    )
                    const allSameReps = sets.every(s => s.reps === sets[0].reps)
                    const lbs = sets[0].weight_kg
                      ? Math.round(sets[0].weight_kg * KG_TO_LBS)
                      : 0

                    if (allSameWeight && allSameReps) {
                      setSummary = `${sets.length} × ${sets[0].reps || 0}${lbs ? ` @ ${lbs} lbs` : ''}`
                    } else {
                      setSummary = sets
                        .map(s => formatSetLine(s))
                        .join(', ')
                    }
                  }

                  return (
                    <View
                      key={ex.id || i}
                      style={[
                        styles.exerciseRow,
                        i < exercises.length - 1 && styles.exerciseRowBorder,
                      ]}
                    >
                      <Text style={styles.exerciseName} numberOfLines={1}>
                        {exName}
                      </Text>
                      {!!setSummary && (
                        <Text style={styles.exerciseSets}>{setSummary}</Text>
                      )}
                    </View>
                  )
                })}
              </View>
            )
          })
        ) : (
          <View style={[styles.card, styles.emptyCard]}>
            <Ionicons name="barbell-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No exercises logged</Text>
            <Text style={styles.emptySubtitle}>
              Start tracking your workouts by adding your first exercise
            </Text>
          </View>
        )}

        {/* Manual calorie burns card */}
        <View style={styles.card}>
          <View style={styles.burnCardHeader}>
            <View style={styles.burnCardLeft}>
              <Ionicons name="flame-outline" size={18} color={colors.textSecondary} />
              <View>
                <Text style={styles.burnCardTitle}>Manual Activity</Text>
                <Text style={styles.burnCardSub}>
                  {calorieBurns.length > 0
                    ? `${calorieBurns.reduce((s, b) => s + b.calories, 0).toLocaleString()} cal from manual entries`
                    : 'Log calories from other activities'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={openAddBurn} hitSlop={10} activeOpacity={0.7}>
              <Ionicons name="add-circle-outline" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {calorieBurns.length > 0 && (
            <>
              <View style={styles.burnDivider} />
              {calorieBurns.map((burn, i) => (
                <View
                  key={burn.id}
                  style={[styles.burnEntryRow, i < calorieBurns.length - 1 && styles.burnEntryRowBorder]}
                >
                  <Text style={styles.burnEntryNotes} numberOfLines={1}>
                    {burn.notes || 'Manual activity'}
                  </Text>
                  <Text style={styles.burnEntryCal}>{burn.calories.toLocaleString()} cal</Text>
                  <TouchableOpacity onPress={() => openEditBurn(burn)} hitSlop={8} style={styles.burnEntryBtn}>
                    <Ionicons name="pencil-outline" size={15} color={colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteBurn(burn.id)} hitSlop={8} style={styles.burnEntryBtn}>
                    <Ionicons name="trash-outline" size={15} color={colors.accentRed} />
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}
        </View>
      </ScrollView>

      <LogBurnSheet
        visible={showBurnSheet}
        logDate={selectedDate}
        editEntry={editingBurn}
        onSaved={() => { setShowBurnSheet(false); refresh() }}
        onDismiss={() => setShowBurnSheet(false)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.md,
    paddingBottom: 32,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  pageTitle: {
    fontFamily: fonts.bold,
    fontSize: 32,
    color: colors.text,
  },
  pageSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // CTA button
  ctaButton: {
    backgroundColor: colors.bgDark,
    borderRadius: radius.full,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  ctaButtonText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.textLight,
  },

  // Card
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
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

  // Summary row
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryCol: {
    flex: 1,
    alignItems: 'center',
  },
  summaryValue: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xxl,
    color: colors.text,
    lineHeight: 34,
  },
  summaryUnit: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
  },

  // Workout card
  workoutCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  workoutCardTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
    flex: 1,
    marginRight: spacing.sm,
  },
  workoutCardMeta: {
    alignItems: 'flex-end',
    gap: 3,
  },
  workoutCardTime: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  calBurnBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  calBurnText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.accentRed,
  },
  summaryValueBurn: {
    color: colors.accentRed,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },

  // Exercise rows
  exerciseRow: {
    paddingVertical: 7,
  },
  exerciseRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  exerciseName: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  exerciseSets: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // Empty state
  emptyCard: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  emptyTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.md,
    color: colors.text,
  },
  emptySubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },

  // Manual burns card
  burnCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  burnCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  burnCardTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  burnCardSub: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 1,
  },
  burnDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.md,
    marginBottom: 4,
  },
  burnEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    gap: spacing.sm,
  },
  burnEntryRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  burnEntryNotes: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  burnEntryCal: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.accentRed,
    flexShrink: 0,
  },
  burnEntryBtn: {
    padding: 2,
  },
})

// ---------------------------------------------------------------------------
// LogBurnSheet styles
// ---------------------------------------------------------------------------
const lbStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: 40,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xl,
    color: colors.text,
    letterSpacing: -0.3,
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  calInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  calInput: {
    flex: 1,
    height: 54,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.bold,
    fontSize: 28,
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  calUnit: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.lg,
    color: colors.textMuted,
    width: 36,
  },
  notesInput: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: fontSize.md,
    color: colors.text,
    minHeight: 72,
    marginBottom: spacing.lg,
    textAlignVertical: 'top',
  },
  saveBtn: {
    backgroundColor: colors.bgDark,
    borderRadius: radius.full,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  saveBtnText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.md,
    color: colors.textLight,
    letterSpacing: -0.2,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  cancelText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
})
