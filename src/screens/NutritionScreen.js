import { useState, useCallback, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Modal, TextInput,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { useTodayLogs } from '../hooks/useTodayLogs'
import { useProfile } from '../hooks/useProfile'
import DateHeader, { getToday } from '../components/DateHeader'
import { colors, fonts, fontSize, spacing, radius } from '../utils/theme'
import { logCalorieBurn, updateCalorieBurn, deleteCalorieBurn } from '../lib/calorieBurnLog'
import { supabase } from '../lib/supabase'

const MEAL_CONFIG = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch',     label: 'Lunch' },
  { key: 'dinner',    label: 'Dinner' },
  { key: 'snack',     label: 'Snacks' },
]

// ---------------------------------------------------------------------------
// Log Burn modal sheet
// ---------------------------------------------------------------------------
// editEntry: null = add mode, calorie_burns row = edit mode
function LogBurnSheet({ visible, logDate, editEntry, onSaved, onDismiss }) {
  const [calories, setCalories] = useState('')
  const [notes, setNotes]       = useState('')
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    if (visible) {
      setCalories(editEntry ? String(editEntry.calories) : '')
      setNotes(editEntry?.notes || '')
    }
  }, [visible, editEntry])

  function reset() { setCalories(''); setNotes('') }

  async function handleSave() {
    const cal = parseInt(calories, 10)
    if (!cal || cal <= 0) {
      Alert.alert('Invalid calories', 'Enter a number greater than 0.')
      return
    }
    setSaving(true)
    try {
      if (editEntry) {
        await updateCalorieBurn(editEntry.id, { calories: cal, notes: notes.trim() })
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        await logCalorieBurn({ userId: user.id, logDate, calories: cal, notes: notes.trim() })
      }
      reset()
      onSaved()
    } catch (err) {
      Alert.alert('Error', 'Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const isEditing = !!editEntry

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={lbStyles.backdrop} activeOpacity={1} onPress={onDismiss} />
        <View style={lbStyles.sheet}>
          <View style={lbStyles.handle} />
          <Text style={lbStyles.title}>{isEditing ? 'Edit Calories Burned' : 'Log Calories Burned'}</Text>

          <Text style={lbStyles.fieldLabel}>CALORIES BURNED</Text>
          <View style={lbStyles.calInputRow}>
            <TextInput
              style={lbStyles.calInput}
              value={calories}
              onChangeText={setCalories}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              returnKeyType="done"
              selectTextOnFocus
              autoFocus
            />
            <Text style={lbStyles.calUnit}>cal</Text>
          </View>

          <Text style={lbStyles.fieldLabel}>NOTES (optional)</Text>
          <TextInput
            style={lbStyles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. Morning run, gym session…"
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            multiline
          />

          <TouchableOpacity
            style={[lbStyles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Text style={lbStyles.saveBtnText}>{saving ? 'Saving…' : isEditing ? 'Update' : 'Log Burn'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={lbStyles.cancelBtn} onPress={onDismiss} activeOpacity={0.7}>
            <Text style={lbStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function NutritionScreen({ navigation }) {
  const [selectedDate, setSelectedDate] = useState(getToday)
  const [showBurnSheet, setShowBurnSheet] = useState(false)
  const [editingBurn, setEditingBurn] = useState(null)
  const { totals, totalBurned, calorieBurns, mealGroups, loading, refresh } = useTodayLogs(selectedDate)
  const { profile } = useProfile()

  function handleDeleteBurn(id) {
    Alert.alert('Delete entry', 'Remove this calorie burn entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try { await deleteCalorieBurn(id); refresh() } catch { Alert.alert('Error', 'Could not delete entry.') }
        },
      },
    ])
  }

  function openAddBurn() { setEditingBurn(null); setShowBurnSheet(true) }
  function openEditBurn(burn) { setEditingBurn(burn); setShowBurnSheet(true) }

  useFocusEffect(useCallback(() => { refresh() }, [selectedDate]))

  // Calorie goal progress
  const goalCal   = profile?.goal_calories || 0
  const consumed  = Math.round(totals.calories)
  const netCal    = consumed - totalBurned
  const remaining = goalCal > 0 ? goalCal - netCal : null
  const isOver    = remaining !== null && remaining < 0
  const fillPct   = goalCal > 0 ? Math.min(netCal / goalCal, 1) : 0

  function handleAddMeal() {
    navigation.getParent()?.navigate('FoodLog', {
      screen: 'FoodSearch',
      params: { mealType: null, logDate: selectedDate },
    })
  }

  const hasAnyMeals = MEAL_CONFIG.some(
    m => (mealGroups[m.key] || []).length > 0
  )

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Page header row */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.pageTitle}>Nutrition</Text>
            <Text style={styles.pageSubtitle}>Track your daily intake</Text>
          </View>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={handleAddMeal}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={16} color={colors.textLight} />
            <Text style={styles.ctaButtonText}>Add Meal</Text>
          </TouchableOpacity>
        </View>

        {/* Date picker */}
        <DateHeader date={selectedDate} onChange={setSelectedDate} />

        {/* Today's summary card */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>TODAY'S SUMMARY</Text>

          {/* Calorie consumed row */}
          <View style={styles.calRow}>
            <View style={styles.calLeft}>
              <Text style={[styles.calConsumed, isOver && styles.calConsumedOver]}>
                {consumed.toLocaleString()}
              </Text>
              <Text style={styles.calConsumedUnit}>cal consumed</Text>
            </View>
            {goalCal > 0 && (
              <View style={styles.calRight}>
                <Text style={styles.calGoalNum}>{goalCal.toLocaleString()}</Text>
                <Text style={styles.calGoalLabel}>goal</Text>
              </View>
            )}
          </View>

          {/* Burned + Net row */}
          {totalBurned > 0 && (
            <View style={styles.burnedRow}>
              <View style={styles.burnedItem}>
                <Ionicons name="flame" size={13} color={colors.accentRed} />
                <Text style={styles.burnedLabel}>{totalBurned.toLocaleString()} cal burned</Text>
              </View>
              <View style={styles.burnedDot} />
              <Text style={styles.netLabel}>
                {netCal.toLocaleString()} cal net
              </Text>
            </View>
          )}

          {/* Progress bar — only shown when a goal is set */}
          {goalCal > 0 && (
            <>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${fillPct * 100}%` },
                    isOver && styles.progressFillOver,
                  ]}
                />
              </View>
              <Text style={[styles.remainingLabel, isOver && styles.remainingLabelOver]}>
                {isOver
                  ? `${Math.abs(remaining).toLocaleString()} cal over goal`
                  : `${remaining.toLocaleString()} cal remaining`}
              </Text>
            </>
          )}

          {/* Macro row */}
          <View style={styles.macroRow}>
            <View style={styles.macroCol}>
              <Text style={styles.macroValue}>{Math.round(totals.protein)}g</Text>
              <Text style={styles.macroUnit}>Protein</Text>
              {!!profile?.goal_protein_g && (
                <Text style={styles.macroGoal}>/ {profile.goal_protein_g}g</Text>
              )}
            </View>
            <View style={styles.macroDivider} />
            <View style={styles.macroCol}>
              <Text style={styles.macroValue}>{Math.round(totals.carbs)}g</Text>
              <Text style={styles.macroUnit}>Carbs</Text>
              {!!profile?.goal_carbs_g && (
                <Text style={styles.macroGoal}>/ {profile.goal_carbs_g}g</Text>
              )}
            </View>
            <View style={styles.macroDivider} />
            <View style={styles.macroCol}>
              <Text style={styles.macroValue}>{Math.round(totals.fat)}g</Text>
              <Text style={styles.macroUnit}>Fats</Text>
              {!!profile?.goal_fat_g && (
                <Text style={styles.macroGoal}>/ {profile.goal_fat_g}g</Text>
              )}
            </View>
          </View>
        </View>

        {/* Calories burned section */}
        <View style={styles.burnCard}>
          <View style={styles.burnCardHeader}>
            <View style={styles.burnCardLeft}>
              <Ionicons name="flame-outline" size={20} color={colors.textSecondary} />
              <View>
                <Text style={styles.burnCardTitle}>Calories Burned</Text>
                <Text style={styles.burnCardSub}>
                  {totalBurned > 0
                    ? `${totalBurned.toLocaleString()} cal burned today`
                    : 'Manually add activity calories'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={openAddBurn} hitSlop={10} activeOpacity={0.7}>
              <Ionicons name="add-circle-outline" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {calorieBurns.length > 0 && (
            <>
              <View style={styles.burnDivider} />
              {calorieBurns.map((burn, i) => (
                <View
                  key={burn.id}
                  style={[styles.burnEntryRow, i < calorieBurns.length - 1 && styles.burnEntryRowBorder]}
                >
                  <Text style={styles.burnEntryNotes} numberOfLines={1}>
                    {burn.notes || 'Manual activity'}
                  </Text>
                  <Text style={styles.burnEntryCal}>{burn.calories.toLocaleString()} cal</Text>
                  <TouchableOpacity onPress={() => openEditBurn(burn)} hitSlop={8} style={styles.burnEntryBtn}>
                    <Ionicons name="pencil-outline" size={15} color={colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteBurn(burn.id)} hitSlop={8} style={styles.burnEntryBtn}>
                    <Ionicons name="trash-outline" size={15} color={colors.accentRed} />
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}
        </View>

        {/* Meal cards or empty state */}
        {hasAnyMeals ? (
          MEAL_CONFIG.map(m => {
            const items = mealGroups[m.key] || []
            if (items.length === 0) return null
            const mealCal = items.reduce((acc, l) => acc + (l.calories || 0), 0)
            return (
              <View key={m.key} style={styles.card}>
                <View style={styles.mealCardHeader}>
                  <Text style={styles.mealCardTitle}>{m.label}</Text>
                  <Text style={styles.mealCardTotal}>{Math.round(mealCal)} cal</Text>
                </View>
                <View style={styles.divider} />
                {items.map((item, i) => (
                  <View
                    key={item.id || i}
                    style={[
                      styles.mealItemRow,
                      i < items.length - 1 && styles.mealItemRowBorder,
                    ]}
                  >
                    <View style={styles.mealItemInfo}>
                      <Text style={styles.mealItemName} numberOfLines={1}>
                        {item.foods?.name || 'Unknown food'}
                      </Text>
                      <Text style={styles.mealItemMacros}>
                        {`P ${Math.round(item.protein_g || 0)}g · C ${Math.round(item.carbs_g || 0)}g · F ${Math.round(item.fat_g || 0)}g`}
                      </Text>
                    </View>
                    <Text style={styles.mealItemCal}>{Math.round(item.calories || 0)} cal</Text>
                  </View>
                ))}
              </View>
            )
          })
        ) : (
          <View style={[styles.card, styles.emptyCard]}>
            <Ionicons name="nutrition-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No meals logged</Text>
            <Text style={styles.emptySubtitle}>
              Start tracking your nutrition by adding your first meal
            </Text>
          </View>
        )}
      </ScrollView>

      <LogBurnSheet
        visible={showBurnSheet}
        logDate={selectedDate}
        editEntry={editingBurn}
        onSaved={() => { setShowBurnSheet(false); refresh() }}
        onDismiss={() => setShowBurnSheet(false)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.md,
    paddingBottom: 32,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  pageTitle: {
    fontFamily: fonts.bold,
    fontSize: 32,
    color: colors.text,
  },
  pageSubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // CTA button
  ctaButton: {
    backgroundColor: colors.bgDark,
    borderRadius: radius.full,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  ctaButtonText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.textLight,
  },

  // Card
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },

  // Section label
  sectionLabel: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },

  // Calorie progress
  calRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  calLeft: {
    gap: 2,
  },
  calConsumed: {
    fontFamily: fonts.bold,
    fontSize: 40,
    color: colors.text,
    letterSpacing: -1,
    lineHeight: 44,
  },
  calConsumedOver: {
    color: colors.accentRed,
  },
  calConsumedUnit: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  calRight: {
    alignItems: 'flex-end',
    paddingBottom: 2,
    gap: 1,
  },
  calGoalNum: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.lg,
    color: colors.text,
    letterSpacing: -0.3,
  },
  calGoalLabel: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },

  // Burned + net row
  burnedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  burnedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  burnedLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.accentRed,
  },
  burnedDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  netLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },

  progressTrack: {
    height: 7,
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.bgDark,
    borderRadius: radius.full,
  },
  progressFillOver: {
    backgroundColor: colors.accentRed,
  },
  remainingLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  remainingLabelOver: {
    color: colors.accentRed,
  },

  // Macro row
  macroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.xs,
  },
  macroCol: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  macroValue: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xl,
    color: colors.text,
    lineHeight: 26,
  },
  macroUnit: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  macroGoal: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    opacity: 0.7,
  },
  macroDivider: {
    width: 1,
    height: 44,
    backgroundColor: colors.border,
  },

  // Calories burned section
  burnCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  burnCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  burnCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  burnCardTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  burnCardSub: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 1,
  },
  burnDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.md,
    marginBottom: 4,
  },
  burnEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    gap: spacing.sm,
  },
  burnEntryRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  burnEntryNotes: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  burnEntryCal: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.accentRed,
    flexShrink: 0,
  },
  burnEntryBtn: {
    padding: 2,
  },

  // Meal card
  mealCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  mealCardTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
  },
  mealCardTotal: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  mealItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    gap: spacing.sm,
  },
  mealItemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  mealItemInfo: {
    flex: 1,
    gap: 2,
  },
  mealItemName: {
    fontFamily: fonts.medium,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  mealItemMacros: {
    fontFamily: fonts.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  mealItemCal: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
    color: colors.text,
    flexShrink: 0,
  },

  // Empty state
  emptyCard: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  emptyTitle: {
    fontFamily: fonts.bold,
    fontSize: fontSize.md,
    color: colors.text,
  },
  emptySubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
})

// ---------------------------------------------------------------------------
// LogBurnSheet styles
// ---------------------------------------------------------------------------
const lbStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: 40,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: fontSize.xl,
    color: colors.text,
    letterSpacing: -0.3,
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  calInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  calInput: {
    flex: 1,
    height: 54,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.bold,
    fontSize: 28,
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  calUnit: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.lg,
    color: colors.textMuted,
    width: 36,
  },
  notesInput: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: fontSize.md,
    color: colors.text,
    minHeight: 72,
    marginBottom: spacing.lg,
    textAlignVertical: 'top',
  },
  saveBtn: {
    backgroundColor: colors.bgDark,
    borderRadius: radius.full,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  saveBtnText: {
    fontFamily: fonts.bold,
    fontSize: fontSize.md,
    color: colors.textLight,
    letterSpacing: -0.2,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  cancelText: {
    fontFamily: fonts.medium,
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
})
