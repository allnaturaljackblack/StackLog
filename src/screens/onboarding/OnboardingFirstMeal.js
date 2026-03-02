import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { colors, spacing, radius, fontSize } from '../../utils/theme'

const QUICK_FOODS = [
  { name: 'Eggs (2 large)', cal: 140, emoji: '🥚' },
  { name: 'Greek Yogurt (1 cup)', cal: 100, emoji: '🥛' },
  { name: 'Banana (1 medium)', cal: 89, emoji: '🍌' },
  { name: 'Oatmeal (1 cup cooked)', cal: 158, emoji: '🥣' },
  { name: 'Coffee, black', cal: 2, emoji: '☕' },
  { name: 'Protein Shake', cal: 130, emoji: '🥤' },
]

export default function OnboardingFirstMeal({ navigation, route }) {
  const existing = route.params?.data || {}

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.step}>Step 8 of 8</Text>
      <Text style={styles.title}>Log your{'\n'}first meal.</Text>
      <Text style={styles.sub}>What did you have for breakfast today? Tap to add — takes 5 seconds.</Text>

      <View style={styles.quickFoods}>
        {QUICK_FOODS.map(food => (
          <TouchableOpacity
            key={food.name}
            style={styles.foodRow}
            onPress={() => navigation.navigate('Complete', { data: existing, firstFood: food })}
            activeOpacity={0.7}
          >
            <Text style={styles.foodEmoji}>{food.emoji}</Text>
            <View style={styles.foodInfo}>
              <Text style={styles.foodName}>{food.name}</Text>
              <Text style={styles.foodCal}>{food.cal} cal</Text>
            </View>
            <View style={styles.addBtn}>
              <Text style={styles.addBtnText}>+</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={styles.skipButton}
        onPress={() => navigation.navigate('Complete', { data: existing, firstFood: null })}
      >
        <Text style={styles.skipText}>Skip for now →</Text>
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
  sub: { fontFamily: 'Barlow_400Regular', fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.lg, lineHeight: 22 },
  quickFoods: { gap: spacing.sm, marginBottom: spacing.lg },
  foodRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  foodEmoji: { fontSize: 28 },
  foodInfo: { flex: 1 },
  foodName: { fontFamily: 'Barlow_600SemiBold', fontSize: fontSize.md, color: colors.text },
  foodCal: { fontFamily: 'Barlow_400Regular', fontSize: fontSize.sm, color: colors.textMuted },
  addBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accentRed, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: '#fff', fontSize: 20, fontWeight: '300', marginTop: -1 },
  skipButton: { alignItems: 'center', padding: spacing.md },
  skipText: { fontFamily: 'Barlow_400Regular', fontSize: fontSize.sm, color: colors.textMuted },
})