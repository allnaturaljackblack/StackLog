/**
 * GoalSetupModal — 4-step goal wizard
 *
 * Step 1  — Goal type selection (everyone)
 * Step 2  — Current stats: weight, height, age, sex, activity level
 *           (always asked fresh so calculations stay accurate over time)
 * Step 3  — Target weight + timeline  (lose_weight / gain_weight only)
 * Step 4  — Review & edit the full plan (calories, macros, water, workouts)
 *
 * On save: updates both current body stats AND goal columns on `profiles`.
 *
 * Required Supabase columns on `profiles`:
 *   goal_type             text
 *   goal_target_weight_kg float8
 *   goal_timeline_weeks   int4
 *   goal_calories         int4
 *   goal_protein_g        int4
 *   goal_carbs_g          int4
 *   goal_fat_g            int4
 *   goal_water_ml         int4
 *   goal_workouts_per_week int4
 */
import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, Modal,
  StyleSheet, ScrollView, SafeAreaView,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { colors, fonts, fontSize, spacing, radius } from '../utils/theme'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const KG_TO_LBS = 2.20462
const LBS_TO_KG = 0.453592

const GOAL_OPTIONS = [
  { key: 'lose_weight', label: 'Lose Weight',  icon: 'trending-down-outline', desc: 'Calorie deficit · burn fat'     },
  { key: 'gain_muscle', label: 'Build Muscle', icon: 'barbell-outline',       desc: 'Lean bulk · high protein'       },
  { key: 'gain_weight', label: 'Gain Weight',  icon: 'trending-up-outline',   desc: 'Calorie surplus · add size'     },
  { key: 'maintain',    label: 'Maintain',     icon: 'remove-outline',        desc: 'Keep your current weight'       },
]

const TIMELINE_OPTIONS = [
  { label: '8 wks',  weeks: 8  },
  { label: '12 wks', weeks: 12 },
  { label: '16 wks', weeks: 16 },
  { label: '6 mo',   weeks: 24 },
  { label: '1 yr',   weeks: 52 },
]

const WATER_OPTIONS = [
  { label: '1.5L', ml: 1500 },
  { label: '2L',   ml: 2000 },
  { label: '2.5L', ml: 2500 },
  { label: '3L',   ml: 3000 },
  { label: '3.5L', ml: 3500 },
]

const GENDER_OPTIONS = [
  { key: 'male',   label: 'Male'   },
  { key: 'female', label: 'Female' },
  { key: 'other',  label: 'Other'  },
]

const ACTIVITY_OPTIONS = [
  { key: 'sedentary',   label: 'Sedentary',   desc: 'Little or no exercise'      },
  { key: 'light',       label: 'Light',       desc: '1–3 days / week'            },
  { key: 'moderate',    label: 'Moderate',    desc: '3–5 days / week'            },
  { key: 'active',      label: 'Active',      desc: '6–7 days / week'            },
  { key: 'very_active', label: 'Very Active', desc: 'Hard daily exercise + job'  },
]

// ---------------------------------------------------------------------------
// TDEE + goal-adjusted calorie / macro calculator
// Takes individual params (not a profile object) so values are always fresh.
// ---------------------------------------------------------------------------
function computeRecommendations(
  weightKg, heightCm, age, gender, activityLevel,
  goalType, targetWeightLbs, timelineWeeks,
) {
  if (!weightKg || !heightCm || !age) return null

  const bmrMale   = 10 * weightKg + 6.25 * heightCm - 5 * age + 5
  const bmrFemale = 10 * weightKg + 6.25 * heightCm - 5 * age - 161
  const bmr =
    gender === 'male'   ? bmrMale :
    gender === 'female' ? bmrFemale :
    (bmrMale + bmrFemale) / 2

  const activityMultipliers = {
    sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
  }
  const tdee = Math.round(bmr * (activityMultipliers[activityLevel] || 1.375))

  let calAdjustment = 0
  let weeklyRateLbs = null
  let proteinPerKg  = 1.8
  let carbsFraction = 0.45
  let fatFraction   = 0.27

  if (goalType === 'lose_weight') {
    const targetKg = targetWeightLbs ? parseFloat(targetWeightLbs) * LBS_TO_KG : null
    if (targetKg && timelineWeeks > 0) {
      const kgToLose = Math.max(weightKg - targetKg, 0.5)
      const daily    = (kgToLose * 7700) / (timelineWeeks * 7)
      calAdjustment  = -Math.min(Math.round(daily / 50) * 50, 1000)
      weeklyRateLbs  = ((kgToLose / timelineWeeks) * KG_TO_LBS).toFixed(1)
    } else {
      calAdjustment = -500
    }
    proteinPerKg  = 2.2
    carbsFraction = 0.38
    fatFraction   = 0.28

  } else if (goalType === 'gain_weight') {
    const targetKg = targetWeightLbs ? parseFloat(targetWeightLbs) * LBS_TO_KG : null
    if (targetKg && timelineWeeks > 0) {
      const kgToGain = Math.max(targetKg - weightKg, 0.5)
      const daily    = (kgToGain * 7700) / (timelineWeeks * 7)
      calAdjustment  = Math.min(Math.round(daily / 50) * 50, 600)
      weeklyRateLbs  = ((kgToGain / timelineWeeks) * KG_TO_LBS).toFixed(1)
    } else {
      calAdjustment = 400
    }
    proteinPerKg  = 1.9
    carbsFraction = 0.50
    fatFraction   = 0.25

  } else if (goalType === 'gain_muscle') {
    calAdjustment = 250
    proteinPerKg  = 2.2
    carbsFraction = 0.45
    fatFraction   = 0.22

  } else { // maintain
    calAdjustment = 0
    proteinPerKg  = 1.8
    carbsFraction = 0.48
    fatFraction   = 0.27
  }

  const calories  = Math.max(Math.round((tdee + calAdjustment) / 50) * 50, 1200)
  const protein_g = Math.round(weightKg * proteinPerKg)
  const remaining = Math.max(calories - protein_g * 4, 0)
  const carbs_g   = Math.round((remaining * carbsFraction) / 4)
  const fat_g     = Math.round((remaining * fatFraction)   / 9)

  return { tdee, calories, protein_g, carbs_g, fat_g, calAdjustment, weeklyRateLbs }
}

// ---------------------------------------------------------------------------
// Step 1 — Goal type
// ---------------------------------------------------------------------------
function Step1({ selectedGoal, onSelect, onNext }) {
  return (
    <View style={st.stepContent}>
      <Text style={st.stepTitle}>What's your main goal?</Text>
      <Text style={st.stepSubtitle}>We'll build your personalised plan around this.</Text>

      <View style={st.goalGrid}>
        {GOAL_OPTIONS.map(opt => {
          const active = selectedGoal === opt.key
          return (
            <TouchableOpacity
              key={opt.key}
              style={[st.goalTile, active && st.goalTileActive]}
              onPress={() => onSelect(opt.key)}
              activeOpacity={0.7}
            >
              <Ionicons name={opt.icon} size={26} color={active ? colors.textLight : colors.text} />
              <Text style={[st.goalTileLabel, active && st.goalTileLabelActive]}>{opt.label}</Text>
              <Text style={[st.goalTileDesc,  active && st.goalTileDescActive]}>{opt.desc}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <TouchableOpacity
        style={[st.primaryBtn, !selectedGoal && st.primaryBtnDisabled]}
        onPress={onNext}
        disabled={!selectedGoal}
        activeOpacity={0.85}
      >
        <Text style={st.primaryBtnText}>Continue</Text>
      </TouchableOpacity>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Step 2 — Current stats
// ---------------------------------------------------------------------------
function Step2Stats({
  currentWeightLbs, setCurrentWeightLbs,
  heightFt, setHeightFt,
  heightIn, setHeightIn,
  age, setAge,
  gender, setGender,
  activityLevel, setActivityLevel,
  onNext, onBack,
}) {
  const valid =
    parseFloat(currentWeightLbs) > 0 &&
    (parseInt(heightFt, 10) > 0 || parseInt(heightIn, 10) > 0) &&
    parseInt(age, 10) > 0 && parseInt(age, 10) < 120 &&
    !!gender &&
    !!activityLevel

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={st.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={st.stepTitle}>Your current stats</Text>
      <Text style={st.stepSubtitleSpaced}>
        We use these to calculate your personal TDEE and calorie target. Update any time.
      </Text>

      {/* Current weight */}
      <View style={st.planCard}>
        <Text style={st.planCardLabel}>CURRENT WEIGHT</Text>
        <View style={st.inlineInputRow}>
          <TextInput
            style={st.inlineInput}
            value={currentWeightLbs}
            onChangeText={setCurrentWeightLbs}
            keyboardType="decimal-pad"
            placeholder="165"
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            selectTextOnFocus
          />
          <Text style={st.inlineUnit}>lbs</Text>
        </View>
      </View>

      {/* Height */}
      <View style={st.planCard}>
        <Text style={st.planCardLabel}>HEIGHT</Text>
        <View style={st.heightRow}>
          <View style={st.heightGroup}>
            <TextInput
              style={st.heightInput}
              value={heightFt}
              onChangeText={v => setHeightFt(v.replace(/\D/g, ''))}
              keyboardType="number-pad"
              placeholder="5"
              placeholderTextColor={colors.textMuted}
              returnKeyType="next"
              selectTextOnFocus
              maxLength={1}
            />
            <Text style={st.heightUnit}>ft</Text>
          </View>
          <View style={st.heightGroup}>
            <TextInput
              style={st.heightInput}
              value={heightIn}
              onChangeText={v => setHeightIn(v.replace(/\D/g, ''))}
              keyboardType="number-pad"
              placeholder="10"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              selectTextOnFocus
              maxLength={2}
            />
            <Text style={st.heightUnit}>in</Text>
          </View>
        </View>
      </View>

      {/* Age */}
      <View style={st.planCard}>
        <Text style={st.planCardLabel}>AGE</Text>
        <View style={st.inlineInputRow}>
          <TextInput
            style={st.inlineInput}
            value={age}
            onChangeText={v => setAge(v.replace(/\D/g, ''))}
            keyboardType="number-pad"
            placeholder="28"
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            selectTextOnFocus
            maxLength={3}
          />
          <Text style={st.inlineUnit}>yrs</Text>
        </View>
      </View>

      {/* Biological sex */}
      <View style={st.planCard}>
        <Text style={st.planCardLabel}>BIOLOGICAL SEX</Text>
        <View style={st.chipRow}>
          {GENDER_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[st.chip, gender === opt.key && st.chipActive]}
              onPress={() => setGender(opt.key)}
              activeOpacity={0.7}
            >
              <Text style={[st.chipText, gender === opt.key && st.chipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Activity level */}
      <View style={st.planCard}>
        <Text style={st.planCardLabel}>ACTIVITY LEVEL</Text>
        <View style={st.activityList}>
          {ACTIVITY_OPTIONS.map(opt => {
            const active = activityLevel === opt.key
            return (
              <TouchableOpacity
                key={opt.key}
                style={[st.activityRow, active && st.activityRowActive]}
                onPress={() => setActivityLevel(opt.key)}
                activeOpacity={0.7}
              >
                <View style={st.activityRowText}>
                  <Text style={[st.activityLabel, active && st.activityLabelActive]}>
                    {opt.label}
                  </Text>
                  <Text style={[st.activityDesc, active && st.activityDescActive]}>
                    {opt.desc}
                  </Text>
                </View>
                {active && <Ionicons name="checkmark" size={16} color={colors.textLight} />}
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      <View style={st.btnRow}>
        <TouchableOpacity onPress={onBack} style={st.backBtn} activeOpacity={0.7}>
          <Text style={st.backBtnText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[st.primaryBtn, { flex: 1 }, !valid && st.primaryBtnDisabled]}
          onPress={onNext}
          disabled={!valid}
          activeOpacity={0.85}
        >
          <Text style={st.primaryBtnText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

// ---------------------------------------------------------------------------
// Step 3 — Target weight + timeline (lose / gain only)
// ---------------------------------------------------------------------------
function Step3Target({
  weightKg,
  goalType,
  targetWeightLbs, setTargetWeightLbs,
  timelineWeeks, setTimelineWeeks,
  recommendations,
  onNext, onBack,
}) {
  const currentLbs  = Math.round(weightKg * KG_TO_LBS)
  const isLose      = goalType === 'lose_weight'
  const targetNum   = parseFloat(targetWeightLbs)
  const validTarget = !isNaN(targetNum) && targetNum > 0 && (
    isLose ? targetNum < currentLbs : targetNum > currentLbs
  )

  return (
    <View style={st.stepContent}>
      <Text style={st.stepTitle}>
        {isLose ? 'Weight loss goal' : 'Weight gain goal'}
      </Text>
      <Text style={st.stepSubtitle}>Current weight: {currentLbs} lbs</Text>

      {/* Target weight */}
      <View style={st.fieldBlock}>
        <Text style={st.fieldLabel}>TARGET WEIGHT</Text>
        <View style={st.inlineInputRow}>
          <TextInput
            style={st.inlineInput}
            value={targetWeightLbs}
            onChangeText={setTargetWeightLbs}
            keyboardType="decimal-pad"
            placeholder={isLose ? 'e.g. 160' : 'e.g. 195'}
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            selectTextOnFocus
          />
          <Text style={st.inlineUnit}>lbs</Text>
        </View>
        {!isNaN(targetNum) && targetNum > 0 && !validTarget && (
          <Text style={st.fieldHint}>
            {isLose
              ? 'Must be lower than your current weight'
              : 'Must be higher than your current weight'}
          </Text>
        )}
      </View>

      {/* Timeline */}
      <View style={st.fieldBlock}>
        <Text style={st.fieldLabel}>TIMELINE</Text>
        <View style={st.chipRow}>
          {TIMELINE_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.weeks}
              style={[st.chip, timelineWeeks === opt.weeks && st.chipActive]}
              onPress={() => setTimelineWeeks(opt.weeks)}
              activeOpacity={0.7}
            >
              <Text style={[st.chipText, timelineWeeks === opt.weeks && st.chipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Projected rate callout */}
      {validTarget && recommendations?.weeklyRateLbs && (
        <View style={st.projectedCard}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
          <Text style={st.projectedText}>
            {'Projected ~'}
            <Text style={st.projectedBold}>{recommendations.weeklyRateLbs} lbs/week</Text>
            {`  ·  ${isLose ? 'deficit' : 'surplus'}: `}
            <Text style={st.projectedBold}>
              {Math.abs(recommendations.calAdjustment).toLocaleString()} cal/day
            </Text>
          </Text>
        </View>
      )}

      <View style={st.btnRow}>
        <TouchableOpacity onPress={onBack} style={st.backBtn} activeOpacity={0.7}>
          <Text style={st.backBtnText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[st.primaryBtn, { flex: 1 }, !validTarget && st.primaryBtnDisabled]}
          onPress={onNext}
          disabled={!validTarget}
          activeOpacity={0.85}
        >
          <Text style={st.primaryBtnText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Step 4 — Full plan review + water + workouts
// ---------------------------------------------------------------------------
function Step4Plan({
  goalType, recommendations,
  calories, setCalories,
  proteinG, setProteinG,
  carbsG, setCarbsG,
  fatG, setFatG,
  waterMl, setWaterMl,
  workoutsPerWeek, setWorkoutsPerWeek,
  saving, onSave, onBack,
}) {
  const goalOpt = GOAL_OPTIONS.find(g => g.key === goalType)
  const tdee    = recommendations?.tdee ?? 0
  const calNum  = parseInt(calories, 10) || 0
  const calDiff = tdee > 0 ? calNum - tdee : 0

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={st.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={st.stepTitle}>Your plan</Text>

      {/* Goal + TDEE summary */}
      {goalOpt && (
        <View style={st.planGoalRow}>
          <Ionicons name={goalOpt.icon} size={16} color={colors.textSecondary} />
          <Text style={st.planGoalLabel}>{goalOpt.label}</Text>
          {tdee > 0 && (
            <Text style={st.planTDEE}>TDEE {tdee.toLocaleString()} cal</Text>
          )}
        </View>
      )}

      {/* Daily calories */}
      <View style={st.planCard}>
        <Text style={st.planCardLabel}>DAILY CALORIES</Text>
        <View style={st.calorieRow}>
          <TextInput
            style={st.calorieInput}
            value={calories}
            onChangeText={v => setCalories(v.replace(/\D/g, ''))}
            keyboardType="number-pad"
            selectTextOnFocus
            returnKeyType="done"
          />
          <Text style={st.calorieUnit}>cal / day</Text>
        </View>
        {tdee > 0 && (
          <Text style={st.calorieDiff}>
            {calDiff === 0
              ? 'Maintenance calories'
              : calDiff < 0
              ? `${Math.abs(calDiff).toLocaleString()} cal below TDEE (deficit)`
              : `${calDiff.toLocaleString()} cal above TDEE (surplus)`}
          </Text>
        )}
      </View>

      {/* Macros */}
      <View style={st.planCard}>
        <Text style={st.planCardLabel}>DAILY MACROS</Text>
        <View style={st.macroRow}>
          {[
            { label: 'Protein', val: proteinG, set: setProteinG },
            { label: 'Carbs',   val: carbsG,   set: setCarbsG   },
            { label: 'Fat',     val: fatG,      set: setFatG     },
          ].map((m, i, arr) => (
            <View key={m.label} style={[st.macroItem, i < arr.length - 1 && st.macroItemBorder]}>
              <Text style={st.macroLabel}>{m.label}</Text>
              <View style={st.macroInputRow}>
                <TextInput
                  style={st.macroInput}
                  value={m.val}
                  onChangeText={v => m.set(v.replace(/\D/g, ''))}
                  keyboardType="number-pad"
                  selectTextOnFocus
                  returnKeyType="done"
                />
                <Text style={st.macroUnit}>g</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Daily water */}
      <View style={st.planCard}>
        <Text style={st.planCardLabel}>DAILY WATER</Text>
        <View style={st.chipRow}>
          {WATER_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.ml}
              style={[st.chip, waterMl === opt.ml && st.chipActive]}
              onPress={() => setWaterMl(opt.ml)}
              activeOpacity={0.7}
            >
              <Text style={[st.chipText, waterMl === opt.ml && st.chipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Weekly workouts */}
      <View style={st.planCard}>
        <Text style={st.planCardLabel}>WEEKLY WORKOUTS</Text>
        <View style={st.chipRow}>
          {[1, 2, 3, 4, 5, 6].map(n => (
            <TouchableOpacity
              key={n}
              style={[st.chipSq, workoutsPerWeek === n && st.chipActive]}
              onPress={() => setWorkoutsPerWeek(n)}
              activeOpacity={0.7}
            >
              <Text style={[st.chipText, workoutsPerWeek === n && st.chipTextActive]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Actions */}
      <View style={st.btnRow}>
        <TouchableOpacity onPress={onBack} style={st.backBtn} activeOpacity={0.7}>
          <Text style={st.backBtnText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[st.primaryBtn, { flex: 1 }, saving && { opacity: 0.6 }]}
          onPress={onSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Text style={st.primaryBtnText}>{saving ? 'Saving…' : 'Set My Goals'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

// ---------------------------------------------------------------------------
// Root export
// ---------------------------------------------------------------------------
export default function GoalSetupModal({ visible, profile, onClose, onSaved }) {
  const [step,             setStep]             = useState(1)
  const [goalType,         setGoalType]         = useState(null)

  // Step 2 — current stats (always asked fresh)
  const [currentWeightLbs, setCurrentWeightLbs] = useState('')
  const [heightFt,         setHeightFt]         = useState('')
  const [heightIn,         setHeightIn]         = useState('')
  const [age,              setAge]              = useState('')
  const [gender,           setGender]           = useState(null)
  const [activityLevel,    setActivityLevel]    = useState(null)

  // Step 3 — target (lose / gain only)
  const [targetWeightLbs, setTargetWeightLbs] = useState('')
  const [timelineWeeks,   setTimelineWeeks]   = useState(12)

  // Step 4 — plan values
  const [calories,        setCalories]        = useState('2000')
  const [proteinG,        setProteinG]        = useState('150')
  const [carbsG,          setCarbsG]          = useState('200')
  const [fatG,            setFatG]            = useState('65')
  const [waterMl,         setWaterMl]         = useState(2500)
  const [workoutsPerWeek, setWorkoutsPerWeek] = useState(4)

  const [saving, setSaving] = useState(false)

  // Pre-seed from existing profile whenever the modal opens
  useEffect(() => {
    if (!visible || !profile) return

    // Goal data
    setGoalType(profile.goal_type ?? null)
    setTimelineWeeks(profile.goal_timeline_weeks ?? 12)
    setWaterMl(profile.goal_water_ml ?? 2500)
    setWorkoutsPerWeek(profile.goal_workouts_per_week ?? 4)
    setTargetWeightLbs(
      profile.goal_target_weight_kg
        ? String(Math.round(profile.goal_target_weight_kg * KG_TO_LBS))
        : ''
    )
    if (profile.goal_calories) {
      setCalories(String(profile.goal_calories))
      setProteinG(String(profile.goal_protein_g ?? 150))
      setCarbsG(String(profile.goal_carbs_g   ?? 200))
      setFatG(String(profile.goal_fat_g       ?? 65))
    }

    // Current stats — pre-fill from profile so user only has to correct if changed
    setCurrentWeightLbs(
      profile.weight_kg ? String(Math.round(profile.weight_kg * KG_TO_LBS)) : ''
    )
    if (profile.height_cm) {
      const totalIn = Math.round(profile.height_cm / 2.54)
      setHeightFt(String(Math.floor(totalIn / 12)))
      setHeightIn(String(totalIn % 12))
    } else {
      setHeightFt('')
      setHeightIn('')
    }
    setAge(
      profile.date_of_birth
        ? String(Math.floor(
            (Date.now() - new Date(profile.date_of_birth)) / (365.25 * 24 * 3600 * 1000)
          ))
        : ''
    )
    setGender(profile.gender ?? null)
    setActivityLevel(profile.activity_level ?? null)

    setStep(1)
  }, [visible])

  const needsTarget = goalType === 'lose_weight' || goalType === 'gain_weight'

  // Derived kg/cm/age — used for recommendations and saved to profile
  const weightKg = parseFloat(currentWeightLbs) * LBS_TO_KG || 0
  const heightCm = (parseInt(heightFt, 10) || 0) * 30.48 + (parseInt(heightIn, 10) || 0) * 2.54
  const ageNum   = parseInt(age, 10) || 0

  const recommendations = (goalType && weightKg && heightCm && ageNum)
    ? computeRecommendations(
        weightKg, heightCm, ageNum, gender, activityLevel,
        goalType, targetWeightLbs, timelineWeeks,
      )
    : null

  function applyRecs(recs) {
    if (!recs) return
    setCalories(String(recs.calories))
    setProteinG(String(recs.protein_g))
    setCarbsG(String(recs.carbs_g))
    setFatG(String(recs.fat_g))
  }

  // Step routing
  function handleStep1Next() { setStep(2) }

  function handleStep2Next() {
    if (needsTarget) {
      setStep(3)
    } else {
      applyRecs(computeRecommendations(
        weightKg, heightCm, ageNum, gender, activityLevel,
        goalType, null, null,
      ))
      setStep(4)
    }
  }

  function handleStep3Next() {
    applyRecs(computeRecommendations(
      weightKg, heightCm, ageNum, gender, activityLevel,
      goalType, targetWeightLbs, timelineWeeks,
    ))
    setStep(4)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('profiles')
        .update({
          // Keep current body stats up to date
          weight_kg:      weightKg  || null,
          height_cm:      heightCm  || null,
          gender:         gender    || null,
          activity_level: activityLevel || null,
          // Approximate DOB from age (Jan 1 of birth year)
          ...(ageNum > 0 && {
            date_of_birth: `${new Date().getFullYear() - ageNum}-01-01`,
          }),
          // Goal columns
          goal_type:              goalType,
          goal_target_weight_kg:  targetWeightLbs
            ? parseFloat(targetWeightLbs) * LBS_TO_KG
            : null,
          goal_timeline_weeks:    needsTarget ? timelineWeeks : null,
          goal_calories:          parseInt(calories, 10) || null,
          goal_protein_g:         parseInt(proteinG, 10) || null,
          goal_carbs_g:           parseInt(carbsG,   10) || null,
          goal_fat_g:             parseInt(fatG,     10) || null,
          goal_water_ml:          waterMl,
          goal_workouts_per_week: workoutsPerWeek,
        })
        .eq('id', user.id)
      if (error) throw error
      onSaved?.()
      onClose()
    } catch (err) {
      console.error('Save goals error:', err)
      Alert.alert('Error', 'Could not save goals. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Progress indicator
  const totalSteps  = needsTarget ? 4 : 3
  const displayStep = needsTarget ? step : (step === 4 ? 3 : step)
  const progressPct = `${(displayStep / totalSteps) * 100}%`

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={st.container}>
        {/* Header */}
        <View style={st.modalHeader}>
          <TouchableOpacity onPress={onClose} style={st.modalCloseBtn} activeOpacity={0.7}>
            <Text style={st.modalCloseText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={st.modalHeaderTitle}>Set Goals</Text>
          <Text style={st.modalHeaderStep}>{displayStep}/{totalSteps}</Text>
        </View>

        {/* Progress bar */}
        <View style={st.progressTrack}>
          <View style={[st.progressFill, { width: progressPct }]} />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {step === 1 && (
            <Step1
              selectedGoal={goalType}
              onSelect={setGoalType}
              onNext={handleStep1Next}
            />
          )}
          {step === 2 && (
            <Step2Stats
              currentWeightLbs={currentWeightLbs} setCurrentWeightLbs={setCurrentWeightLbs}
              heightFt={heightFt}     setHeightFt={setHeightFt}
              heightIn={heightIn}     setHeightIn={setHeightIn}
              age={age}               setAge={setAge}
              gender={gender}         setGender={setGender}
              activityLevel={activityLevel} setActivityLevel={setActivityLevel}
              onNext={handleStep2Next}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && needsTarget && (
            <Step3Target
              weightKg={weightKg}
              goalType={goalType}
              targetWeightLbs={targetWeightLbs} setTargetWeightLbs={setTargetWeightLbs}
              timelineWeeks={timelineWeeks}     setTimelineWeeks={setTimelineWeeks}
              recommendations={recommendations}
              onNext={handleStep3Next}
              onBack={() => setStep(2)}
            />
          )}
          {step === 4 && (
            <Step4Plan
              goalType={goalType}
              recommendations={recommendations}
              calories={calories}   setCalories={setCalories}
              proteinG={proteinG}   setProteinG={setProteinG}
              carbsG={carbsG}       setCarbsG={setCarbsG}
              fatG={fatG}           setFatG={setFatG}
              waterMl={waterMl}     setWaterMl={setWaterMl}
              workoutsPerWeek={workoutsPerWeek} setWorkoutsPerWeek={setWorkoutsPerWeek}
              saving={saving}
              onSave={handleSave}
              onBack={() => setStep(needsTarget ? 3 : 2)}
            />
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const st = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  // ── Modal chrome ────────────────────────────────────────────────────────────
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  modalCloseBtn: { width: 60 },
  modalCloseText: {
    fontFamily: fonts.regular,
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  modalHeaderTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.md,
    color: colors.text,
  },
  modalHeaderStep: {
    width: 60,
    textAlign: 'right',
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },

  // Progress bar
  progressTrack: {
    height: 3,
    backgroundColor: colors.border,
  },
  progressFill: {
    height: 3,
    backgroundColor: colors.bgDark,
  },

  // ── Shared step layouts ─────────────────────────────────────────────────────
  stepContent: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: 40,
    gap: spacing.md,
  },
  stepTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xxl,
    color: colors.text,
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  stepSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  stepSubtitleSpaced: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },

  // ── Step 1 — goal tiles ──────────────────────────────────────────────────
  goalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  goalTile: {
    width: '48%',
    backgroundColor: colors.bgSecondary,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 6,
    alignItems: 'flex-start',
  },
  goalTileActive: {
    backgroundColor: colors.bgDark,
    borderColor: colors.bgDark,
  },
  goalTileLabel: {
    fontFamily: fonts.bold,
    fontSize: fontSize.md,
    color: colors.text,
    letterSpacing: -0.2,
  },
  goalTileLabelActive: { color: colors.textLight },
  goalTileDesc: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  goalTileDescActive: { color: 'rgba(255,255,255,0.6)' },

  // ── Step 2 — stats inputs ────────────────────────────────────────────────
  inlineInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  inlineInput: {
    flex: 1,
    height: 54,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.bold,
    fontSize: fontSize.xxl,
    color: colors.text,
    textAlign: 'center',
  },
  inlineUnit: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.lg,
    color: colors.textSecondary,
    width: 36,
  },
  heightRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  heightGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  heightInput: {
    flex: 1,
    height: 54,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.bold,
    fontSize: fontSize.xxl,
    color: colors.text,
    textAlign: 'center',
  },
  heightUnit: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.textSecondary,
    width: 20,
  },
  activityList: {
    gap: spacing.xs,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSecondary,
  },
  activityRowActive: {
    backgroundColor: colors.bgDark,
    borderColor: colors.bgDark,
  },
  activityRowText: { gap: 2 },
  activityLabel: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  activityLabelActive: { color: colors.textLight },
  activityDesc: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  activityDescActive: { color: 'rgba(255,255,255,0.55)' },

  // ── Step 3 — target form ─────────────────────────────────────────────────
  fieldBlock: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  fieldHint: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.accentRed,
    marginTop: 4,
  },
  projectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  projectedText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  projectedBold: {
    fontFamily: fonts.bold,
    color: colors.text,
  },

  // ── Step 4 — plan cards ──────────────────────────────────────────────────
  planGoalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  planGoalLabel: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    flex: 1,
  },
  planTDEE: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  planCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  planCardLabel: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  calorieRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  calorieInput: {
    fontFamily: fonts.bold,
    fontSize: 42,
    color: colors.text,
    letterSpacing: -1,
    minWidth: 120,
    paddingVertical: 0,
  },
  calorieUnit: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    alignSelf: 'flex-end',
    paddingBottom: 6,
  },
  calorieDiff: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  macroRow: { flexDirection: 'row' },
  macroItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  macroItemBorder: {
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  macroLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  macroInputRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  macroInput: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xxl,
    color: colors.text,
    minWidth: 50,
    textAlign: 'center',
    paddingVertical: 0,
  },
  macroUnit: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },

  // ── Chips ────────────────────────────────────────────────────────────────
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSq: {
    width: 44,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.bgDark,
    borderColor: colors.bgDark,
  },
  chipText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  chipTextActive: { color: colors.textLight },

  // ── Buttons ─────────────────────────────────────────────────────────────
  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  primaryBtn: {
    height: 52,
    backgroundColor: colors.bgDark,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: { opacity: 0.35 },
  primaryBtnText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.md,
    color: colors.textLight,
    letterSpacing: -0.2,
  },
  backBtn: {
    width: 80,
    height: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
})
