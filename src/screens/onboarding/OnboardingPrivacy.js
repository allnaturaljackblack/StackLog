import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { colors, spacing, radius, fontSize } from '../../utils/theme'

const OPTIONS = [
  { value: 'friends_only', label: 'Friends Only', desc: 'Only people you approve can see your activity', emoji: '👥', recommended: true },
  { value: 'public', label: 'Public', desc: 'Anyone on StackLog can see your posts', emoji: '🌍', recommended: false },
  { value: 'private', label: 'Just Me', desc: 'Use StackLog as a personal tracker only', emoji: '🔒', recommended: false },
]

export default function OnboardingPrivacy({ navigation, route }) {
  const existing = route.params?.data || {}
  const [visibility, setVisibility] = useState('friends_only')

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.step}>Step 7 of 8</Text>
      <Text style={styles.title}>Who can see{'\n'}your activity?</Text>
      <Text style={styles.sub}>You can change this anytime in Settings.</Text>

      <View style={styles.options}>
        {OPTIONS.map(o => (
          <TouchableOpacity
            key={o.value}
            style={[styles.option, visibility === o.value && styles.optionActive]}
            onPress={() => setVisibility(o.value)}
            activeOpacity={0.7}
          >
            <Text style={styles.optionEmoji}>{o.emoji}</Text>
            <View style={styles.optionText}>
              <View style={styles.optionLabelRow}>
                <Text style={[styles.optionLabel, visibility === o.value && styles.optionLabelActive]}>{o.label}</Text>
                {o.recommended && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>RECOMMENDED</Text>
                  </View>
                )}
              </View>
              <Text style={styles.optionDesc}>{o.desc}</Text>
            </View>
            <View style={[styles.radio, visibility === o.value && styles.radioActive]}>
              {visibility === o.value && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('FirstMeal', { data: { ...existing, visibility } })}
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
  sub: { fontFamily: 'Barlow_400Regular', fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.xl },
  options: { gap: spacing.sm, marginBottom: spacing.xl },
  option: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.md, borderWidth: 2, borderColor: colors.border, gap: spacing.md },
  optionActive: { borderColor: colors.accentRed, backgroundColor: '#FFF8F8' },
  optionEmoji: { fontSize: 24 },
  optionText: { flex: 1 },
  optionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  optionLabel: { fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: fontSize.lg, color: colors.text, letterSpacing: -0.3 },
  optionLabelActive: { color: colors.accentRed },
  optionDesc: { fontFamily: 'Barlow_400Regular', fontSize: fontSize.xs, color: colors.textMuted },
  badge: { backgroundColor: colors.accent, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontFamily: 'Barlow_700Bold', fontSize: 9, color: colors.text, letterSpacing: 0.5 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: colors.accentRed },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accentRed },
  button: { backgroundColor: colors.accentRed, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  buttonText: { fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: fontSize.lg, color: colors.textLight, letterSpacing: 1 },
})