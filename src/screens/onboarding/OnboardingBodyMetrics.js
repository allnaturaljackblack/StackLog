import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native'
import { colors, spacing, radius, fontSize } from '../../utils/theme'

export default function OnboardingBodyMetrics({ navigation, route }) {
  const existing = route.params?.data || {}
  const [unit, setUnit] = useState('imperial')
  const [feet, setFeet] = useState('')
  const [inches, setInches] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [weight, setWeight] = useState('')
  const [gender, setGender] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [birthMonth, setBirthMonth] = useState('')
  const [birthDay, setBirthDay] = useState('')

  function handleContinue() {
    // Validate
    const year = parseInt(birthYear)
    const month = parseInt(birthMonth)
    const day = parseInt(birthDay)
    const currentYear = new Date().getFullYear()

    if (year < 1900 || year > currentYear - 10) {
      Alert.alert('Invalid birth year', 'Please enter a valid birth year.')
      return
    }
    if (month < 1 || month > 12) {
      Alert.alert('Invalid birth month', 'Please enter a month between 1 and 12.')
      return
    }
    if (day < 1 || day > 31) {
      Alert.alert('Invalid birth day', 'Please enter a day between 1 and 31.')
      return
    }

    const date_of_birth = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

    let height_cm, weight_kg
    if (unit === 'imperial') {
      const f = parseFloat(feet) || 0
      const i = parseFloat(inches) || 0
      height_cm = (f * 30.48) + (i * 2.54)
      weight_kg = parseFloat(weight) / 2.2046
    } else {
      height_cm = parseFloat(heightCm)
      weight_kg = parseFloat(weight)
    }

    if (height_cm < 100 || height_cm > 250) {
      Alert.alert('Invalid height', 'Please check your height entry.')
      return
    }
    if (weight_kg < 30 || weight_kg > 300) {
      Alert.alert('Invalid weight', 'Please check your weight entry.')
      return
    }

    navigation.navigate('Goal', {
      data: {
        ...existing,
        height_cm: Math.round(height_cm * 100) / 100,
        weight_kg: Math.round(weight_kg * 100) / 100,
        gender,
        date_of_birth,
        unit_system: unit,
      }
    })
  }

  const isValid = gender &&
    birthYear.length === 4 && birthMonth && birthDay &&
    (unit === 'imperial' ? (feet && weight) : (heightCm && weight))

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.step}>Step 3 of 8</Text>
      <Text style={styles.title}>Your body{'\n'}metrics.</Text>
      <Text style={styles.sub}>Used to calculate your calorie and macro targets.</Text>

      {/* Unit toggle */}
      <View style={styles.toggle}>
        {['imperial', 'metric'].map(u => (
          <TouchableOpacity
            key={u}
            style={[styles.toggleBtn, unit === u && styles.toggleBtnActive]}
            onPress={() => setUnit(u)}
          >
            <Text style={[styles.toggleText, unit === u && styles.toggleTextActive]}>
              {u === 'imperial' ? 'lbs / ft·in' : 'kg / cm'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.form}>
        {/* Height */}
        {unit === 'imperial' ? (
          <View style={styles.inputWrapper}>
            <Text style={styles.label}>HEIGHT</Text>
            <View style={styles.row}>
              <View style={styles.rowInput}>
                <TextInput
                  style={styles.input}
                  value={feet}
                  onChangeText={setFeet}
                  placeholder="5"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={1}
                />
                <Text style={styles.inputSuffix}>ft</Text>
              </View>
              <View style={styles.rowInput}>
                <TextInput
                  style={styles.input}
                  value={inches}
                  onChangeText={setInches}
                  placeholder="8"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={2}
                />
                <Text style={styles.inputSuffix}>in</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.inputWrapper}>
            <Text style={styles.label}>HEIGHT (cm)</Text>
            <TextInput
              style={styles.input}
              value={heightCm}
              onChangeText={setHeightCm}
              placeholder="178"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
            />
          </View>
        )}

        {/* Weight */}
        <View style={styles.inputWrapper}>
          <Text style={styles.label}>WEIGHT ({unit === 'imperial' ? 'lbs' : 'kg'})</Text>
          <TextInput
            style={styles.input}
            value={weight}
            onChangeText={setWeight}
            placeholder={unit === 'imperial' ? "155" : "70"}
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
          />
        </View>

        {/* Date of birth — three separate fields */}
        <View style={styles.inputWrapper}>
          <Text style={styles.label}>DATE OF BIRTH</Text>
          <View style={styles.row}>
            <View style={[styles.rowInput, { flex: 1.5 }]}>
              <TextInput
                style={styles.input}
                value={birthYear}
                onChangeText={setBirthYear}
                placeholder="1995"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={4}
              />
              <Text style={styles.inputSuffix}>year</Text>
            </View>
            <View style={styles.rowInput}>
              <TextInput
                style={styles.input}
                value={birthMonth}
                onChangeText={setBirthMonth}
                placeholder="6"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={2}
              />
              <Text style={styles.inputSuffix}>mo</Text>
            </View>
            <View style={styles.rowInput}>
              <TextInput
                style={styles.input}
                value={birthDay}
                onChangeText={setBirthDay}
                placeholder="15"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={2}
              />
              <Text style={styles.inputSuffix}>day</Text>
            </View>
          </View>
        </View>

        {/* Gender */}
        <View style={styles.inputWrapper}>
          <Text style={styles.label}>GENDER</Text>
          <View style={styles.options}>
            {['male', 'female', 'other'].map(g => (
              <TouchableOpacity
                key={g}
                style={[styles.optionBtn, gender === g && styles.optionBtnActive]}
                onPress={() => setGender(g)}
              >
                <Text style={[styles.optionText, gender === g && styles.optionTextActive]}>
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.button, !isValid && styles.buttonDisabled]}
        onPress={handleContinue}
        disabled={!isValid}
        activeOpacity={0.85}
      >
        <Text style={styles.buttonText}>CONTINUE</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { padding: spacing.lg, paddingTop: 60, flexGrow: 1 },
  back: { marginBottom: spacing.lg },
  backText: { fontFamily: 'Barlow_600SemiBold', fontSize: fontSize.md, color: colors.textMuted },
  step: { fontFamily: 'Barlow_500Medium', fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing.sm },
  title: { fontFamily: 'BarlowCondensed_900Black', fontSize: 44, color: colors.text, letterSpacing: -1, lineHeight: 48, marginBottom: spacing.sm },
  sub: { fontFamily: 'Barlow_400Regular', fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.lg },
  toggle: { flexDirection: 'row', backgroundColor: colors.bgCard, borderRadius: radius.md, padding: 4, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border },
  toggleBtn: { flex: 1, padding: spacing.sm, borderRadius: radius.sm, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: colors.bgDark },
  toggleText: { fontFamily: 'Barlow_600SemiBold', fontSize: fontSize.sm, color: colors.textMuted },
  toggleTextActive: { color: colors.textLight },
  form: { gap: spacing.md, marginBottom: spacing.lg },
  inputWrapper: { gap: spacing.xs },
  label: { fontFamily: 'Barlow_700Bold', fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1 },
  input: { flex: 1, backgroundColor: colors.bgCard, borderRadius: radius.md, padding: spacing.md, fontFamily: 'Barlow_400Regular', fontSize: fontSize.md, color: colors.text, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', gap: spacing.sm },
  rowInput: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  inputSuffix: { fontFamily: 'Barlow_400Regular', fontSize: fontSize.sm, color: colors.textMuted },
  options: { flexDirection: 'row', gap: spacing.sm },
  optionBtn: { flex: 1, padding: spacing.sm, borderRadius: radius.md, alignItems: 'center', backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  optionBtnActive: { backgroundColor: colors.bgDark, borderColor: colors.bgDark },
  optionText: { fontFamily: 'Barlow_600SemiBold', fontSize: fontSize.sm, color: colors.textMuted },
  optionTextActive: { color: colors.textLight },
  button: { backgroundColor: colors.accentRed, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.md },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: fontSize.lg, color: colors.textLight, letterSpacing: 1 },
})