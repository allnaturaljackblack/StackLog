import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { colors, spacing, radius, fontSize } from '../../utils/theme'

export default function OnboardingWelcome({ navigation }) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>STACK</Text>
          <View style={styles.logoBadge}>
            <Text style={styles.logoAccent}>LOG</Text>
          </View>
        </View>

        <Text style={styles.headline}>
          Track what you eat.{'\n'}
          Log how you train.{'\n'}
          Share your journey.
        </Text>

        <Text style={styles.sub}>
          The only app that combines nutrition tracking, workout logging, and a social feed built for real athletes.
        </Text>
      </View>

      <View style={styles.bottom}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('BasicInfo')}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>GET STARTED</Text>
        </TouchableOpacity>
        <Text style={styles.steps}>Step 1 of 8</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
    padding: spacing.lg,
    paddingTop: 80,
    justifyContent: 'space-between',
  },
  content: { gap: spacing.lg },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logoText: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 52,
    color: colors.textLight,
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
    fontSize: 52,
    color: colors.textLight,
    letterSpacing: -1,
  },
  headline: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 44,
    color: colors.textLight,
    letterSpacing: -1,
    lineHeight: 48,
  },
  sub: {
    fontFamily: 'Barlow_400Regular',
    fontSize: fontSize.md,
    color: '#888',
    lineHeight: 24,
  },
  bottom: { gap: spacing.md },
  button: {
    backgroundColor: colors.accentRed,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: fontSize.lg,
    color: colors.textLight,
    letterSpacing: 1,
  },
  steps: {
    fontFamily: 'Barlow_400Regular',
    fontSize: fontSize.xs,
    color: '#666',
    textAlign: 'center',
  },
})