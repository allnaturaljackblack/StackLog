import { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { supabase } from '../../lib/supabase'
import { colors, spacing, radius, fontSize } from '../../utils/theme'

const MEAL_ICONS = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack: '🍎',
  dessert: '🍰',
}

export default function MealDetailScreen({ navigation, route }) {
  const { mealType, logDate, userId } = route.params
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useFocusEffect(
    useCallback(() => {
      fetchLogs()
    }, [])
  )

  async function fetchLogs() {
    setLoading(true)
    const { data } = await supabase
      .from('food_logs')
      .select(`
        *,
        foods (
          id, name, brand, calories_per_100g,
          protein_per_100g, carbs_per_100g, fat_per_100g,
          fiber_per_100g, sugar_per_100g, sodium_per_100g,
          serving_description, source, external_id
        )
      `)
      .eq('user_id', userId)
      .eq('log_date', logDate)
      .eq('meal_type', mealType)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    setLogs(data || [])
    setLoading(false)
  }

  async function handleDelete(logId) {
    await supabase
      .from('food_logs')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', logId)
    fetchLogs()
  }

  function handleEdit(log) {
    const food = {
      ...log.foods,
      external_id: log.foods?.external_id || String(log.food_id),
    }
    navigation.navigate('FoodDetail', {
      food,
      mealType,
      logDate,
      userId,
      existingLog: log,
    })
  }

  const totalCal     = logs.reduce((acc, l) => acc + (l.calories  || 0), 0)
  const totalProtein = logs.reduce((acc, l) => acc + (l.protein_g || 0), 0)
  const totalCarbs   = logs.reduce((acc, l) => acc + (l.carbs_g   || 0), 0)
  const totalFat     = logs.reduce((acc, l) => acc + (l.fat_g     || 0), 0)

  const mealLabel = mealType.charAt(0).toUpperCase() + mealType.slice(1)

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerIcon}>{MEAL_ICONS[mealType]}</Text>
          <Text style={styles.headerTitle}>{mealLabel}</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('FoodSearch', { mealType, logDate, userId })}
        >
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Totals bar */}
      {logs.length > 0 && (
        <View style={styles.totalsBar}>
          <View style={styles.totalItem}>
            <Text style={styles.totalValue}>{Math.round(totalCal)}</Text>
            <Text style={styles.totalLabel}>cal</Text>
          </View>
          <View style={styles.totalDivider} />
          <View style={styles.totalItem}>
            <Text style={[styles.totalValue, { color: colors.accentRed }]}>{Math.round(totalProtein)}g</Text>
            <Text style={styles.totalLabel}>protein</Text>
          </View>
          <View style={styles.totalDivider} />
          <View style={styles.totalItem}>
            <Text style={[styles.totalValue, { color: colors.accentBlue }]}>{Math.round(totalCarbs)}g</Text>
            <Text style={styles.totalLabel}>carbs</Text>
          </View>
          <View style={styles.totalDivider} />
          <View style={styles.totalItem}>
            <Text style={[styles.totalValue, { color: colors.warn }]}>{Math.round(totalFat)}g</Text>
            <Text style={styles.totalLabel}>fat</Text>
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.accentRed} />
        </View>
      ) : logs.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Nothing logged yet</Text>
          <Text style={styles.emptyText}>Tap + Add to log food for {mealLabel.toLowerCase()}</Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => navigation.navigate('FoodSearch', { mealType, logDate, userId })}
          >
            <Text style={styles.emptyBtnText}>+ ADD FOOD</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {logs.map(log => (
            <View key={log.id} style={styles.logRow}>
              <TouchableOpacity
                style={styles.logInfo}
                onPress={() => handleEdit(log)}
                activeOpacity={0.7}
              >
                <Text style={styles.logName} numberOfLines={1}>
                  {log.foods?.name || 'Unknown food'}
                </Text>
                <Text style={styles.logMeta}>
                  {log.quantity_unit_display}
                  {log.foods?.brand ? ` · ${log.foods.brand}` : ''}
                </Text>
              </TouchableOpacity>
              <View style={styles.logRight}>
                <Text style={styles.logCal}>{Math.round(log.calories)}</Text>
                <Text style={styles.logCalLabel}>cal</Text>
              </View>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => handleDelete(log.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.deleteBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md, justifyContent: 'space-between' },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 18, color: colors.text },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerIcon: { fontSize: 20 },
  headerTitle: { fontFamily: 'BarlowCondensed_900Black', fontSize: 24, color: colors.text, letterSpacing: -0.3 },
  addBtn: { backgroundColor: colors.bgDark, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  addBtnText: { fontFamily: 'BarlowCondensed_700Bold', fontSize: fontSize.sm, color: colors.textLight },

  totalsBar: { flexDirection: 'row', backgroundColor: colors.bgCard, marginHorizontal: spacing.lg, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, alignItems: 'center', justifyContent: 'space-around' },
  totalItem: { alignItems: 'center' },
  totalValue: { fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: 20, color: colors.text, letterSpacing: -0.5 },
  totalLabel: { fontFamily: 'Barlow_400Regular', fontSize: 10, color: colors.textMuted },
  totalDivider: { width: 1, height: 28, backgroundColor: colors.border },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  emptyTitle: { fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: 22, color: colors.text },
  emptyText: { fontFamily: 'Barlow_400Regular', fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
  emptyBtn: { backgroundColor: colors.bgDark, borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, marginTop: spacing.sm },
  emptyBtnText: { fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: fontSize.md, color: colors.textLight, letterSpacing: 0.5 },

  list: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  logRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, gap: spacing.sm },
  logInfo: { flex: 1 },
  logName: { fontFamily: 'Barlow_600SemiBold', fontSize: fontSize.md, color: colors.text },
  logMeta: { fontFamily: 'Barlow_400Regular', fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  logRight: { alignItems: 'flex-end' },
  logCal: { fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: 18, color: colors.text },
  logCalLabel: { fontFamily: 'Barlow_400Regular', fontSize: 10, color: colors.textMuted },
  deleteBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  deleteBtnText: { fontSize: 11, color: colors.textMuted },
})