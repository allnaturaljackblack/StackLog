import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, FlatList, ActivityIndicator,
  Keyboard, Modal, Alert
} from 'react-native'
import { supabase } from '../../lib/supabase'
import { searchFoods, lookupBarcode } from '../../lib/foodApi'
import { getRecentFoods } from '../../lib/foodLog'
import { colors, spacing, radius, fontSize } from '../../utils/theme'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useState, useEffect, useRef } from 'react'

export default function FoodSearchScreen({ navigation, route }) {
  const { mealType, logDate } = route.params
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [recentFoods, setRecentFoods] = useState([])
  const [searching, setSearching] = useState(false)
  const [includeBranded, setIncludeBranded] = useState(false)
  const [userId, setUserId] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [permission, requestPermission] = useCameraPermissions()
  const scannedRef = useRef(false)

  useEffect(() => {
    loadInitialData()
  }, [])

  async function loadInitialData() {
    const { data: { user } } = await supabase.auth.getUser()
    setUserId(user.id)
    const recent = await getRecentFoods(user.id)
    setRecentFoods(recent)
  }

  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      return
    }
    const timer = setTimeout(() => handleSearch(query, includeBranded), 400)
    return () => clearTimeout(timer)
  }, [query, includeBranded])

  async function handleSearch(q, branded) {
    setSearching(true)
    const foods = await searchFoods(q, branded)
    setResults(foods)
    setSearching(false)
  }

  function handleSelectFood(food) {
    Keyboard.dismiss()
    navigation.navigate('FoodDetail', {
      food,
      mealType,
      logDate,
      userId,
    })
  }

  async function handleScanPress() {
    if (!permission?.granted) {
      const result = await requestPermission()
      if (!result.granted) return
    }
    scannedRef.current = false
    setScanning(true)
  }

  async function handleBarcodeScan({ data }) {
    if (scannedRef.current) return
    scannedRef.current = true
    setScanning(false)
    setSearching(true)
    const food = await lookupBarcode(data)
    setSearching(false)
    scannedRef.current = false
    if (food) {
      navigation.navigate('FoodDetail', { food, mealType, logDate, userId })
    } else {
      Alert.alert(
        'Not found',
        'No food found for that barcode. Try searching by name.',
        [{ text: 'OK', style: 'cancel' }]
      )
    }
  }

  function renderFood({ item }) {
    const cal = Math.round(item.calories_per_100g)
    return (
      <TouchableOpacity
        style={styles.foodRow}
        onPress={() => handleSelectFood(item)}
        activeOpacity={0.7}
      >
        <View style={styles.foodInfo}>
          <View style={styles.foodNameRow}>
            <Text style={styles.foodName} numberOfLines={1}>{item.name}</Text>
            {item.is_branded && (
              <View style={styles.brandedBadge}>
                <Text style={styles.brandedBadgeText}>BRAND</Text>
              </View>
            )}
          </View>
          {item.brand && <Text style={styles.foodBrand} numberOfLines={1}>{item.brand}</Text>}
        </View>
        <View style={styles.foodRight}>
          <Text style={styles.foodCal}>{cal}</Text>
          <Text style={styles.foodCalLabel}>cal/100g</Text>
        </View>
      </TouchableOpacity>
    )
  }

  const showRecent = query.length < 2 && recentFoods.length > 0
  const showResults = query.length >= 2
  const showEmpty = showResults && !searching && results.length === 0

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.mealBadge}>
          <Text style={styles.mealBadgeText}>{mealType.charAt(0).toUpperCase() + mealType.slice(1)}</Text>
        </View>
      </View>

      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search foods..."
          placeholderTextColor={colors.textMuted}
          autoFocus
          returnKeyType="search"
        />
        {searching && <ActivityIndicator size="small" color={colors.accentRed} />}
        {query.length > 0 && !searching && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Text style={styles.clearText}>✕</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={handleScanPress} style={styles.scanBtn}>
          <Text style={styles.scanBtnIcon}>▦</Text>
        </TouchableOpacity>
      </View>

      {showResults && !searching && (
        <TouchableOpacity
          style={styles.brandedToggle}
          onPress={() => setIncludeBranded(!includeBranded)}
        >
          <View style={[styles.toggleDot, includeBranded && styles.toggleDotActive]} />
          <Text style={styles.brandedToggleText}>
            {includeBranded ? 'Showing generic + branded' : 'Showing generic only — tap to include branded'}
          </Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={showResults ? results : showRecent ? recentFoods : []}
        keyExtractor={(item, i) => item.external_id || item.id || String(i)}
        renderItem={renderFood}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            {showRecent && <Text style={styles.listHeader}>RECENTLY LOGGED</Text>}
            {showResults && !searching && results.length > 0 && (
              <Text style={styles.listHeader}>
                {results.filter(r => !r.is_branded).length} GENERIC · {results.filter(r => r.is_branded).length} BRANDED
              </Text>
            )}
          </>
        }
        ListEmptyComponent={
          showEmpty ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No results found</Text>
              <Text style={styles.emptyText}>Try a different search or enable branded results</Text>
              {!includeBranded && (
                <TouchableOpacity
                  style={styles.emptyAction}
                  onPress={() => setIncludeBranded(true)}
                >
                  <Text style={styles.emptyActionText}>Include branded foods</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            onBarcodeScanned={handleBarcodeScan}
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr'] }}
          />
          <View style={scanStyles.overlay}>
            <View style={scanStyles.frame} />
            <Text style={scanStyles.hint}>Point at a barcode</Text>
          </View>
          <TouchableOpacity style={scanStyles.closeBtn} onPress={() => setScanning(false)}>
            <Text style={scanStyles.closeBtnText}>✕ Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.sm, gap: spacing.md },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 14, color: colors.text },
  mealBadge: { backgroundColor: colors.bgDark, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  mealBadgeText: { fontFamily: 'BarlowCondensed_700Bold', fontSize: fontSize.sm, color: colors.textLight, letterSpacing: 0.5 },

  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, marginHorizontal: spacing.lg, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xs },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, fontFamily: 'Barlow_400Regular', fontSize: fontSize.md, color: colors.text },
  clearText: { fontSize: 14, color: colors.textMuted, padding: 4 },
  scanBtn: { padding: 4 },
  scanBtnIcon: { fontSize: 20, color: colors.textMuted },

  brandedToggle: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm },
  toggleDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.border, borderWidth: 1, borderColor: colors.textMuted },
  toggleDotActive: { backgroundColor: colors.accentRed, borderColor: colors.accentRed },
  brandedToggleText: { fontFamily: 'Barlow_400Regular', fontSize: fontSize.xs, color: colors.textMuted },

  list: { paddingHorizontal: spacing.lg, paddingBottom: 40 },
  listHeader: { fontFamily: 'Barlow_700Bold', fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1, marginBottom: spacing.sm, marginTop: spacing.sm },

  foodRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.md },
  foodInfo: { flex: 1 },
  foodNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
  foodName: { fontFamily: 'Barlow_600SemiBold', fontSize: fontSize.md, color: colors.text, flexShrink: 1 },
  brandedBadge: { backgroundColor: colors.border, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  brandedBadgeText: { fontFamily: 'Barlow_700Bold', fontSize: 9, color: colors.textMuted, letterSpacing: 0.5 },
  foodBrand: { fontFamily: 'Barlow_400Regular', fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  foodRight: { alignItems: 'flex-end' },
  foodCal: { fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: 18, color: colors.text },
  foodCalLabel: { fontFamily: 'Barlow_400Regular', fontSize: 10, color: colors.textMuted },

  separator: { height: 1, backgroundColor: colors.border },

  emptyState: { alignItems: 'center', paddingTop: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: 20, color: colors.text },
  emptyText: { fontFamily: 'Barlow_400Regular', fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
  emptyAction: { backgroundColor: colors.bgDark, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, marginTop: spacing.sm },
  emptyActionText: { fontFamily: 'BarlowCondensed_700Bold', fontSize: fontSize.sm, color: colors.textLight },
})

const scanStyles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 240, height: 160, borderWidth: 2, borderColor: colors.accent, borderRadius: radius.md },
  hint: { fontFamily: 'Barlow_600SemiBold', fontSize: fontSize.md, color: '#fff', marginTop: spacing.lg },
  closeBtn: { position: 'absolute', bottom: 60, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: radius.full, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  closeBtnText: { fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: fontSize.lg, color: '#fff', letterSpacing: 0.5 },
})