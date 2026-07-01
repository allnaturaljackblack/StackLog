import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert, Switch, Image,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { supabase } from '../lib/supabase'
import {
  getCreatorSettings,
  upsertCreatorSettings,
  startStripeOnboarding,
  createStripeProduct,
} from '../lib/creatorApi'
import { colors, fonts, fontSize, spacing, radius } from '../utils/theme'

const MAX_TEASER_IMAGES = 3
const MIN_PRICE_CENTS   = 100  // $1.00

function centsToDisplay(cents) {
  if (!cents) return ''
  return (cents / 100).toFixed(2)
}

function displayToCents(str) {
  const n = parseFloat(str.replace(/[^0-9.]/g, ''))
  return isNaN(n) ? 0 : Math.round(n * 100)
}

export default function CreatorSetupScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const [userId,   setUserId]   = useState(null)
  const [settings, setSettings] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [onboarding, setOnboarding] = useState(false)

  // Form state
  const [isCreator,       setIsCreator]       = useState(false)
  const [paywallEnabled,  setPaywallEnabled]  = useState(false)
  const [monthlyPrice,    setMonthlyPrice]    = useState('')  // display string e.g. "9.99"
  const [annualPrice,     setAnnualPrice]     = useState('')
  const [teaserText,      setTeaserText]      = useState('')
  const [teaserImages,    setTeaserImages]    = useState([]) // array of { uri, remote? }
  const [stripeConnected, setStripeConnected] = useState(false)

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    setUserId(user.id)

    const s = await getCreatorSettings(user.id)
    if (s) {
      setSettings(s)
      setIsCreator(s.is_creator || false)
      setPaywallEnabled(s.paywall_enabled || false)
      setMonthlyPrice(centsToDisplay(s.monthly_price_cents))
      setAnnualPrice(centsToDisplay(s.annual_price_cents))
      setTeaserText(s.teaser_text || '')
      setStripeConnected(!!s.stripe_account_id && s.stripe_account_onboarded)
      setTeaserImages(
        (s.teaser_image_urls || []).map((url) => ({ uri: url, remote: true }))
      )
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Stripe onboarding ─────────────────────────────────────────────────────
  async function handleStripeConnect() {
    setOnboarding(true)
    try {
      const result = await startStripeOnboarding(userId)
      if (result.type === 'success') {
        // Reload to pick up stripe_account_id saved by edge function
        await load()
        Alert.alert('Stripe connected', 'Your payout account is set up. You can now enable your paywall.')
      }
    } catch (err) {
      Alert.alert('Stripe error', err.message)
    } finally {
      setOnboarding(false)
    }
  }

  // ── Image picker ──────────────────────────────────────────────────────────
  async function handleAddImage() {
    if (teaserImages.length >= MAX_TEASER_IMAGES) {
      Alert.alert('Limit reached', `You can add up to ${MAX_TEASER_IMAGES} teaser images.`)
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      aspect: [4, 3],
    })
    if (!result.canceled && result.assets?.[0]) {
      setTeaserImages((prev) => [...prev, { uri: result.assets[0].uri, remote: false }])
    }
  }

  function handleRemoveImage(index) {
    setTeaserImages((prev) => prev.filter((_, i) => i !== index))
  }

  // ── Upload teaser images to Supabase Storage ──────────────────────────────
  async function uploadTeaserImages() {
    const urls = []
    for (const img of teaserImages) {
      if (img.remote) {
        urls.push(img.uri) // already uploaded
        continue
      }
      const ext      = img.uri.split('.').pop() || 'jpg'
      const path     = `teaser/${userId}/${Date.now()}.${ext}`
      const base64   = await FileSystem.readAsStringAsync(img.uri, { encoding: 'base64' })
      const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`

      const { error } = await supabase.storage
        .from('media')
        .upload(path, decode(base64), { contentType: mimeType, upsert: true })

      if (error) throw error

      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path)
      urls.push(publicUrl)
    }
    return urls
  }

  // base64 → Uint8Array helper
  function decode(base64) {
    const binary = atob(base64)
    const bytes  = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    const monthlyCents = displayToCents(monthlyPrice)
    const annualCents  = displayToCents(annualPrice)

    if (isCreator && paywallEnabled) {
      if (monthlyCents < MIN_PRICE_CENTS) {
        Alert.alert('Invalid price', 'Monthly price must be at least $1.00')
        return
      }
      if (!stripeConnected) {
        Alert.alert('Connect Stripe first', 'You need to connect your payout account before enabling your paywall.')
        return
      }
    }

    setSaving(true)
    try {
      // Upload any new teaser images
      const imageUrls = await uploadTeaserImages()

      // Save settings
      await upsertCreatorSettings(userId, {
        is_creator:        isCreator,
        paywall_enabled:   isCreator ? paywallEnabled : false,
        monthly_price_cents: monthlyCents || null,
        annual_price_cents:  annualCents  || null,
        teaser_text:         teaserText.trim() || null,
        teaser_image_urls:   imageUrls,
      })

      // If price changed and Stripe is connected, update Stripe product
      const priceChanged =
        monthlyCents !== settings?.monthly_price_cents ||
        annualCents  !== settings?.annual_price_cents

      if (stripeConnected && monthlyCents >= MIN_PRICE_CENTS && priceChanged) {
        await createStripeProduct(userId, monthlyCents, annualCents || null)
      }

      await load()
      Alert.alert('Saved', 'Your creator settings have been updated.')
    } catch (err) {
      Alert.alert('Save failed', err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.text} />
      </View>
    )
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Creator Setup</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={12}>
          {saving
            ? <ActivityIndicator size="small" color={colors.text} />
            : <Text style={styles.saveBtn}>Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* ── Section: Creator mode ──────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CREATOR MODE</Text>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Enable creator mode</Text>
              <Text style={styles.toggleSub}>
                Let followers subscribe to access your full programming.
              </Text>
            </View>
            <Switch
              value={isCreator}
              onValueChange={setIsCreator}
              trackColor={{ true: colors.bgDark }}
              thumbColor={colors.textLight}
            />
          </View>
        </View>

        {isCreator && (
          <>
            {/* ── Section: Stripe Connect ──────────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>PAYOUT ACCOUNT</Text>
              {stripeConnected ? (
                <View style={styles.stripeConnectedRow}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                  <Text style={styles.stripeConnectedText}>Stripe account connected</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.sectionHint}>
                    Connect your bank account to receive subscription payments. Powered by Stripe.
                  </Text>
                  <TouchableOpacity
                    style={[styles.stripeBtn, onboarding && styles.btnDisabled]}
                    onPress={handleStripeConnect}
                    disabled={onboarding}
                    activeOpacity={0.8}
                  >
                    {onboarding
                      ? <ActivityIndicator size="small" color={colors.textLight} />
                      : <>
                          <Ionicons name="card-outline" size={18} color={colors.textLight} />
                          <Text style={styles.stripeBtnText}>Connect Bank Account</Text>
                        </>}
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* ── Section: Pricing ─────────────────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>SUBSCRIPTION PRICING</Text>
              <Text style={styles.sectionHint}>
                Set what your followers pay to access your programming.
              </Text>

              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Monthly</Text>
                <View style={styles.priceInputWrap}>
                  <Text style={styles.priceCurrency}>$</Text>
                  <TextInput
                    style={styles.priceInput}
                    value={monthlyPrice}
                    onChangeText={setMonthlyPrice}
                    keyboardType="decimal-pad"
                    placeholder="9.99"
                    placeholderTextColor={colors.textMuted}
                    returnKeyType="done"
                  />
                  <Text style={styles.priceUnit}>/mo</Text>
                </View>
              </View>

              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Annual{'\n'}<Text style={styles.priceLabelSub}>(optional)</Text></Text>
                <View style={styles.priceInputWrap}>
                  <Text style={styles.priceCurrency}>$</Text>
                  <TextInput
                    style={styles.priceInput}
                    value={annualPrice}
                    onChangeText={setAnnualPrice}
                    keyboardType="decimal-pad"
                    placeholder="99.99"
                    placeholderTextColor={colors.textMuted}
                    returnKeyType="done"
                  />
                  <Text style={styles.priceUnit}>/yr</Text>
                </View>
              </View>
            </View>

            {/* ── Section: Teaser content ──────────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>SUBSCRIBER PITCH</Text>
              <Text style={styles.sectionHint}>
                This is what non-subscribers see instead of your programming.
                Make it compelling.
              </Text>

              {/* Teaser images */}
              <View style={styles.teaserImageRow}>
                {teaserImages.map((img, i) => (
                  <View key={i} style={styles.teaserImageWrap}>
                    <Image source={{ uri: img.uri }} style={styles.teaserImage} />
                    <TouchableOpacity
                      style={styles.teaserImageRemove}
                      onPress={() => handleRemoveImage(i)}
                    >
                      <Ionicons name="close-circle" size={20} color={colors.accentRed} />
                    </TouchableOpacity>
                  </View>
                ))}
                {teaserImages.length < MAX_TEASER_IMAGES && (
                  <TouchableOpacity style={styles.teaserImageAdd} onPress={handleAddImage}>
                    <Ionicons name="add" size={24} color={colors.textMuted} />
                    <Text style={styles.teaserImageAddText}>Add Photo</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Teaser text */}
              <TextInput
                style={styles.teaserTextInput}
                value={teaserText}
                onChangeText={setTeaserText}
                placeholder="Tell potential subscribers what they'll get access to..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
            </View>

            {/* ── Section: Enable paywall ──────────────────────────────── */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>PAYWALL</Text>
              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleLabel}>Enable paywall</Text>
                  <Text style={styles.toggleSub}>
                    Non-subscribers will see your pitch instead of your full programming.
                  </Text>
                </View>
                <Switch
                  value={paywallEnabled}
                  onValueChange={setPaywallEnabled}
                  trackColor={{ true: colors.bgDark }}
                  thumbColor={colors.textLight}
                  disabled={!stripeConnected}
                />
              </View>
              {!stripeConnected && (
                <Text style={styles.paywallBlockedNote}>
                  Connect your payout account above to enable the paywall.
                </Text>
              )}
            </View>
          </>
        )}

        {/* Bottom padding */}
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: colors.bg,
  },
  centered: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: colors.bg,
  },

  // Header
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontFamily: fonts.semiBold,
    fontSize:   fontSize.md,
    color:      colors.text,
  },
  saveBtn: {
    fontFamily: fonts.semiBold,
    fontSize:   fontSize.sm,
    color:      colors.text,
  },

  scroll: {
    padding: spacing.md,
    gap:     spacing.md,
  },

  // Section
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontFamily:    fonts.semiBold,
    fontSize:      fontSize.xs,
    color:         colors.textMuted,
    letterSpacing: 0.8,
  },
  sectionHint: {
    fontFamily: fonts.regular,
    fontSize:   fontSize.sm,
    color:      colors.textSecondary,
    lineHeight: 20,
  },

  // Toggle rows
  toggleRow: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    backgroundColor: colors.bgCard,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         spacing.md,
    gap:             spacing.sm,
  },
  toggleInfo: {
    flex: 1,
    gap:  2,
  },
  toggleLabel: {
    fontFamily: fonts.medium,
    fontSize:   fontSize.md,
    color:      colors.text,
  },
  toggleSub: {
    fontFamily: fonts.regular,
    fontSize:   fontSize.sm,
    color:      colors.textSecondary,
  },

  // Stripe connect
  stripeConnectedRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
    padding:       spacing.md,
    backgroundColor: colors.success + '12',
    borderRadius:  radius.md,
    borderWidth:   1,
    borderColor:   colors.success + '30',
  },
  stripeConnectedText: {
    fontFamily: fonts.medium,
    fontSize:   fontSize.sm,
    color:      colors.success,
  },
  stripeBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             spacing.sm,
    backgroundColor: '#635BFF', // Stripe purple
    borderRadius:    radius.full,
    paddingVertical: spacing.sm + 2,
  },
  stripeBtnText: {
    fontFamily: fonts.semiBold,
    fontSize:   fontSize.sm,
    color:      colors.textLight,
  },
  btnDisabled: {
    opacity: 0.5,
  },

  // Pricing
  priceRow: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    backgroundColor: colors.bgCard,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         spacing.md,
  },
  priceLabel: {
    fontFamily: fonts.medium,
    fontSize:   fontSize.sm,
    color:      colors.text,
  },
  priceLabelSub: {
    fontFamily: fonts.regular,
    fontSize:   fontSize.xs,
    color:      colors.textMuted,
  },
  priceInputWrap: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },
  priceCurrency: {
    fontFamily: fonts.semiBold,
    fontSize:   fontSize.md,
    color:      colors.text,
  },
  priceInput: {
    fontFamily: fonts.semiBold,
    fontSize:   fontSize.md,
    color:      colors.text,
    minWidth:   80,
    textAlign:  'right',
    padding:    0,
  },
  priceUnit: {
    fontFamily: fonts.regular,
    fontSize:   fontSize.sm,
    color:      colors.textMuted,
  },

  // Teaser images
  teaserImageRow: {
    flexDirection: 'row',
    gap:           spacing.sm,
    flexWrap:      'wrap',
  },
  teaserImageWrap: {
    position: 'relative',
  },
  teaserImage: {
    width:        100,
    height:       75,
    borderRadius: radius.sm,
  },
  teaserImageRemove: {
    position: 'absolute',
    top:      -8,
    right:    -8,
  },
  teaserImageAdd: {
    width:           100,
    height:          75,
    borderRadius:    radius.sm,
    borderWidth:     1,
    borderColor:     colors.border,
    borderStyle:     'dashed',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             2,
  },
  teaserImageAddText: {
    fontFamily: fonts.regular,
    fontSize:   fontSize.xs,
    color:      colors.textMuted,
  },

  // Teaser text
  teaserTextInput: {
    backgroundColor: colors.bgCard,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         spacing.md,
    fontFamily:      fonts.regular,
    fontSize:        fontSize.sm,
    color:           colors.text,
    minHeight:       120,
    lineHeight:      22,
  },

  // Paywall blocked note
  paywallBlockedNote: {
    fontFamily: fonts.regular,
    fontSize:   fontSize.xs,
    color:      colors.warn,
    marginTop:  4,
  },
})
