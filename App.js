import { useState, useEffect, useCallback } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { View, Modal, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useFonts, Barlow_400Regular, Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold } from '@expo-google-fonts/barlow'
import { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold, BarlowCondensed_800ExtraBold, BarlowCondensed_900Black } from '@expo-google-fonts/barlow-condensed'
import * as SplashScreen from 'expo-splash-screen'
import { supabase } from './src/lib/supabase'
import TabNavigator from './src/navigation/TabNavigator'
import LoginScreen from './src/screens/auth/LoginScreen'
import SignupScreen from './src/screens/auth/SignupScreen'
import OnboardingNavigator from './src/navigation/OnboardingNavigator'
import FoodNavigator from './src/navigation/FoodNavigator'
import WorkoutNavigator from './src/navigation/WorkoutNavigator'
import { colors, spacing, radius } from './src/utils/theme'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Swipeable } from 'react-native-gesture-handler'

SplashScreen.preventAutoHideAsync()

const RootStack = createNativeStackNavigator()
const AuthStack = createNativeStackNavigator()
const MainStack = createNativeStackNavigator()

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
    </AuthStack.Navigator>
  )
}

function MainApp() {
  const [showLogSheet, setShowLogSheet] = useState(false)

  function TabsScreen({ navigation }) {
    return (
      <View style={{ flex: 1 }}>
        <TabNavigator onPressLog={() => setShowLogSheet(true)} />
        <Modal
          visible={showLogSheet}
          transparent
          animationType="slide"
          onRequestClose={() => setShowLogSheet(false)}
        >
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowLogSheet(false)}>
            <TouchableOpacity activeOpacity={1} style={styles.sheet}>
              <View style={styles.handle} />
              <Text style={styles.sheetTitle}>Quick Log</Text>
              <View style={styles.grid}>
                {[
                  { icon: '🥗', label: 'Log Food' },
                  { icon: '💪', label: 'Log Workout' },
                  { icon: '📅', label: 'Plan Meal' },
                  { icon: '⚖️', label: 'Log Weight' },
                ].map((opt) => (
                  <TouchableOpacity
                    key={opt.label}
                    style={styles.gridItem}
                    onPress={() => {
                      setShowLogSheet(false)
                      if (opt.label === 'Log Food') {
                        navigation.navigate('FoodLog', {
                          screen: 'FoodSearch',
                          params: {
                            mealType: 'breakfast',
                            logDate: new Date().toISOString().split('T')[0]
                          }
                        })
                      } else if (opt.label === 'Log Workout') {
                        navigation.navigate('WorkoutLog')
                      }
                    }}
                  >
                    <Text style={styles.gridIcon}>{opt.icon}</Text>
                    <Text style={styles.gridLabel}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </View>
    )
  }

  return (
    <MainStack.Navigator screenOptions={{ headerShown: false }}>
      <MainStack.Screen name="Tabs" component={TabsScreen} />
      <MainStack.Screen
        name="FoodLog"
        component={FoodNavigator}
        options={{ presentation: 'modal' }}
      />
      <MainStack.Screen
        name="WorkoutLog"
        component={WorkoutNavigator}
        options={{ presentation: 'modal' }}
      />
    </MainStack.Navigator>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [onboardingCompleted, setOnboardingCompleted] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)

  const [fontsLoaded] = useFonts({
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
    Barlow_700Bold,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
    BarlowCondensed_800ExtraBold,
    BarlowCondensed_900Black,
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) checkOnboarding(session.user.id)
      else setAuthLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) checkOnboarding(session.user.id)
      else {
        setOnboardingCompleted(false)
        setAuthLoading(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function checkOnboarding(userId) {
    setProfileLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', userId)
      .single()
    setOnboardingCompleted(data?.onboarding_completed || false)
    setProfileLoading(false)
    setAuthLoading(false)
  }

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded && !authLoading && !profileLoading) {
      await SplashScreen.hideAsync()
    }
  }, [fontsLoaded, authLoading, profileLoading])

  if (!fontsLoaded || authLoading || profileLoading) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
        <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
          {!session
            ? <AuthNavigator />
            : !onboardingCompleted
            ? <OnboardingNavigator onComplete={() => checkOnboarding(session.user.id)} />
            : <MainApp />
          }
        </View>
      </NavigationContainer>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: 40 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.lg },
  sheetTitle: { fontFamily: 'BarlowCondensed_900Black', fontSize: 24, letterSpacing: -0.3, marginBottom: spacing.md, color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  gridItem: { width: '47%', backgroundColor: colors.bg, borderRadius: radius.lg, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  gridIcon: { fontSize: 26 },
  gridLabel: { fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: 16, letterSpacing: -0.2, color: colors.text },
})