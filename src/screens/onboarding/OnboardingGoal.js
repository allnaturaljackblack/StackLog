import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { colors, spacing, radius, fontSize } from '../../utils/theme'

const GOALS = [
  { value: 'lose_weight', label: 'Lose Weight', desc: 'Burn fat while preserving muscle', emoji: '🔥' },
  { value: 'gain_muscle', label: 'Build Muscle', desc: 'Lean bulk with a calorie surplus', emoji: '💪' },
  { value: 'maintain', label: 'Maintain', desc: 'Stay at your current weight', emoji: '⚖️' },
  { value: 'improve_fitness', label: 'Improve Fitness', desc: 'Performance and endurance focus', emoji: '🏃' },
]

export default function OnboardingGoal({ navigation, route }) {
  const existing = route.params?.data || {}
  const [goal, setGoal] = useState(existing.goal || '')

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.step}>Step 4 of 8</Text>
      <Text style={styles.title}>What's your{'\n'}main goal?</Text>

      <View style={styles.options}>
        {GOALS.map(g => (
          <TouchableOpacity
            key={g.value}
            style={[styles.option, goal === g.value && styles.optionActive]}
            onPress={() => setGoal(g.value)}
            activeOpacity={0.7}
          >
            <Text style={styles.optionEmoji}>{g.emoji}</Text>
            <View style={styles.optionText}>
              <Text style={[styles.optionLabel, goal === g.value && styles.optionLabelActive]}>{g.label}</Text>
              <Text style={styles.optionDesc}>{g.desc}</Text>
            </View>
            <View style={[styles.radio, goal === g.value && styles.radioActive]}>
              {goal === g.value && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.button, !goal && styles.buttonDisabled]}
        onPress={() => navigation.navigate('ActivityLevel', { data: { ...existing, goal } })}
        disabled={!goal}
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
  title: { fontFamily: 'BarlowCondensed_900Black', fontSize: 44, color: colors.text, letterSpacing: -1, lineHeight: 48, marginBottom: spacing.xl },
  options: { gap: spacing.sm, marginBottom: spacing.xl },
  option: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.md, borderWidth: 2, borderColor: colors.border, gap: spacing.md },
  optionActive: { borderColor: colors.accentRed, backgroundColor: '#FFF8F8' },
  optionEmoji: { fontSize: 28 },
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