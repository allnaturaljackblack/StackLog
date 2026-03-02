import { createNativeStackNavigator } from '@react-navigation/native-stack'
import OnboardingWelcome from '../screens/onboarding/OnboardingWelcome'
import OnboardingBasicInfo from '../screens/onboarding/OnboardingBasicInfo'
import OnboardingBodyMetrics from '../screens/onboarding/OnboardingBodyMetrics'
import OnboardingGoal from '../screens/onboarding/OnboardingGoal'
import OnboardingActivityLevel from '../screens/onboarding/OnboardingActivityLevel'
import OnboardingTargets from '../screens/onboarding/OnboardingTargets'
import OnboardingPrivacy from '../screens/onboarding/OnboardingPrivacy'
import OnboardingFirstMeal from '../screens/onboarding/OnboardingFirstMeal'
import OnboardingComplete from '../screens/onboarding/OnboardingComplete'

const Stack = createNativeStackNavigator()

export default function OnboardingNavigator({ onComplete }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="Welcome" component={OnboardingWelcome} />
      <Stack.Screen name="BasicInfo" component={OnboardingBasicInfo} />
      <Stack.Screen name="BodyMetrics" component={OnboardingBodyMetrics} />
      <Stack.Screen name="Goal" component={OnboardingGoal} />
      <Stack.Screen name="ActivityLevel" component={OnboardingActivityLevel} />
      <Stack.Screen name="Targets" component={OnboardingTargets} />
      <Stack.Screen name="Privacy" component={OnboardingPrivacy} />
      <Stack.Screen name="FirstMeal" component={OnboardingFirstMeal} />
      <Stack.Screen
        name="Complete"
        children={(props) => <OnboardingComplete {...props} onComplete={onComplete} />}
      />
    </Stack.Navigator>
  )
}