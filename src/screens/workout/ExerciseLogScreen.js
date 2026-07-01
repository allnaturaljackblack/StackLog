import { useState, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, spacing, radius, fontSize } from '../../utils/theme'

// ---------------------------------------------------------------------------
// Cardio helpers (mirrored from WorkoutLogScreen)
// ---------------------------------------------------------------------------
function getCardioType(exerciseName) {
  const n = (exerciseName || '').toLowerCase()
  if (/swim/.test(n))                              return 'swim'
  if (/run|jog|treadmill|walk|elliptical/.test(n)) return 'run'
  if (/cycl|bike|bicycle|spin/.test(n))            return 'cycle'
  return 'time_only'
}

function makeSet()      { return { weight: '', reps: '', id: Date.now() + Math.random() } }
function makeCardioSet(){ return { distance: '', duration: '', id: Date.now() + Math.random() } }

// ---------------------------------------------------------------------------
// Strength set row
// ---------------------------------------------------------------------------
function SetRow({ setIndex, set, onChangeWeight, onChangeReps, onDelete, showDelete }) {
  return (
    <View style={styles.setRow}>
      <View style={styles.setNumWrap}>
        <Text style={styles.setNum}>{setIndex + 1}</Text>
      </View>

      <View style={styles.inputTile}>
        <Text style={styles.inputTileLabel}>REPS</Text>
        <TextInput
          style={styles.setInput}
          value={set.reps}
          onChangeText={onChangeReps}
          placeholder="—"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          returnKeyType="next"
          selectTextOnFocus
        />
      </View>

      <View style={styles.inputTile}>
        <Text style={styles.inputTileLabel}>WEIGHT</Text>
        <TextInput
          style={styles.setInput}
          value={set.weight}
          onChangeText={onChangeWeight}
          placeholder="lbs"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          returnKeyType="done"
          selectTextOnFocus
        />
      </View>

      {showDelete ? (
        <TouchableOpacity onPress={onDelete} style={styles.deleteSetBtn}>
          <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      ) : (
        <View style={styles.deleteSetBtn} />
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Cardio set row
// ---------------------------------------------------------------------------
function CardioSetRow({ setIndex, set, cardioType, onChangeDistance, onChangeDuration, onDelete, showDelete }) {
  const isSwim     = cardioType === 'swim'
  const isTimeOnly = cardioType === 'time_only'

  // Live pace for running (min/mile)
  let pace = null
  if (cardioType === 'run' && set.distance && set.duration) {
    const dist = parseFloat(set.distance)
    const mins = parseFloat(set.duration)
    if (dist > 0 && mins > 0) {
      const paceMin = Math.floor(mins / dist)
      const paceSec = Math.round(((mins / dist) - paceMin) * 60)
      pace = `${paceMin}:${String(paceSec).padStart(2, '0')}/mi`
    }
  }

  return (
    <View style={styles.setRow}>
      <View style={styles.setNumWrap}>
        <Text style={styles.setNum}>{setIndex + 1}</Text>
      </View>

      {!isTimeOnly && (
        <View style={styles.inputTile}>
          <Text style={styles.inputTileLabel}>{isSwim ? 'DIST (M)' : 'DIST (MI)'}</Text>
          <TextInput
            style={styles.setInput}
            value={set.distance}
            onChangeText={onChangeDistance}
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            returnKeyType="next"
            selectTextOnFocus
          />
        </View>
      )}

      <View style={styles.inputTile}>
        <Text style={styles.inputTileLabel}>TIME (MIN)</Text>
        <TextInput
          style={styles.setInput}
          value={set.duration}
          onChangeText={onChangeDuration}
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          returnKeyType="done"
          selectTextOnFocus
        />
      </View>

      {pace ? (
        <View style={[styles.inputTile, { backgroundColor: 'transparent', borderWidth: 0 }]}>
          <Text style={styles.inputTileLabel}>PACE</Text>
          <Text style={styles.paceValue}>{pace}</Text>
        </View>
      ) : (
        !isTimeOnly && <View style={{ flex: 1 }} />
      )}

      {showDelete ? (
        <TouchableOpacity onPress={onDelete} style={styles.deleteSetBtn}>
          <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      ) : (
        <View style={styles.deleteSetBtn} />
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function ExerciseLogScreen({ navigation, route }) {
  const { exerciseName, muscleGroup } = route.params

  const isCardio   = (muscleGroup || '').toLowerCase() === 'cardio'
  const cardioType = isCardio ? getCardioType(exerciseName) : null

  const [sets, setSets] = useState([isCardio ? makeCardioSet() : makeSet()])
  const [qSets,   setQSets]   = useState('')
  const [qReps,   setQReps]   = useState('')
  const [qWeight, setQWeight] = useState('')

  const updateSet = useCallback((idx, field, value) => {
    setSets((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)))
  }, [])

  const deleteSet = useCallback((idx) => {
    setSets((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  function handleApply() {
    const numSets = parseInt(qSets, 10)
    const reps    = qReps.trim()
    const weight  = qWeight.trim()
    if (!numSets || numSets < 1 || !reps || !weight) return
    setSets(Array.from({ length: numSets }, () => ({ weight, reps, id: Date.now() + Math.random() })))
    setQSets(''); setQReps(''); setQWeight('')
  }

  function handleDone() {
    route.params?.onExerciseSaved?.({ name: exerciseName, muscleGroup, sets })
    navigation.pop(2)
  }

  // Column header labels
  function renderColLabels() {
    if (!isCardio) {
      return (
        <View style={styles.colLabels}>
          <View style={styles.colLabelSetSlot} />
          <Text style={[styles.colLabel, { flex: 1, textAlign: 'center' }]}>REPS</Text>
          <Text style={[styles.colLabel, { flex: 1, textAlign: 'center' }]}>WEIGHT</Text>
          <View style={styles.colLabelDeleteSlot} />
        </View>
      )
    }
    if (cardioType === 'time_only') {
      return (
        <View style={styles.colLabels}>
          <View style={styles.colLabelSetSlot} />
          <Text style={[styles.colLabel, { flex: 1, textAlign: 'center' }]}>TIME (MIN)</Text>
          <View style={styles.colLabelDeleteSlot} />
        </View>
      )
    }
    return (
      <View style={styles.colLabels}>
        <View style={styles.colLabelSetSlot} />
        <Text style={[styles.colLabel, { flex: 1, textAlign: 'center' }]}>
          {cardioType === 'swim' ? 'DIST (M)' : 'DIST (MI)'}
        </Text>
        <Text style={[styles.colLabel, { flex: 1, textAlign: 'center' }]}>TIME (MIN)</Text>
        {(cardioType === 'run' || cardioType === 'cycle') && (
          <Text style={[styles.colLabel, { flex: 1, textAlign: 'center' }]}>PACE</Text>
        )}
        <View style={styles.colLabelDeleteSlot} />
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerSideBtn}>
            <Text style={styles.backArrow}>‹</Text>
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{exerciseName}</Text>
            <Text style={styles.headerSubtitle}>{muscleGroup}</Text>
          </View>

          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerSideBtn}>
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* SETS / + Add row header */}
          <View style={styles.setsHeaderRow}>
            <Text style={styles.setsLabel}>{isCardio ? 'INTERVALS' : 'SETS'}</Text>
            <TouchableOpacity onPress={() => setSets((prev) => [...prev, isCardio ? makeCardioSet() : makeSet()])}>
              <Text style={styles.addSetLink}>{isCardio ? '+ Add Interval' : '+ Add Set'}</Text>
            </TouchableOpacity>
          </View>

          {/* Quick-fill row — strength only */}
          {!isCardio && (
            <View style={styles.quickFillRow}>
              <TextInput
                style={styles.qfInput}
                value={qSets}
                onChangeText={setQSets}
                placeholder="sets"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                returnKeyType="next"
                selectTextOnFocus
              />
              <Text style={styles.qfSep}>×</Text>
              <TextInput
                style={styles.qfInput}
                value={qReps}
                onChangeText={setQReps}
                placeholder="reps"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                returnKeyType="next"
                selectTextOnFocus
              />
              <Text style={styles.qfSep}>@</Text>
              <TextInput
                style={[styles.qfInput, { flex: 1.4 }]}
                value={qWeight}
                onChangeText={setQWeight}
                placeholder="lbs"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={handleApply}
                selectTextOnFocus
              />
              <TouchableOpacity
                style={[styles.qfApplyBtn, (!qSets || !qReps || !qWeight) && styles.qfApplyBtnDisabled]}
                onPress={handleApply}
                activeOpacity={0.7}
              >
                <Text style={styles.qfApplyText}>Apply</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Column labels */}
          {renderColLabels()}

          {/* Set rows */}
          {sets.map((set, idx) =>
            isCardio ? (
              <CardioSetRow
                key={set.id}
                setIndex={idx}
                set={set}
                cardioType={cardioType}
                onChangeDistance={(val) => updateSet(idx, 'distance', val)}
                onChangeDuration={(val) => updateSet(idx, 'duration', val)}
                onDelete={() => deleteSet(idx)}
                showDelete={sets.length > 1}
              />
            ) : (
              <SetRow
                key={set.id}
                setIndex={idx}
                set={set}
                onChangeWeight={(val) => updateSet(idx, 'weight', val)}
                onChangeReps={(val) => updateSet(idx, 'reps', val)}
                onDelete={() => deleteSet(idx)}
                showDelete={sets.length > 1}
              />
            )
          )}
        </ScrollView>

        {/* Save CTA */}
        <View style={styles.ctaWrap}>
          <TouchableOpacity style={styles.saveBtn} onPress={handleDone} activeOpacity={0.85}>
            <Text style={styles.saveBtnText}>Save Exercise</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

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
  headerSideBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 28,
    color: colors.text,
    lineHeight: 32,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.lg,
    color: colors.text,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // Scroll
  scroll: { padding: spacing.md, paddingBottom: spacing.lg },

  // SETS / + Add Set header row
  setsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  setsLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  addSetLink: {
    fontFamily: 'Inter_500Medium',
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },

  // Quick-fill row
  quickFillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  qfInput: {
    flex: 1,
    height: 36,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.sm,
    color: colors.text,
    textAlign: 'center',
  },
  qfSep: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  qfApplyBtn: {
    backgroundColor: colors.bgDark,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  qfApplyBtnDisabled: { opacity: 0.35 },
  qfApplyText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.sm,
    color: colors.textLight,
  },

  // Column labels
  colLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  colLabelSetSlot:    { width: 32 + spacing.sm },
  colLabelDeleteSlot: { width: 32 + spacing.sm },
  colLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  // Set row
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  setNumWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setNum: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.sm,
    color: colors.text,
  },
  inputTile: {
    flex: 1,
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    alignItems: 'center',
  },
  inputTileLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  setInput: {
    width: '100%',
    height: 40,
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.lg,
    color: colors.text,
    textAlign: 'center',
    paddingHorizontal: spacing.xs,
  },
  paceValue: {
    height: 40,
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlignVertical: 'center',
    lineHeight: 40,
  },
  deleteSetBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Save CTA
  ctaWrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  saveBtn: {
    backgroundColor: colors.bgDark,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.md,
    color: colors.textLight,
    letterSpacing: -0.2,
  },
})
