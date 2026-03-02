import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { colors, spacing, radius, fontSize } from '../../utils/theme'

const LEVELS = [
  { value: 'sedentary', label: 'Sedentary', desc: 'Desk job, little or no exercise' },
  { value: 'light', label: 'Lightly Active', desc: 'Light exercise 1–3 days/week' },
  { value: 'moderate', label: 'Moderately Active', desc: 'Moderate exercise 3–5 days/week' },
  { value: 'active', label: 'Very Active', desc: 'Hard exercise 6–7 days/week' },
  { value: 'very_active', label: 'Athlete', desc: 'Physical job + hard daily training' },
]

export default function OnboardingActivityLevel({ navigation, route }) {
  const existing = route.params?.data || {}
  const [level, setLevel] = useState(existing.activity_level || '')

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.step}>Step 5 of 8</Text>
      <Text style={styles.title}>How active{'\n'}are you?</Text>

      <View style={styles.options}>
        {LEVELS.map(l => (
          <TouchableOpacity
            key={l.value}
            style={[styles.option, level === l.value && styles.optionActive]}
            onPress={() => setLevel(l.value)}
            activeOpacity={0.7}
          >
            <View style={styles.optionText}>
              <Text style={[styles.optionLabel, level === l.value && styles.optionLabelActive]}>{l.label}</Text>
              <Text style={styles.optionDesc}>{l.desc}</Text>
            </View>
            <View style={[styles.radio, level === l.value && styles.radioActive]}>
              {level === l.value && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.button, !level && styles.buttonDisabled]}
        onPress={() => navigation.navigate('Targets', { data: { ...existing, activity_level: level } })}
        disabled={!level}
        activeOpacity={0.85}
      >
        <Text style={styles.buttonText}>CALCULATE MY TARGETS</Text>
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
  title: { fontFamily: 'BarlowCondensed_900Black', fontSize: 44, color: colors.text, letterSpacing: -1, lineHeight: 48, marginBottom: spacing.xl },
  options: { gap: spacing.sm, marginBottom: spacing.xl },
  option: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.md, borderWidth: 2, borderColor: colors.border, gap: spacing.md },
  optionActive: { borderColor: colors.accentRed, backgroundColor: '#FFF8F8' },
  optionText: { flex: 1 },
  optionLabel: { fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: fontSize.lg, color: colors.text, letterSpacing: -0.3 },
  optionLabelActive: { color: colors.accentRed },
  optionDesc: { fontFamily: 'Barlow_400Regular', fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: colors.accentRed },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accentRed },
  button: { backgroundColor: colors.accentRed, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: fontSize.lg, color: colors.textLight, letterSpacing: 1 },
})