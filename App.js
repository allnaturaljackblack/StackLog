import { useState, useEffect, useCallback } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { View } from 'react-native'
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter'
import * as SplashScreen from 'expo-splash-screen'
import { supabase } from './src/lib/supabase'
import TabNavigator from './src/navigation/TabNavigator'
import LoginScreen from './src/screens/auth/LoginScreen'
import SignupScreen from './src/screens/auth/SignupScreen'
import OnboardingNavigator from './src/navigation/OnboardingNavigator'
import FoodNavigator from './src/navigation/FoodNavigator'
import WorkoutNavigator from './src/navigation/WorkoutNavigator'
import UserProfileScreen from './src/screens/UserProfileScreen'
import IntegrationsScreen from './src/screens/IntegrationsScreen'
import CreatorSetupScreen from './src/screens/CreatorSetupScreen'
import useSync from './src/hooks/useSync'

SplashScreen.preventAutoHideAsync()

// Returns local date as 'YYYY-MM-DD' (avoids UTC-rollover bug)
function getLocalToday() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

// Infers a sensible meal type from the current hour
function getDefaultMealType() {
  const h = new Date().getHours()
  if (h >= 5  && h < 11) return 'breakfast'
  if (h >= 11 && h < 14) return 'lunch'
  if (h >= 14 && h < 17) return 'snack'
  if (h >= 17 && h < 21) return 'dinner'
  return 'snack' // late night
}

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

function MainApp({ userId }) {
  // Auto-sync fitness integrations whenever the app opens with an active session
  useSync(userId)

  function TabsScreen({ navigation }) {
    return (
      <TabNavigator
        onPressAddWorkout={(logDate) =>
          navigation.navigate('WorkoutLog', {
            screen: 'WorkoutSession',
            params: { logDate: logDate || getLocalToday() },
          })
        }
        onPressAddFood={({ mealType, logDate } = {}) =>
          navigation.navigate('FoodLog', {
            screen: 'FoodSearch',
            params: {
              mealType: mealType || null,
              logDate: logDate || getLocalToday(),
            },
          })
        }
      />
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
      <MainStack.Screen name="UserProfile"    component={UserProfileScreen} />
      <MainStack.Screen name="Integrations"  component={IntegrationsScreen} />
      <MainStack.Screen name="CreatorSetup"  component={CreatorSetupScreen} />
    </MainStack.Navigator>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [onboardingCompleted, setOnboardingCompleted] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
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
    <NavigationContainer>
      <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
        {!session
          ? <AuthNavigator />
          : !onboardingCompleted
          ? <OnboardingNavigator onComplete={() => checkOnboarding(session.user.id)} />
          : <MainApp userId={session.user.id} />
        }
      </View>
    </NavigationContainer>
  )
}
