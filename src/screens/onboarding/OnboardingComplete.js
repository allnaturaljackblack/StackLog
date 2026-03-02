import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { supabase } from '../../lib/supabase'
import { colors, spacing, fontSize } from '../../utils/theme'

export default function OnboardingComplete({ route, onComplete }) {
  const { data, firstFood } = route.params
  const [saving, setSaving] = useState(true)

  useEffect(() => {
    saveProfile()
  }, [])

  async function saveProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          display_name: data.display_name,
          date_of_birth: data.date_of_birth,
          gender: data.gender,
          height_cm: data.height_cm,
          weight_kg: data.weight_kg,
          activity_level: data.activity_level,
          goal: data.goal,
          calorie_target: data.calorie_target,
          protein_target_g: data.protein_target_g,
          carbs_target_g: data.carbs_target_g,
          fat_target_g: data.fat_target_g,
          visibility: data.visibility,
          unit_system: data.unit_system,
          onboarding_completed: true,
        })
        .eq('id', user.id)

      if (profileError) throw profileError

      if (firstFood) {
        const today = new Date().toISOString().split('T')[0]
        await supabase.from('food_logs').insert({
          user_id: user.id,
          log_date: today,
          meal_type: 'breakfast',
          quantity_amount: 1,
          quantity_unit: 'serving',
          quantity_unit_display: '1 serving',
          quantity_g: 100,
          calories: firstFood.cal,
          protein_g: 0,
          carbs_g: 0,
          fat_g: 0,
        })
      }

      setSaving(false)

      // Wait a beat so user sees the success screen, then redirect
      setTimeout(() => {
        onComplete()
      }, 2000)

    } catch (error) {
      Alert.alert('Error', 'Something went wrong saving your profile. Please try again.')
      setSaving(false)
    }
  }

  return (
    <View style={styles.container}>
      {saving ? (
        <>
          <ActivityIndicator size="large" color={colors.accentRed} />
          <Text style={styles.savingText}>Setting up your account...</Text>
        </>
      ) : (
        <>
          <Text style={styles.emoji}>🎉</Text>
          <Text style={styles.title}>You're all set.</Text>
          <Text style={styles.sub}>
            {firstFood
              ? `${firstFood.name} logged. Your dashboard is ready.`
              : 'Your dashboard is ready. Start logging to see your progress.'
            }
          </Text>
          <Text style={styles.loading}>Taking you to your dashboard...</Text>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDark, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  emoji: { fontSize: 64, marginBottom: spacing.lg },
  title: { fontFamily: 'BarlowCondensed_900Black', fontSize: 52, color: colors.textLight, letterSpacing: -1, textAlign: 'center', marginBottom: spacing.sm },
  sub: { fontFamily: 'Barlow_400Regular', fontSize: fontSize.md, color: '#888', textAlign: 'center', lineHeight: 24, marginBottom: spacing.xl },
  loading: { fontFamily: 'Barlow_400Regular', fontSize: fontSize.sm, color: '#555' },
  savingText: { fontFamily: 'Barlow_400Regular', fontSize: fontSize.md, color: '#888', marginTop: spacing.lg },
})