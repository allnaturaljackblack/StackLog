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
  Dimensions,
  Modal,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, fonts, spacing, radius, fontSize } from '../../utils/theme'
import { supabase } from '../../lib/supabase'
import { saveWorkout } from '../../lib/workoutLog'

const { height: SCREEN_HEIGHT } = Dimensions.get('window')

// ---------------------------------------------------------------------------
// Auto-name a workout based on time of day + dominant muscle group pattern.
// ---------------------------------------------------------------------------
function generateWorkoutName(exercises, startedAt) {
  const hour = startedAt.getHours()
  let timeLabel
  if (hour >= 5 && hour < 12)       timeLabel = 'Morning'
  else if (hour >= 12 && hour < 17)  timeLabel = 'Afternoon'
  else if (hour >= 17 && hour < 21)  timeLabel = 'Evening'
  else                               timeLabel = 'Night'

  const groups = exercises.map(e => (e.muscleGroup || '').toLowerCase())
  const pushMuscles = ['chest', 'shoulders', 'triceps']
  const pullMuscles = ['back', 'biceps']

  const cardioCount = groups.filter(g => g === 'cardio').length
  const legsCount   = groups.filter(g => g === 'legs').length
  const coreCount   = groups.filter(g => g === 'core').length
  const pushCount   = groups.filter(g => pushMuscles.includes(g)).length
  const pullCount   = groups.filter(g => pullMuscles.includes(g)).length
  const total       = groups.length

  let typeLabel
  if (total === 0) {
    typeLabel = 'Workout'
  } else if (cardioCount === total) {
    typeLabel = 'Cardio'
  } else if (legsCount === total || legsCount + coreCount === total) {
    typeLabel = 'Leg Day'
  } else if (pushCount === total) {
    typeLabel = 'Push'
  } else if (pullCount === total) {
    typeLabel = 'Pull'
  } else if (pushCount + pullCount === total || pushCount + pullCount + coreCount === total) {
    typeLabel = 'Upper Body'
  } else if (coreCount === total) {
    typeLabel = 'Core'
  } else {
    typeLabel = 'Lift'
  }

  return `${timeLabel} ${typeLabel}`
}

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

function makeCardioSet() {
  return { distance: '', duration: '', id: Date.now() + Math.random() }
}

/**
 * Returns the cardio sub-type based on exercise name.
 * 'run'      → distance (mi) + time + auto pace
 * 'cycle'    → distance (mi) + time
 * 'swim'     → distance (m)  + time
 * 'time_only'→ time only (basketball, soccer, etc.)
 */
function getCardioType(exerciseName) {
  const n = (exerciseName || '').toLowerCase()
  if (/swim/.test(n))                              return 'swim'
  if (/run|jog|treadmill|walk|elliptical/.test(n)) return 'run'
  if (/cycl|bike|bicycle|spin/.test(n))            return 'cycle'
  return 'time_only'
}

function makeExercise(name, muscleGroup, supersetId = null) {
  const isCardio = (muscleGroup || '').toLowerCase() === 'cardio'
  return {
    id: Date.now() + Math.random(),
    name,
    muscleGroup,
    sets: [isCardio ? makeCardioSet() : makeSet()],
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

// ---------------------------------------------------------------------------
// Session summary panel (sticky bottom)
// ---------------------------------------------------------------------------
function isSetDone(set) {
  if ('duration' in set) return set.duration !== ''   // cardio
  return set.weight !== '' && set.reps !== ''          // strength
}

function setLabel(set, ex) {
  if ('duration' in set) {
    const ct = getCardioType(ex.name)
    const distPart = set.distance
      ? `${set.distance} ${ct === 'swim' ? 'm' : 'mi'} · `
      : ''
    return `${distPart}${set.duration} min`
  }
  return `${set.weight} lbs × ${set.reps}`
}

function SessionSummary({ exercises, open, onToggle }) {
  const loggedExercises = exercises.filter((ex) => ex.sets.some(isSetDone))
  const totalSets = loggedExercises.reduce(
    (sum, ex) => sum + ex.sets.filter(isSetDone).length,
    0
  )

  return (
    <View style={summaryStyles.container}>
      <TouchableOpacity style={summaryStyles.bar} onPress={onToggle} activeOpacity={0.8}>
        <Text style={summaryStyles.barText}>
          {'💪 '}
          <Text style={summaryStyles.barCount}>{loggedExercises.length}</Text>
          {` exercise${loggedExercises.length !== 1 ? 's' : ''} · `}
          <Text style={summaryStyles.barCount}>{totalSets}</Text>
          {` set${totalSets !== 1 ? 's' : ''} logged`}
        </Text>
        <Text style={summaryStyles.barChevron}>{open ? '▼' : '▲'}</Text>
      </TouchableOpacity>

      {open && (
        <ScrollView
          style={summaryStyles.sheet}
          contentContainerStyle={summaryStyles.sheetContent}
          keyboardShouldPersistTaps="handled"
        >
          {loggedExercises.length === 0 ? (
            <Text style={summaryStyles.emptyText}>No sets logged yet</Text>
          ) : (
            loggedExercises.map((ex) => {
              const doneSets = ex.sets.filter(isSetDone)
              return (
                <View key={ex.id} style={summaryStyles.exBlock}>
                  <Text style={summaryStyles.exName}>{ex.name}</Text>
                  {doneSets.map((s, i) => (
                    <Text key={s.id} style={summaryStyles.setLine}>
                      {`${i + 1}  ·  ${setLabel(s, ex)}`}
                    </Text>
                  ))}
                </View>
              )
            })
          )}
        </ScrollView>
      )}
    </View>
  )
}

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
          placeholderTextColor={colors.textMuted}
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
          placeholderTextColor={colors.textMuted}
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
// Cardio set row
// ---------------------------------------------------------------------------
function CardioSetRow({ setIndex, set, cardioType, onChangeDistance, onChangeDuration, onDelete, showDelete }) {
  const isSwim     = cardioType === 'swim'
  const isTimeOnly = cardioType === 'time_only'

  // Auto-calculate pace for running (min/mile)
  const pace = (!isSwim && !isTimeOnly && set.distance && set.duration)
    ? (() => {
        const dist = parseFloat(set.distance)
        const dur  = parseFloat(set.duration)
        if (!dist || !dur) return null
        const paceMin    = dur / dist
        const paceMinInt = Math.floor(paceMin)
        const paceSec    = Math.round((paceMin - paceMinInt) * 60)
        return `${paceMinInt}:${paceSec.toString().padStart(2, '0')}/mi`
      })()
    : null

  return (
    <View style={styles.setRow}>
      <View style={styles.setNumWrap}>
        <Text style={styles.setNum}>{setIndex + 1}</Text>
      </View>
      <View style={styles.inputGroup}>
        {!isTimeOnly && (
          <>
            <TextInput
              style={[styles.setInput, { flex: 1.4 }]}
              value={set.distance}
              onChangeText={onChangeDistance}
              placeholder={isSwim ? 'm' : 'mi'}
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              returnKeyType="next"
              selectTextOnFocus
            />
            <Text style={styles.inputSep}>·</Text>
          </>
        )}
        <TextInput
          style={[styles.setInput, { flex: 1.4 }]}
          value={set.duration}
          onChangeText={onChangeDuration}
          placeholder="min"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          returnKeyType="done"
          selectTextOnFocus
        />
        {pace ? (
          <Text style={styles.cardioPaceText}>{pace}</Text>
        ) : (
          !isTimeOnly && <View style={{ flex: 1 }} />
        )}
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
  onQuickFill,
  onAddSuperset,   // present only on solo cards
  topRadius = true,
  bottomRadius = true,
}) {
  const [qSets, setQSets] = useState('')
  const [qReps, setQReps] = useState('')
  const [qWeight, setQWeight] = useState('')

  const isCardio   = (exercise.muscleGroup || '').toLowerCase() === 'cardio'
  const cardioType = isCardio ? getCardioType(exercise.name) : null

  function handleApply() {
    const numSets = parseInt(qSets, 10)
    const reps = qReps.trim()
    const weight = qWeight.trim()
    if (!numSets || numSets < 1 || !reps || !weight) return
    onQuickFill(numSets, reps, weight)
    setQSets('')
    setQReps('')
    setQWeight('')
  }

  // Column labels differ per exercise type
  function renderColLabels() {
    if (!isCardio) {
      return (
        <View style={styles.colLabels}>
          <Text style={[styles.colLabel, { width: 32 }]}>SET</Text>
          <Text style={[styles.colLabel, { flex: 1, textAlign: 'center' }]}>WEIGHT (LBS)</Text>
          <Text style={[styles.colLabel, { flex: 1, textAlign: 'center' }]}>REPS</Text>
        </View>
      )
    }
    if (cardioType === 'time_only') {
      return (
        <View style={styles.colLabels}>
          <Text style={[styles.colLabel, { width: 32 }]}>INT</Text>
          <Text style={[styles.colLabel, { flex: 1, textAlign: 'center' }]}>TIME (MIN)</Text>
        </View>
      )
    }
    const distLabel = cardioType === 'swim' ? 'DISTANCE (M)' : 'DISTANCE (MI)'
    const thirdCol  = (cardioType === 'run' || cardioType === 'cycle') ? 'TIME (MIN)' : 'TIME (MIN)'
    return (
      <View style={styles.colLabels}>
        <Text style={[styles.colLabel, { width: 32 }]}>INT</Text>
        <Text style={[styles.colLabel, { flex: 1.4, textAlign: 'center' }]}>{distLabel}</Text>
        <Text style={[styles.colLabel, { flex: 0.2, textAlign: 'center' }]}> </Text>
        <Text style={[styles.colLabel, { flex: 1.4, textAlign: 'center' }]}>{thirdCol}</Text>
        {(cardioType === 'run' || cardioType === 'cycle') && (
          <Text style={[styles.colLabel, { flex: 1, textAlign: 'center' }]}>PACE</Text>
        )}
      </View>
    )
  }

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
            style={[
              styles.qfApplyBtn,
              (!qSets || !qReps || !qWeight) && styles.qfApplyBtnDisabled,
            ]}
            onPress={handleApply}
            activeOpacity={0.7}
          >
            <Text style={styles.qfApplyText}>Apply</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Column labels */}
      {renderColLabels()}

      {/* Sets */}
      {exercise.sets.map((set, idx) =>
        isCardio ? (
          <CardioSetRow
            key={set.id}
            setIndex={idx}
            set={set}
            cardioType={cardioType}
            onChangeDistance={(val) => onUpdateSet(idx, 'distance', val)}
            onChangeDuration={(val) => onUpdateSet(idx, 'duration', val)}
            onDelete={() => onDeleteSet(idx)}
            showDelete={exercise.sets.length > 1}
          />
        ) : (
          <SetRow
            key={set.id}
            setIndex={idx}
            set={set}
            onChangeWeight={(val) => onUpdateSet(idx, 'weight', val)}
            onChangeReps={(val) => onUpdateSet(idx, 'reps', val)}
            onDelete={() => onDeleteSet(idx)}
            showDelete={exercise.sets.length > 1}
          />
        )
      )}

      {/* Add set / interval */}
      <TouchableOpacity style={styles.addSetBtn} onPress={onAddSet}>
        <Text style={styles.addSetText}>{isCardio ? '+ Add Interval' : '+ Add Set'}</Text>
      </TouchableOpacity>

      {/* Superset CTA — only on solo cards, not cardio */}
      {onAddSuperset && !isCardio && (
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
  onQuickFill,
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
                onQuickFill={(numSets, reps, weight) => onQuickFill(ex.id, numSets, reps, weight)}
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
// RenameSheet — lightweight mid-workout rename
// ---------------------------------------------------------------------------
function RenameSheet({ visible, currentName, onRename, onClose }) {
  const [draft, setDraft] = useState(currentName)

  useEffect(() => {
    if (visible) setDraft(currentName)
  }, [visible, currentName])

  function commit() {
    onRename(draft.trim() || currentName)
    onClose()
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity
          style={rnStyles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={rnStyles.sheet}>
          <View style={rnStyles.handle} />
          <Text style={rnStyles.title}>Rename Workout</Text>
          <TextInput
            style={rnStyles.input}
            value={draft}
            onChangeText={setDraft}
            autoFocus
            selectTextOnFocus
            returnKeyType="done"
            onSubmitEditing={commit}
            placeholderTextColor={colors.textMuted}
          />
          <View style={rnStyles.btnRow}>
            <TouchableOpacity onPress={onClose} style={rnStyles.cancelBtn} activeOpacity={0.7}>
              <Text style={rnStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={commit} style={rnStyles.doneBtn} activeOpacity={0.85}>
              <Text style={rnStyles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// SaveSheet — Strava-style save summary shown before committing
// ---------------------------------------------------------------------------
function SaveSheet({ visible, initialName, exercises, elapsed, onSave, onDismiss, saving }) {
  const [name, setName] = useState(initialName)
  const [calStrength, setCalStrength] = useState('')
  const [calCardio, setCalCardio] = useState({})
  const [calOverride, setCalOverride] = useState('')

  useEffect(() => {
    if (visible) {
      setName(initialName)
      setCalStrength('')
      setCalCardio({})
      setCalOverride('')
    }
  }, [visible, initialName])

  const loggedExercises = exercises.filter((ex) => ex.sets.some(isSetDone))
  const cardioExercises = loggedExercises.filter(
    (ex) => (ex.muscleGroup || '').toLowerCase() === 'cardio'
  )
  const hasStrength = loggedExercises.some(
    (ex) => (ex.muscleGroup || '').toLowerCase() !== 'cardio'
  )

  const totalSets = loggedExercises.reduce(
    (sum, ex) => sum + ex.sets.filter(isSetDone).length,
    0
  )
  const totalVolume = loggedExercises.reduce((sum, ex) => {
    if ((ex.muscleGroup || '').toLowerCase() === 'cardio') return sum
    return (
      sum +
      ex.sets
        .filter(isSetDone)
        .reduce((s2, s) => s2 + parseFloat(s.weight || 0) * parseInt(s.reps || 0, 10), 0)
    )
  }, 0)
  const volDisplay =
    totalVolume >= 1000
      ? `${(totalVolume / 1000).toFixed(1)}k`
      : String(Math.round(totalVolume))

  // Compute the calories number that will be saved
  const finalCalories = (() => {
    const ovr = parseInt(calOverride, 10)
    if (!isNaN(ovr) && ovr > 0) return ovr
    const sc = parseInt(calStrength, 10) || 0
    const cc = Object.values(calCardio).reduce((s, v) => s + (parseInt(v, 10) || 0), 0)
    const total = sc + cc
    return total > 0 ? total : null
  })()

  const stats = [
    { label: 'Duration',  value: formatDuration(elapsed) },
    { label: 'Exercises', value: String(loggedExercises.length) },
    { label: 'Sets',      value: String(totalSets) },
    { label: 'Vol (lbs)', value: volDisplay },
  ]

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={ssStyles.backdrop} activeOpacity={1} onPress={onDismiss} />
        <ScrollView
          style={ssStyles.sheet}
          contentContainerStyle={ssStyles.sheetContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={ssStyles.handle} />
          <Text style={ssStyles.sheetTitle}>Save Workout</Text>

          {/* Editable name */}
          <TextInput
            style={ssStyles.nameInput}
            value={name}
            onChangeText={setName}
            placeholder="Workout name"
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            selectTextOnFocus
          />

          {/* Stats */}
          <View style={ssStyles.statsRow}>
            {stats.map((s, i) => (
              <View key={s.label} style={ssStyles.statItem}>
                <Text style={ssStyles.statValue}>{s.value}</Text>
                <Text style={ssStyles.statLabel}>{s.label}</Text>
                {i < stats.length - 1 && <View style={ssStyles.statDivider} />}
              </View>
            ))}
          </View>

          {/* Calories Burned section */}
          {loggedExercises.length > 0 && (
            <View style={ssStyles.calsSection}>
              <Text style={ssStyles.calsSectionTitle}>
                CALORIES BURNED{' '}
                <Text style={ssStyles.calsSectionOpt}>(optional)</Text>
              </Text>

              {/* Strength subtotal */}
              {hasStrength && (
                <View style={ssStyles.calRow}>
                  <Ionicons name="barbell-outline" size={14} color={colors.textMuted} />
                  <Text style={ssStyles.calRowLabel}>Strength (all lifts)</Text>
                  <View style={ssStyles.calInputWrap}>
                    <TextInput
                      style={ssStyles.calInput}
                      value={calStrength}
                      onChangeText={setCalStrength}
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="number-pad"
                      returnKeyType="done"
                      selectTextOnFocus
                    />
                    <Text style={ssStyles.calUnit}>cal</Text>
                  </View>
                </View>
              )}

              {/* Per-cardio-exercise rows */}
              {cardioExercises.map((ex) => (
                <View key={ex.id} style={ssStyles.calRow}>
                  <Ionicons name="flame-outline" size={14} color={colors.textMuted} />
                  <Text style={ssStyles.calRowLabel} numberOfLines={1}>{ex.name}</Text>
                  <View style={ssStyles.calInputWrap}>
                    <TextInput
                      style={ssStyles.calInput}
                      value={calCardio[ex.name] || ''}
                      onChangeText={(v) => setCalCardio((prev) => ({ ...prev, [ex.name]: v }))}
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="number-pad"
                      returnKeyType="done"
                      selectTextOnFocus
                    />
                    <Text style={ssStyles.calUnit}>cal</Text>
                  </View>
                </View>
              ))}

              {/* Override total */}
              <View style={[ssStyles.calRow, ssStyles.calOverrideRow]}>
                <Ionicons name="flash-outline" size={14} color={colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={ssStyles.calRowLabel}>Total (override all)</Text>
                  <Text style={ssStyles.calOverrideHint}>Replaces individual entries above</Text>
                </View>
                <View style={ssStyles.calInputWrap}>
                  <TextInput
                    style={ssStyles.calInput}
                    value={calOverride}
                    onChangeText={setCalOverride}
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    selectTextOnFocus
                  />
                  <Text style={ssStyles.calUnit}>cal</Text>
                </View>
              </View>

              {finalCalories > 0 && (
                <Text style={ssStyles.calsTotalPreview}>🔥 {finalCalories} cal will be logged</Text>
              )}
            </View>
          )}

          {/* Save CTA */}
          <TouchableOpacity
            style={[ssStyles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={() => onSave(name.trim() || 'Workout', finalCalories)}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Text style={ssStyles.saveBtnText}>{saving ? 'Saving…' : 'Save Workout'}</Text>
          </TouchableOpacity>

          {/* Keep going */}
          <TouchableOpacity onPress={onDismiss} style={ssStyles.keepGoingBtn} activeOpacity={0.7}>
            <Text style={ssStyles.keepGoingText}>Keep Going</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function WorkoutLogScreen({ navigation, route }) {
  const [exercises, setExercises] = useState([])
  const [startedAt] = useState(() => {
    const logDate = route.params?.logDate
    if (logDate) {
      const now = new Date()
      const timeStr = now.toTimeString().slice(0, 8)
      return new Date(`${logDate}T${timeStr}`)
    }
    return new Date()
  })
  const [elapsed, setElapsed] = useState(0)
  const [saving, setSaving] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [workoutName, setWorkoutName] = useState(() => generateWorkoutName([], new Date()))
  const [nameEdited, setNameEdited] = useState(false)
  const [showSaveSheet, setShowSaveSheet] = useState(false)
  const [showRenameSheet, setShowRenameSheet] = useState(false)
  const timerRef = useRef(null)

  // Auto-update name whenever exercises change — unless user has renamed manually
  useEffect(() => {
    if (!nameEdited) {
      setWorkoutName(generateWorkoutName(exercises, startedAt))
    }
  }, [exercises, nameEdited, startedAt])

  // Timer
  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(timerRef.current)
  }, [])

  // Stable callback passed to WorkoutSearch → ExerciseLog via navigation params.
  // Uses functional setExercises so there are no stale-closure issues even if the
  // component has already re-rendered between navigation calls.
  const onExerciseSaved = useCallback(({ name, muscleGroup, supersetWithExId, sets }) => {
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

      // Normal append — use pre-filled sets if provided (from ExerciseLogScreen)
      const newEx = {
        id: Date.now() + Math.random(),
        name,
        muscleGroup,
        sets: sets && sets.length > 0 ? sets : [makeSet()],
        supersetId: null,
      }
      return [...prev, newEx]
    })
  }, [])

  // ---- Mutators ----

  const addSet = useCallback((exId) => {
    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exId) return ex
        const isCardio = (ex.muscleGroup || '').toLowerCase() === 'cardio'
        return { ...ex, sets: [...ex.sets, isCardio ? makeCardioSet() : makeSet()] }
      })
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

  const quickFillSets = useCallback((exId, numSets, reps, weight) => {
    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exId) return ex
        const sets = Array.from({ length: numSets }, () => ({
          weight,
          reps,
          id: Date.now() + Math.random(),
        }))
        return { ...ex, sets }
      })
    )
  }, [])

  // ---- Save flow ----

  // "Finish" validates then opens the save sheet
  function handleFinish() {
    if (exercises.length === 0) {
      Alert.alert('No exercises', 'Add at least one exercise before finishing.')
      return
    }
    const totalSets = exercises.reduce(
      (sum, ex) => sum + ex.sets.filter(isSetDone).length,
      0
    )
    if (totalSets === 0) {
      Alert.alert('No sets logged', 'Log at least one set before finishing.')
      return
    }
    setShowSaveSheet(true)
  }

  // Called by SaveSheet with the final chosen name + optional calories
  async function handleSave(finalName, caloriesBurned) {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await saveWorkout({
        userId: user.id,
        startedAt: startedAt.toISOString(),
        exercises,
        name: finalName,
        caloriesBurned: caloriesBurned || null,
      })
      navigation.getParent()?.goBack()
    } catch (err) {
      console.error('Error saving workout:', err)
      Alert.alert('Error', 'Could not save workout. Please try again.')
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

          {/* Tappable workout name */}
          <TouchableOpacity
            style={styles.headerCenter}
            onPress={() => setShowRenameSheet(true)}
            activeOpacity={0.7}
          >
            <View style={styles.headerNameRow}>
              <Text style={styles.headerTitle} numberOfLines={1}>{workoutName}</Text>
              <Ionicons name="pencil" size={12} color={colors.textMuted} style={styles.pencilIcon} />
            </View>
            <Text style={styles.timer}>{formatDuration(elapsed)}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleFinish}
            style={styles.finishBtn}
            activeOpacity={0.85}
          >
            <Text style={styles.finishBtnText}>Finish</Text>
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
                    onQuickFill={(numSets, reps, weight) => quickFillSets(ex.id, numSets, reps, weight)}
                    onAddSuperset={() =>
                      navigation.navigate('WorkoutSearch', { supersetWithExId: ex.id, onExerciseSaved })
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
                  onQuickFill={quickFillSets}
                  onAddToSuperset={() =>
                    navigation.navigate('WorkoutSearch', {
                      supersetWithExId: group.exercises[group.exercises.length - 1].id,
                      onExerciseSaved,
                    })
                  }
                  onBreakSuperset={() => breakSuperset(group.supersetId)}
                />
              )
            })
          )}

          <TouchableOpacity
            style={styles.addExerciseBtn}
            onPress={() => navigation.navigate('WorkoutSearch', { onExerciseSaved })}
            activeOpacity={0.8}
          >
            <Text style={styles.addExerciseText}>+ Add Exercise</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Session summary — docked above keyboard */}
        <SessionSummary
          exercises={exercises}
          open={summaryOpen}
          onToggle={() => setSummaryOpen((v) => !v)}
        />
      </KeyboardAvoidingView>

      {/* Mid-workout rename sheet */}
      <RenameSheet
        visible={showRenameSheet}
        currentName={workoutName}
        onRename={(name) => { setWorkoutName(name); setNameEdited(true) }}
        onClose={() => setShowRenameSheet(false)}
      />

      {/* Save summary sheet */}
      <SaveSheet
        visible={showSaveSheet}
        initialName={workoutName}
        exercises={exercises}
        elapsed={elapsed}
        onSave={handleSave}
        onDismiss={() => setShowSaveSheet(false)}
        saving={saving}
      />
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
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.xs },
  headerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 200,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.lg,
    letterSpacing: -0.3,
    color: colors.text,
    flexShrink: 1,
  },
  pencilIcon: {
    marginTop: 1,
  },
  timer: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    letterSpacing: 1,
    marginTop: 2,
  },
  finishBtn: {
    width: 72,
    backgroundColor: colors.bgDark,
    borderRadius: radius.md,
    paddingVertical: 8,
    alignItems: 'center',
  },
  finishBtnText: {
    fontFamily: 'Inter_700Bold',
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
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.xxl,
    color: colors.text,
    letterSpacing: -0.3,
  },
  emptyBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },

  // Exercise card — white with border
  exerciseCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm },
  exerciseName: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.lg,
    color: colors.text,
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  muscleTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  muscleTagText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  removeExerciseBtn: { padding: spacing.xs },
  removeExerciseIcon: { fontSize: 16 },

  // Quick-fill row
  quickFillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  qfInput: {
    flex: 1,
    height: 34,
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
  qfApplyBtnDisabled: {
    opacity: 0.35,
  },
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
    paddingLeft: 32 + spacing.sm,
  },
  colLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 0.8,
  },

  // Set row
  setRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
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
    fontSize: fontSize.md,
    color: colors.text,
  },
  inputGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  setInput: {
    flex: 1,
    height: 40,
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.md,
    color: colors.text,
    textAlign: 'center',
  },
  inputSep: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  deleteSetBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  deleteSetIcon: { fontSize: 12, color: colors.textMuted },
  cardioPaceText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center' },

  // Add set / superset
  addSetBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderStyle: 'dashed',
  },
  addSetText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.md,
    color: colors.textSecondary,
    letterSpacing: -0.2,
  },
  addSupersetBtn: {
    marginTop: spacing.xs,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  addSupersetText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: fontSize.sm,
    color: colors.textMuted,
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
    backgroundColor: colors.bgDark,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  ssBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.xs,
    color: colors.textLight,
    letterSpacing: 1,
  },
  ssBreakText: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  ssBody: { flexDirection: 'row', gap: spacing.xs },
  ssAccentBar: { width: 3, backgroundColor: colors.bgDark, borderRadius: radius.full },
  // SS connector between stacked cards
  ssConnector: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 20,
    paddingHorizontal: spacing.sm,
  },
  ssConnectorLine: { flex: 1, height: 1, backgroundColor: colors.border },
  ssConnectorPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.full,
  },
  ssConnectorPillText: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  ssAddBtn: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderStyle: 'dashed',
  },
  ssAddText: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.md,
    color: colors.textSecondary,
    letterSpacing: -0.1,
  },

  // Add exercise CTA
  addExerciseBtn: {
    backgroundColor: colors.bgDark,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  addExerciseText: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.lg,
    color: colors.textLight,
    letterSpacing: -0.2,
  },
})

// ---------------------------------------------------------------------------
// RenameSheet styles
// ---------------------------------------------------------------------------
const rnStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
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
    fontSize: fontSize.lg,
    color: colors.text,
    marginBottom: spacing.md,
    letterSpacing: -0.2,
  },
  input: {
    height: 50,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
    marginBottom: spacing.md,
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
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
  doneBtn: {
    flex: 1,
    height: 48,
    backgroundColor: colors.bgDark,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.md,
    color: colors.textLight,
  },
})

// ---------------------------------------------------------------------------
// SaveSheet styles
// ---------------------------------------------------------------------------
const ssStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
  },
  sheetContent: {
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
  sheetTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xl,
    color: colors.text,
    letterSpacing: -0.3,
    marginBottom: spacing.md,
  },

  // Editable name
  nameInput: {
    height: 54,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    color: colors.text,
    marginBottom: spacing.md,
    letterSpacing: -0.2,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  statValue: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xl,
    color: colors.text,
    letterSpacing: -0.3,
    lineHeight: 26,
  },
  statLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  statDivider: {
    position: 'absolute',
    right: 0,
    top: '10%',
    height: '80%',
    width: 1,
    backgroundColor: colors.border,
  },

  // Save CTA
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

  // Keep going link
  keepGoingBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  keepGoingText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },

  // Calories burned section
  calsSection: {
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    gap: 2,
  },
  calsSectionTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  calsSectionOpt: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: 'none',
    letterSpacing: 0,
  },
  calRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  calOverrideRow: {
    borderBottomWidth: 0,
    paddingTop: spacing.sm,
    marginTop: 4,
  },
  calRowLabel: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  calInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  calInput: {
    width: 64,
    height: 34,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
    textAlign: 'center',
  },
  calUnit: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    width: 22,
  },
  calOverrideHint: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 1,
  },
  calsTotalPreview: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'right',
    paddingTop: spacing.xs,
  },
})

// ---------------------------------------------------------------------------
// Session summary styles — keep dark background, it stands out well
// ---------------------------------------------------------------------------
const summaryStyles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: colors.bgDark,
  },
  bar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  barText: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.6)',
  },
  barCount: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.md,
    color: colors.textLight,
  },
  barChevron: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  sheet: {
    maxHeight: SCREEN_HEIGHT * 0.38,
  },
  sheetContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  emptyText: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  exBlock: {
    gap: 3,
  },
  exName: {
    fontFamily: 'Inter_700Bold',
    fontSize: fontSize.md,
    color: colors.textLight,
    letterSpacing: -0.1,
    marginBottom: 2,
  },
  setLine: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.5)',
    paddingLeft: spacing.sm,
  },
})
