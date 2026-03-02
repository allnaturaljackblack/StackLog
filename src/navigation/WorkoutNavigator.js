import { createNativeStackNavigator } from '@react-navigation/native-stack'
import WorkoutSearchScreen from '../screens/workout/WorkoutSearchScreen'
import WorkoutLogScreen from '../screens/workout/WorkoutLogScreen'

const Stack = createNativeStackNavigator()

export default function WorkoutNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="WorkoutSession" component={WorkoutLogScreen} />
      <Stack.Screen name="WorkoutSearch" component={WorkoutSearchScreen} />
    </Stack.Navigator>
  )
}
