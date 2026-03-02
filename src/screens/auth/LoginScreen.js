import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert
} from 'react-native'
import { supabase } from '../../lib/supabase'
import { colors, fontSize, spacing, radius } from '../../utils/theme'

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) Alert.alert('Login failed', error.message)
    setLoading(false)
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>

        {/* Logo / wordmark */}
        <View style={styles.header}>
          <Text style={styles.logo}>STACK</Text>
          <View style={styles.logoBadge}>
            <Text style={styles.logoAccent}>LOG</Text>
          </View>
        </View>
        <Text style={styles.tagline}>Track what you eat. Log how you train.{'\n'}Share your journey.</Text>

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>EMAIL</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          </View>

          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>PASSWORD</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              autoComplete="password"
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.buttonText}>
              {loading ? 'SIGNING IN...' : 'SIGN IN'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('Signup')}
          >
            <Text style={styles.secondaryText}>
              No account? <Text style={styles.secondaryTextBold}>Create one →</Text>
            </Text>
          </TouchableOpacity>
        </View>

      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  inner: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: 6,
  },
  logo: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 48,
    color: colors.text,
    letterSpacing: -1,
  },
  logoBadge: {
    backgroundColor: colors.accentRed,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
  },
  logoAccent: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 48,
    color: colors.textLight,
    letterSpacing: -1,
  },
  tagline: {
    fontFamily: 'Barlow_400Regular',
    fontSize: fontSize.md,
    color: colors.textMuted,
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  form: {
    gap: spacing.md,
  },
  inputWrapper: {
    gap: spacing.xs,
  },
  inputLabel: {
    fontFamily: 'Barlow_700Bold',
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    fontFamily: 'Barlow_400Regular',
    fontSize: fontSize.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    backgroundColor: colors.accentRed,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: fontSize.lg,
    color: colors.textLight,
    letterSpacing: 1,
  },
  secondaryButton: {
    alignItems: 'center',
    padding: spacing.sm,
  },
  secondaryText: {
    fontFamily: 'Barlow_400Regular',
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  secondaryTextBold: {
    fontFamily: 'Barlow_700Bold',
    color: colors.text,
  },
})