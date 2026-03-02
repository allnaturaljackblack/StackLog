import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator
} from 'react-native'
import { logFood } from '../../lib/foodLog'
import { calculateNutrition, getFoodDetails, extractServingOptions } from '../../lib/foodApi'
import { colors, spacing, radius, fontSize } from '../../utils/theme'
import { supabase } from '../../lib/supabase'

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert']

export default function FoodDetailScreen({ navigation, route }) {
  const { food, mealType: initialMealType, logDate, userId } = route.params

  const [quantity, setQuantity] = useState(String(food.serving_count || 1))
  const [servingOptions, setServingOptions] = useState([
    { label: 'grams', display: 'g', gramsPerUnit: 1 },
    { label: 'oz', display: 'oz', gramsPerUnit: 28.3495 },
  ])
  const [selectedServing, setSelectedServing] = useState(null)
  const [mealType, setMealType] = useState(initialMealType)
  const [saving, setSaving] = useState(false)
  const [loadingServings, setLoadingServings] = useState(true)
  const [showAllNutrition, setShowAllNutrition] = useState(false)

  useEffect(() => {
    loadServingOptions()
  }, [])

  async function loadServingOptions() {
    setLoadingServings(true)
    const detail = await getFoodDetails(food.external_id)
    let options = extractServingOptions(detail, food.name)

    if (options.filter(o => o.label !== 'grams' && o.label !== 'oz').length === 0 && food.serving_g) {
      const label = food.serving_label || 'serving'
      const display = label.charAt(0).toUpperCase() + label.slice(1)
      options = [
        { label, display, gramsPerUnit: food.serving_g, score: 100 },
        { label: 'grams', display: 'g', gramsPerUnit: 1, score: -1 },
        { label: 'oz', display: 'oz', gramsPerUnit: 28.3495, score: -1 },
      ]
    }

    setServingOptions(options)

    const existing = route.params?.existingLog
    if (existing) {
      const match = options.find(o => o.label === existing.quantity_unit)
      setSelectedServing(match || options[0])
      setQuantity(String(existing.quantity_amount))
    } else {
      setSelectedServing(options[0])
    }

    setLoadingServings(false)
  }

  const quantityNum = parseFloat(quantity) || 0
  const grams = selectedServing ? quantityNum * selectedServing.gramsPerUnit : quantityNum
  const nutrition = calculateNutrition(food, grams)

  async function handleLog() {
    if (quantityNum <= 0) {
      Alert.alert('Invalid quantity', 'Please enter a valid amount.')
      return
    }
    setSaving(true)
    try {
      const nutrition = calculateNutrition(food, Math.round(grams * 100) / 100)

      if (route.params?.existingLog) {
        const { error } = await supabase
          .from('food_logs')
          .update({
            quantity_amount: quantityNum,
            quantity_unit: selectedServing?.label || 'grams',
            quantity_unit_display: `${quantity} ${selectedServing?.display || 'g'}`,
            quantity_g: Math.round(grams * 100) / 100,
            meal_type: mealType,
            calories: nutrition.calories,
            protein_g: nutrition.protein_g,
            carbs_g: nutrition.carbs_g,
            fat_g: nutrition.fat_g,
            fiber_g: nutrition.fiber_g,
            sugar_g: nutrition.sugar_g,
            sodium_mg: nutrition.sodium_mg,
          })
          .eq('id', route.params.existingLog.id)
        if (error) throw error
      } else {
        await logFood({
          food,
          quantityAmount: quantityNum,
          quantityUnit: selectedServing?.label || 'grams',
          quantityUnitDisplay: `${quantity} ${selectedServing?.display || 'g'}`,
          quantityG: Math.round(grams * 100) / 100,
          mealType,
          logDate,
          userId,
        })
      }
      navigation.pop(2)
    } catch (error) {
      Alert.alert('Error', 'Could not save. Please try again.')
    }
    setSaving(false)
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Back button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
      </View>

      {/* Food name */}
      <View style={styles.foodHeader}>
        <Text style={styles.foodName}>{food.name}</Text>
        {food.brand && <Text style={styles.foodBrand}>{food.brand}</Text>}
      </View>

      {/* Quantity input */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>AMOUNT</Text>
        <View style={styles.quantityRow}>
          <TextInput
            style={styles.quantityInput}
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="decimal-pad"
            selectTextOnFocus
          />
          <Text style={styles.quantityX}>×</Text>
          <View style={styles.servingInfo}>
            {loadingServings ? (
              <ActivityIndicator size="small" color={colors.accentRed} />
            ) : (
              <>
                <Text style={styles.servingDisplay}>{selectedServing?.display || 'g'}</Text>
                <Text style={styles.gramsDisplay}>= {Math.round(grams)}g</Text>
              </>
            )}
          </View>
        </View>

        {/* Serving size picker */}
        {!loadingServings && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.servingScroll}>
            {servingOptions.map(opt => {
              const isActive = selectedServing?.label === opt.label
              return (
                <TouchableOpacity
                  key={opt.label}
                  style={[styles.servingBtn, isActive && styles.servingBtnActive]}
                  onPress={() => setSelectedServing(opt)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.servingBtnText, isActive && styles.servingBtnTextActive]}>
                    {opt.display}
                  </Text>
                  {opt.gramsPerUnit !== 1 && (
                    <Text style={[styles.servingBtnGrams, isActive && styles.servingBtnGramsActive]}>
                      {Math.round(opt.gramsPerUnit)}g
                    </Text>
                  )}
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        )}
      </View>

      {/* Nutrition card */}
      <View style={styles.nutritionCard}>
        <View style={styles.nutritionHero}>
          <Text style={styles.nutritionCalories}>{Math.round(nutrition.calories)}</Text>
          <Text style={styles.nutritionCalLabel}>calories</Text>
        </View>
        <View style={styles.macroRow}>
          <View style={styles.macroItem}>
            <Text style={[styles.macroValue, { color: colors.accentRed }]}>
              {nutrition.protein_g}<Text style={styles.macroUnit}>g</Text>
            </Text>
            <Text style={styles.macroLabel}>Protein</Text>
          </View>
          <View style={styles.macroItem}>
            <Text style={[styles.macroValue, { color: colors.accentBlue }]}>
              {nutrition.carbs_g}<Text style={styles.macroUnit}>g</Text>
            </Text>
            <Text style={styles.macroLabel}>Carbs</Text>
          </View>
          <View style={styles.macroItem}>
            <Text style={[styles.macroValue, { color: colors.warn }]}>
              {nutrition.fat_g}<Text style={styles.macroUnit}>g</Text>
            </Text>
            <Text style={styles.macroLabel}>Fat</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.expandBtn} onPress={() => setShowAllNutrition(!showAllNutrition)}>
          <Text style={styles.expandBtnText}>
            {showAllNutrition ? 'Hide full nutrition ↑' : 'Show full nutrition ↓'}
          </Text>
        </TouchableOpacity>

        {showAllNutrition && (
          <View style={styles.fullNutrition}>
            {[
              { label: 'Fiber',  value: `${nutrition.fiber_g}g` },
              { label: 'Sugar',  value: `${nutrition.sugar_g}g` },
              { label: 'Sodium', value: `${nutrition.sodium_mg}mg` },
            ].map(row => (
              <View key={row.label} style={styles.nutritionRow}>
                <Text style={styles.nutritionLabel}>{row.label}</Text>
                <Text style={styles.nutritionValue}>{row.value}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Meal type picker */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>ADDING TO</Text>
        <View style={styles.mealPicker}>
          {MEAL_TYPES.map(type => (
            <TouchableOpacity
              key={type}
              style={[styles.mealBtn, mealType === type && styles.mealBtnActive]}
              onPress={() => setMealType(type)}
              activeOpacity={0.7}
            >
              <Text style={[styles.mealBtnText, mealType === type && styles.mealBtnTextActive]}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Log button */}
      <TouchableOpacity
        style={[styles.logButton, saving && styles.logButtonDisabled]}
        onPress={handleLog}
        disabled={saving}
        activeOpacity={0.8}
      >
        {saving
          ? <ActivityIndicator color={colors.textLight} />
          : <Text style={styles.logButtonText}>
              {route.params?.existingLog ? 'SAVE CHANGES' : `ADD TO ${mealType.toUpperCase()}`}
            </Text>
        }
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingTop: 56, paddingBottom: 40 },

  header: { marginBottom: spacing.md },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 18, color: colors.text },

  foodHeader: { marginBottom: spacing.lg },
  foodName: { fontFamily: 'BarlowCondensed_900Black', fontSize: 32, color: colors.text, letterSpacing: -0.5, lineHeight: 36 },
  foodBrand: { fontFamily: 'Barlow_400Regular', fontSize: fontSize.md, color: colors.textMuted, marginTop: 4 },

  section: { marginBottom: spacing.lg },
  sectionLabel: { fontFamily: 'Barlow_700Bold', fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1, marginBottom: spacing.sm },

  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  quantityInput: { width: 90, backgroundColor: colors.bgCard, borderRadius: radius.md, padding: spacing.md, fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: 28, color: colors.text, borderWidth: 1, borderColor: colors.border, textAlign: 'center' },
  quantityX: { fontFamily: 'Barlow_400Regular', fontSize: 20, color: colors.textMuted },
  servingInfo: { flex: 1 },
  servingDisplay: { fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: 22, color: colors.text, letterSpacing: -0.3 },
  gramsDisplay: { fontFamily: 'Barlow_400Regular', fontSize: fontSize.sm, color: colors.textMuted },

  servingScroll: { marginTop: spacing.xs },
  servingBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, marginRight: spacing.sm, alignItems: 'center' },
  servingBtnActive: { backgroundColor: colors.bgDark, borderColor: colors.bgDark },
  servingBtnText: { fontFamily: 'Barlow_600SemiBold', fontSize: fontSize.sm, color: colors.textMuted },
  servingBtnTextActive: { color: colors.textLight },
  servingBtnGrams: { fontFamily: 'Barlow_400Regular', fontSize: 10, color: colors.textMuted, marginTop: 2 },
  servingBtnGramsActive: { color: '#888' },

  nutritionCard: { backgroundColor: colors.bgCard, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border },
  nutritionHero: { alignItems: 'center', marginBottom: spacing.md },
  nutritionCalories: { fontFamily: 'BarlowCondensed_900Black', fontSize: 64, color: colors.text, letterSpacing: -2, lineHeight: 68 },
  nutritionCalLabel: { fontFamily: 'Barlow_400Regular', fontSize: fontSize.sm, color: colors.textMuted, marginTop: -4 },
  macroRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  macroItem: { alignItems: 'center' },
  macroValue: { fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: 24, letterSpacing: -0.5 },
  macroUnit: { fontSize: 14, fontFamily: 'BarlowCondensed_600SemiBold' },
  macroLabel: { fontFamily: 'Barlow_400Regular', fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  expandBtn: { marginTop: spacing.md, alignItems: 'center' },
  expandBtnText: { fontFamily: 'Barlow_500Medium', fontSize: fontSize.sm, color: colors.textMuted },
  fullNutrition: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, gap: spacing.sm },
  nutritionRow: { flexDirection: 'row', justifyContent: 'space-between' },
  nutritionLabel: { fontFamily: 'Barlow_400Regular', fontSize: fontSize.sm, color: colors.textMuted },
  nutritionValue: { fontFamily: 'Barlow_600SemiBold', fontSize: fontSize.sm, color: colors.text },

  mealPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mealBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  mealBtnActive: { backgroundColor: colors.bgDark, borderColor: colors.bgDark },
  mealBtnText: { fontFamily: 'Barlow_600SemiBold', fontSize: fontSize.sm, color: colors.textMuted },
  mealBtnTextActive: { color: colors.textLight },

  logButton: { backgroundColor: colors.accentRed, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  logButtonDisabled: { opacity: 0.6 },
  logButtonText: { fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: fontSize.lg, color: colors.textLight, letterSpacing: 1 },
})