import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, ScrollView
} from 'react-native'
import { supabase } from '../../lib/supabase'
import { colors, fontSize, spacing, radius } from '../../utils/theme'

export default function SignupScreen({ navigation }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignup() {
    if (!email || !password || !username) {
      Alert.alert('Missing fields', 'Please fill in all fields.')
      return
    }
    if (username.length < 3) {
      Alert.alert('Username too short', 'Username must be at least 3 characters.')
      return
    }
    if (password.length < 6) {
      Alert.alert('Password too short', 'Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username, display_name: username }
      }
    })
    if (error) {
      Alert.alert('Signup failed', error.message)
    } else {
      Alert.alert(
        'Account created!',
        'Check your email to confirm your account, then sign in.',
        [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
      )
    }
    setLoading(false)
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">

        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Create your{'\n'}account.</Text>
        <Text style={styles.subtitle}>Free to start. No credit card required.</Text>

        <View style={styles.form}>
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>USERNAME</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="yourname"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.inputHint}>Letters, numbers, and underscores only</Text>
          </View>

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
              placeholder="Min. 6 characters"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignup}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.buttonText}>
              {loading ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT'}
            </Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  inner: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingTop: 60,
  },
  back: {
    marginBottom: spacing.xl,
  },
  backText: {
    fontFamily: 'Barlow_600SemiBold',
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  title: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 48,
    color: colors.text,
    letterSpacing: -1,
    lineHeight: 52,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontFamily: 'Barlow_400Regular',
    fontSize: fontSize.md,
    color: colors.textMuted,
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
  inputHint: {
    fontFamily: 'Barlow_400Regular',
    fontSize: fontSize.xs,
    color: colors.textMuted,
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
})