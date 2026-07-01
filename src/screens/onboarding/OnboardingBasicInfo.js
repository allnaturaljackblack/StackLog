import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { colors, spacing, radius, fontSize } from '../../utils/theme'

export default function OnboardingBasicInfo({ navigation, route }) {
  const existing = route.params?.data || {}
  const [displayName, setDisplayName] = useState(existing.display_name || '')

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.step}>Step 2 of 8</Text>
      <Text style={styles.title}>What should{'\n'}we call you?</Text>

      <View style={styles.form}>
        <View style={styles.inputWrapper}>
          <Text style={styles.label}>DISPLAY NAME</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            placeholderTextColor={colors.textMuted}
          />
          <Text style={styles.hint}>This is how you'll appear to others</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.button, !displayName && styles.buttonDisabled]}
        onPress={() => navigation.navigate('BodyMetrics', {
          data: { ...existing, display_name: displayName }
        })}
        disabled={!displayName}
        activeOpacity={0.85}
      >
        <Text style={styles.buttonText}>Continue</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { padding: spacing.lg, paddingTop: 60, flexGrow: 1 },
  back: { marginBottom: spacing.lg },
  backText: { fontFamily: 'Inter_600SemiBold', fontSize: fontSize.md, color: colors.textMuted },
  step: { fontFamily: 'Inter_500Medium', fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing.sm },
  title: { fontFamily: 'Inter_700Bold', fontSize: 44, color: colors.text, letterSpacing: -1, lineHeight: 48, marginBottom: spacing.xl },
  form: { gap: spacing.md, marginBottom: spacing.xl },
  inputWrapper: { gap: spacing.xs },
  label: { fontFamily: 'Inter_700Bold', fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1 },
  input: { backgroundColor: colors.bgSecondary, borderRadius: radius.md, padding: spacing.md, fontFamily: 'Inter_400Regular', fontSize: fontSize.md, color: colors.text, borderWidth: 1, borderColor: colors.border },
  hint: { fontFamily: 'Inter_400Regular', fontSize: fontSize.xs, color: colors.textMuted },
  button: { backgroundColor: colors.bgDark, borderRadius: radius.full, padding: spacing.md, alignItems: 'center', marginTop: 'auto' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { fontFamily: 'Inter_700Bold', fontSize: fontSize.lg, color: colors.textLight, letterSpacing: 1 },
})