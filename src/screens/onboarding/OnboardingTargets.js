import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { calculateTargets } from '../../utils/tdee'
import { colors, spacing, radius, fontSize } from '../../utils/theme'

const goalLabels = {
  lose_weight: 'lose weight',
  gain_muscle: 'build muscle',
  maintain: 'maintain your weight',
  improve_fitness: 'improve your fitness',
}

export default function OnboardingTargets({ navigation, route }) {
  const data = route.params?.data || {}
  const targets = calculateTargets(data)

  const goalAdjustments = {
    lose_weight: -500,
    maintain: 0,
    gain_muscle: 250,
    improve_fitness: 0,
  }
  const maintenance = targets.calorie_target - goalAdjustments[data.goal]

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.step}>Step 6 of 8</Text>
      <Text style={styles.title}>Your daily{'\n'}targets.</Text>

      <View style={styles.heroCard}>
        <Text style={styles.heroNumber}>{targets.calorie_target.toLocaleString()}</Text>
        <Text style={styles.heroLabel}>CALORIES / DAY</Text>
        <Text style={styles.heroSub}>
          {goalAdjustments[data.goal] !== 0
            ? `${Math.abs(goalAdjustments[data.goal])} cal ${goalAdjustments[data.goal] > 0 ? 'above' : 'below'} your maintenance of ${maintenance.toLocaleString()} cal`
            : `Your maintenance calories to ${goalLabels[data.goal]}`
          }
        </Text>
      </View>

      <View style={styles.macros}>
        {[
          { label: 'PROTEIN', value: targets.protein_target_g, unit: 'g', color: colors.bgDark, desc: `${data.goal === 'lose_weight' ? '2.2' : data.goal === 'gain_muscle' ? '2.0' : '1.8'}g per kg — preserves and builds muscle` },
          { label: 'CARBS', value: targets.carbs_target_g, unit: 'g', color: colors.text, desc: 'Fuels your training and recovery' },
          { label: 'FAT', value: targets.fat_target_g, unit: 'g', color: colors.warn, desc: 'Supports hormones and absorption' },
        ].map(m => (
          <View key={m.label} style={styles.macroCard}>
            <View style={styles.macroTop}>
              <Text style={[styles.macroValue, { color: m.color }]}>{m.value}<Text style={styles.macroUnit}>{m.unit}</Text></Text>
              <Text style={styles.macroLabel}>{m.label}</Text>
            </View>
            <Text style={styles.macroDesc}>{m.desc}</Text>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('Privacy', {
            data: { ...data, ...targets }
          })}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>Looks Good →</Text>
        </TouchableOpacity>
        <Text style={styles.adjustNote}>You can adjust these targets anytime in Settings</Text>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { padding: spacing.lg, paddingTop: 60 },
  back: { marginBottom: spacing.lg },
  backText: { fontFamily: 'Inter_600SemiBold', fontSize: fontSize.md, color: colors.textMuted },
  step: { fontFamily: 'Inter_500Medium', fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing.sm },
  title: { fontFamily: 'Inter_700Bold', fontSize: 44, color: colors.text, letterSpacing: -1, lineHeight: 48, marginBottom: spacing.lg },
  heroCard: { backgroundColor: colors.bgDark, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md, alignItems: 'center' },
  heroNumber: { fontFamily: 'Inter_700Bold', fontSize: 72, color: colors.textLight, letterSpacing: -2, lineHeight: 76 },
  heroLabel: { fontFamily: 'Inter_700Bold', fontSize: fontSize.xs, color: '#888', letterSpacing: 2, marginBottom: spacing.sm },
  heroSub: { fontFamily: 'Inter_400Regular', fontSize: fontSize.sm, color: '#666', textAlign: 'center', lineHeight: 20 },
  macros: { gap: spacing.sm, marginBottom: spacing.lg },
  macroCard: { backgroundColor: colors.bgSecondary, borderRadius: radius.lg, padding: spacing.md },
  macroTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 },
  macroValue: { fontFamily: 'Inter_700Bold', fontSize: 36, letterSpacing: -1 },
  macroUnit: { fontSize: 18, letterSpacing: 0 },
  macroLabel: { fontFamily: 'Inter_700Bold', fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1 },
  macroDesc: { fontFamily: 'Inter_400Regular', fontSize: fontSize.xs, color: colors.textMuted },
  actions: { gap: spacing.sm, marginBottom: spacing.xl },
  button: { backgroundColor: colors.bgDark, borderRadius: radius.full, padding: spacing.md, alignItems: 'center' },
  buttonText: { fontFamily: 'Inter_700Bold', fontSize: fontSize.lg, color: colors.textLight, letterSpacing: 1 },
  adjustNote: { fontFamily: 'Inter_400Regular', fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center' },
})