import { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { colors, spacing, radius, fontSize } from '../../utils/theme'
import { supabase } from '../../lib/supabase'
import { saveWorkout } from '../../lib/workoutLog'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDuration(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function makeSet() {
  return { weight: '', reps: '', id: Date.now() + Math.random() }
}

function makeExercise(name, muscleGroup, supersetId = null) {
  return {
    id: Date.now() + Math.random(),
    name,
    muscleGroup,
    sets: [makeSet()],
    supersetId,
  }
}

/**
 * Collapse the flat exercises array into render groups:
 *   { type: 'solo', exercise }
 *   { type: 'superset', exercises: [...], supersetId }
 * Maintains the original ordering of exercises.
 */
function buildGroups(exercises) {
  const groups = []
  const seenIds = new Set()

  for (const ex of exercises) {
    if (seenIds.has(ex.id)) continue
    seenIds.add(ex.id)

    if (!ex.supersetId) {
      groups.push({ type: 'solo', exercise: ex })
    } else {
      // All members that share this supersetId (preserving order from exercises array)
      const group = exercises.filter((e) => e.supersetId === ex.supersetId)
      group.forEach((e) => seenIds.add(e.id))
      groups.push({ type: 'superset', exercises: group, supersetId: ex.supersetId })
    }
  }
  return groups
}

const DARK_CARD = '#1C1C1E'
const SS_RED = colors.accentRed

// ---------------------------------------------------------------------------
// Set row
// ---------------------------------------------------------------------------
function SetRow({ setIndex, set, onChangeWeight, onChangeReps, onDelete, showDelete }) {
  return (
    <View style={styles.setRow}>
      <View style={styles.setNumWrap}>
        <Text style={styles.setNum}>{setIndex + 1}</Text>
      </View>
      <View style={styles.inputGroup}>
        <TextInput
          style={styles.setInput}
          value={set.weight}
          onChangeText={onChangeWeight}
          placeholder="lbs"
          placeholderTextColor="rgba(255,255,255,0.3)"
          keyboardType="decimal-pad"
          returnKeyType="next"
          selectTextOnFocus
        />
        <Text style={styles.inputSep}>×</Text>
        <TextInput
          style={styles.setInput}
          value={set.reps}
          onChangeText={onChangeReps}
          placeholder="reps"
          placeholderTextColor="rgba(255,255,255,0.3)"
          keyboardType="number-pad"
          returnKeyType="done"
          selectTextOnFocus
        />
      </View>
      {showDelete && (
        <TouchableOpacity onPress={onDelete} style={styles.deleteSetBtn}>
          <Text style={styles.deleteSetIcon}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Exercise card
// ---------------------------------------------------------------------------
function ExerciseCard({
  exercise,
  onAddSet,
  onUpdateSet,
  onDeleteSet,
  onRemoveExercise,
  onAddSuperset,   // present only on solo cards
  topRadius = true,
  bottomRadius = true,
}) {
  return (
    <View
      style={[
        styles.exerciseCard,
        !topRadius && { borderTopLeftRadius: 0, borderTopRightRadius: 0 },
        !bottomRadius && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
      ]}
    >
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.exerciseName}>{exercise.name}</Text>
          <View style={styles.muscleTag}>
            <Text style={styles.muscleTagText}>{exercise.muscleGroup}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onRemoveExercise} style={styles.removeExerciseBtn}>
          <Text style={styles.removeExerciseIcon}>🗑</Text>
        </TouchableOpacity>
      </View>

      {/* Column labels */}
      <View style={styles.colLabels}>
        <Text style={[styles.colLabel, { width: 32 }]}>SET</Text>
        <Text style={[styles.colLabel, { flex: 1, textAlign: 'center' }]}>WEIGHT (LBS)</Text>
        <Text style={[styles.colLabel, { flex: 1, textAlign: 'center' }]}>REPS</Text>
      </View>

      {/* Sets */}
      {exercise.sets.map((set, idx) => (
        <SetRow
          key={set.id}
          setIndex={idx}
          set={set}
          onChangeWeight={(val) => onUpdateSet(idx, 'weight', val)}
          onChangeReps={(val) => onUpdateSet(idx, 'reps', val)}
          onDelete={() => onDeleteSet(idx)}
          showDelete={exercise.sets.length > 1}
        />
      ))}

      {/* Add set */}
      <TouchableOpacity style={styles.addSetBtn} onPress={onAddSet}>
        <Text style={styles.addSetText}>+ Add Set</Text>
      </TouchableOpacity>

      {/* Superset CTA — only on solo cards */}
      {onAddSuperset && (
        <TouchableOpacity style={styles.addSupersetBtn} onPress={onAddSuperset}>
          <Text style={styles.addSupersetText}>+ Superset</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Thin connector rendered between superset exercises
// ---------------------------------------------------------------------------
function SupersetConnector() {
  return (
    <View style={styles.ssConnector}>
      <View style={styles.ssConnectorLine} />
      <View style={styles.ssConnectorPill}>
        <Text style={styles.ssConnectorPillText}>SS</Text>
      </View>
      <View style={styles.ssConnectorLine} />
    </View>
  )
}

// ---------------------------------------------------------------------------
// Superset group wrapper
// ---------------------------------------------------------------------------
function SupersetGroup({
  exercises,
  supersetId,
  onAddSet,
  onUpdateSet,
  onDeleteSet,
  onRemoveExercise,
  onAddToSuperset,
  onBreakSuperset,
}) {
  return (
    <View style={styles.ssGroup}>
      {/* Badge row */}
      <View style={styles.ssBadgeRow}>
        <View style={styles.ssBadge}>
          <Text style={styles.ssBadgeText}>SUPERSET</Text>
        </View>
        <TouchableOpacity onPress={onBreakSuperset}>
          <Text style={styles.ssBreakText}>Break apart</Text>
        </TouchableOpacity>
      </View>

      {/* Left accent bar + stacked cards */}
      <View style={styles.ssBody}>
        <View style={styles.ssAccentBar} />
        <View style={{ flex: 1 }}>
          {exercises.map((ex, idx) => (
            <View key={ex.id}>
              <ExerciseCard
                exercise={ex}
                onAddSet={() => onAddSet(ex.id)}
                onUpdateSet={(setIdx, field, val) => onUpdateSet(ex.id, setIdx, field, val)}
                onDeleteSet={(setIdx) => onDeleteSet(ex.id, setIdx)}
                onRemoveExercise={() => onRemoveExercise(ex.id)}
                topRadius={idx === 0}
                bottomRadius={idx === exercises.length - 1}
              />
              {idx < exercises.length - 1 && <SupersetConnector />}
            </View>
          ))}
        </View>
      </View>

      {/* Add another exercise to this superset */}
      <TouchableOpacity style={styles.ssAddBtn} onPress={onAddToSuperset}>
        <Text style={styles.ssAddText}>+ Add to Superset</Text>
      </TouchableOpacity>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function WorkoutLogScreen({ navigation, route }) {
  const [exercises, setExercises] = useState([])
  const [startedAt] = useState(new Date())
  const [elapsed, setElapsed] = useState(0)
  const [saving, setSaving] = useState(false)
  const timerRef = useRef(null)

  // Timer
  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(timerRef.current)
  }, [])

  // Receive exercise back from WorkoutSearchScreen
  useEffect(() => {
    const incoming = route.params?.addExercise
    if (!incoming) return

    const { name, muscleGroup, supersetWithExId } = incoming

    setExercises((prev) => {
      if (supersetWithExId) {
        const targetIdx = prev.findIndex((ex) => ex.id === supersetWithExId)
        if (targetIdx === -1) return [...prev, makeExercise(name, muscleGroup)]

        const target = prev[targetIdx]
        const ssId = target.supersetId || `ss-${Date.now()}`

        // Ensure target has a supersetId
        const updated = prev.map((ex) =>
          ex.id === target.id && !ex.supersetId ? { ...ex, supersetId: ssId } : ex
        )

        // Insert new exercise after the last member of the superset
        const lastMemberIdx = updated.reduce(
          (last, ex, i) => (ex.supersetId === ssId ? i : last),
          targetIdx
        )
        const newEx = makeExercise(name, muscleGroup, ssId)
        const result = [...updated]
        result.splice(lastMemberIdx + 1, 0, newEx)
        return result
      }

      // Normal append
      return [...prev, makeExercise(name, muscleGroup)]
    })

    navigation.setParams({ addExercise: undefined })
  }, [route.params?.addExercise])

  // ---- Mutators ----

  const addSet = useCallback((exId) => {
    setExercises((prev) =>
      prev.map((ex) => (ex.id === exId ? { ...ex, sets: [...ex.sets, makeSet()] } : ex))
    )
  }, [])

  const updateSet = useCallback((exId, setIdx, field, value) => {
    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exId) return ex
        const sets = ex.sets.map((s, i) => (i === setIdx ? { ...s, [field]: value } : s))
        return { ...ex, sets }
      })
    )
  }, [])

  const deleteSet = useCallback((exId, setIdx) => {
    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exId) return ex
        return { ...ex, sets: ex.sets.filter((_, i) => i !== setIdx) }
      })
    )
  }, [])

  const removeExercise = useCallback((exId) => {
    setExercises((prev) => {
      const removed = prev.find((ex) => ex.id === exId)
      const remaining = prev.filter((ex) => ex.id !== exId)
      // If this was a superset member and only one sibling remains, un-superset it
      if (removed?.supersetId) {
        const siblingsLeft = remaining.filter((ex) => ex.supersetId === removed.supersetId)
        if (siblingsLeft.length === 1) {
          return remaining.map((ex) =>
            ex.supersetId === removed.supersetId ? { ...ex, supersetId: null } : ex
          )
        }
      }
      return remaining
    })
  }, [])

  const breakSuperset = useCallback((supersetId) => {
    setExercises((prev) =>
      prev.map((ex) => (ex.supersetId === supersetId ? { ...ex, supersetId: null } : ex))
    )
  }, [])

  // ---- Save ----

  async function handleFinish() {
    if (exercises.length === 0) {
      Alert.alert('No exercises', 'Add at least one exercise before finishing.')
      return
    }
    const totalSets = exercises.reduce(
      (sum, ex) => sum + ex.sets.filter((s) => s.weight !== '' && s.reps !== '').length,
      0
    )
    if (totalSets === 0) {
      Alert.alert('No sets logged', 'Enter weight and reps for at least one set.')
      return
    }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await saveWorkout({ userId: user.id, startedAt: startedAt.toISOString(), exercises })
      navigation.getParent()?.goBack()
    } catch (err) {
      console.error('Error saving workout:', err)
      Alert.alert('Error', 'Could not save workout. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function handleDiscard() {
    Alert.alert('Discard Workout?', 'Your progress will not be saved.', [
      { text: 'Keep Going', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.getParent()?.goBack() },
    ])
  }

  const groups = buildGroups(exercises)

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleDiscard} style={styles.headerBtn}>
            <Text style={styles.headerBtnTextMuted}>Discard</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>New Workout</Text>
            <Text style={styles.timer}>{formatDuration(elapsed)}</Text>
          </View>
          <TouchableOpacity
            onPress={handleFinish}
            style={[styles.finishBtn, saving && { opacity: 0.6 }]}
            disabled={saving}
          >
            <Text style={styles.finishBtnText}>{saving ? 'Saving…' : 'Finish'}</Text>
          </TouchableOpacity>
        </View>

        {/* Body */}
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {exercises.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>💪</Text>
              <Text style={styles.emptyTitle}>Ready to work?</Text>
              <Text style={styles.emptyBody}>
                Tap "Add Exercise" to start building your workout.
              </Text>
            </View>
          ) : (
            groups.map((group) => {
              if (group.type === 'solo') {
                const ex = group.exercise
                return (
                  <ExerciseCard
                    key={ex.id}
                    exercise={ex}
                    onAddSet={() => addSet(ex.id)}
                    onUpdateSet={(setIdx, field, val) => updateSet(ex.id, setIdx, field, val)}
                    onDeleteSet={(setIdx) => deleteSet(ex.id, setIdx)}
                    onRemoveExercise={() => removeExercise(ex.id)}
                    onAddSuperset={() =>
                      navigation.navigate('WorkoutSearch', { supersetWithExId: ex.id })
                    }
                  />
                )
              }

              return (
                <SupersetGroup
                  key={group.supersetId}
                  exercises={group.exercises}
                  supersetId={group.supersetId}
                  onAddSet={addSet}
                  onUpdateSet={updateSet}
                  onDeleteSet={deleteSet}
                  onRemoveExercise={removeExercise}
                  onAddToSuperset={() =>
                    navigation.navigate('WorkoutSearch', {
                      supersetWithExId: group.exercises[group.exercises.length - 1].id,
                    })
                  }
                  onBreakSuperset={() => breakSuperset(group.supersetId)}
                />
              )
            })
          )}

          <TouchableOpacity
            style={styles.addExerciseBtn}
            onPress={() => navigation.navigate('WorkoutSearch')}
            activeOpacity={0.8}
          >
            <Text style={styles.addExerciseText}>+ Add Exercise</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  headerBtn: { width: 72 },
  headerBtnTextMuted: {
    fontFamily: 'Barlow_400Regular',
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  headerCenter: { alignItems: 'center' },
  headerTitle: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: fontSize.xl,
    letterSpacing: -0.3,
    color: colors.text,
  },
  timer: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: fontSize.sm,
    color: colors.accentRed,
    letterSpacing: 1,
    marginTop: 2,
  },
  finishBtn: {
    width: 72,
    backgroundColor: colors.accentRed,
    borderRadius: radius.md,
    paddingVertical: 8,
    alignItems: 'center',
  },
  finishBtnText: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: fontSize.md,
    color: colors.textLight,
    letterSpacing: -0.2,
  },

  // Scroll
  scroll: { padding: spacing.md, paddingBottom: 60, gap: spacing.md },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: spacing.xl * 2, gap: spacing.sm },
  emptyIcon: { fontSize: 48, marginBottom: spacing.sm },
  emptyTitle: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: fontSize.xxl,
    color: colors.text,
    letterSpacing: -0.3,
  },
  emptyBody: {
    fontFamily: 'Barlow_400Regular',
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },

  // Exercise card
  exerciseCard: { backgroundColor: DARK_CARD, borderRadius: radius.lg, padding: spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm },
  exerciseName: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: fontSize.lg,
    color: colors.textLight,
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  muscleTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  muscleTagText: {
    fontFamily: 'Barlow_600SemiBold',
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  removeExerciseBtn: { padding: spacing.xs },
  removeExerciseIcon: { fontSize: 16 },

  // Column labels
  colLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
    paddingLeft: 32 + spacing.sm,
  },
  colLabel: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.8,
  },

  // Set row
  setRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  setNumWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  setNum: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: fontSize.md,
    color: 'rgba(255,255,255,0.5)',
  },
  inputGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  setInput: {
    flex: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    fontFamily: 'Barlow_600SemiBold',
    fontSize: fontSize.md,
    color: colors.textLight,
    textAlign: 'center',
  },
  inputSep: {
    fontFamily: 'Barlow_700Bold',
    fontSize: fontSize.md,
    color: 'rgba(255,255,255,0.3)',
  },
  deleteSetBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  deleteSetIcon: { fontSize: 12, color: 'rgba(255,255,255,0.3)' },

  // Add set / superset
  addSetBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.sm,
    borderStyle: 'dashed',
  },
  addSetText: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: fontSize.md,
    color: colors.accentRed,
    letterSpacing: -0.2,
  },
  addSupersetBtn: {
    marginTop: spacing.xs,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  addSupersetText: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: -0.1,
  },

  // Superset group
  ssGroup: { gap: spacing.xs },
  ssBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  ssBadge: {
    backgroundColor: SS_RED,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  ssBadgeText: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: fontSize.xs,
    color: colors.textLight,
    letterSpacing: 1,
  },
  ssBreakText: {
    fontFamily: 'Barlow_400Regular',
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  ssBody: { flexDirection: 'row', gap: spacing.xs },
  ssAccentBar: { width: 3, backgroundColor: SS_RED, borderRadius: radius.full },
  // SS connector between stacked cards
  ssConnector: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 20,
    paddingHorizontal: spacing.sm,
  },
  ssConnectorLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,55,48,0.25)' },
  ssConnectorPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(255,55,48,0.12)',
    borderRadius: radius.full,
  },
  ssConnectorPillText: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: fontSize.xs,
    color: SS_RED,
    letterSpacing: 0.5,
  },
  ssAddBtn: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,55,48,0.3)',
    borderRadius: radius.md,
    borderStyle: 'dashed',
  },
  ssAddText: {
    fontFamily: 'BarlowCondensed_700Bold',
    fontSize: fontSize.md,
    color: SS_RED,
    letterSpacing: -0.1,
  },

  // Add exercise CTA
  addExerciseBtn: {
    backgroundColor: colors.text,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  addExerciseText: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: fontSize.lg,
    color: colors.textLight,
    letterSpacing: -0.2,
  },
})
