import { createNativeStackNavigator } from '@react-navigation/native-stack'
import WorkoutSearchScreen from '../screens/workout/WorkoutSearchScreen'
import WorkoutLogScreen from '../screens/workout/WorkoutLogScreen'
import ExerciseLogScreen from '../screens/workout/ExerciseLogScreen'

const Stack = createNativeStackNavigator()

export default function WorkoutNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="WorkoutSession" component={WorkoutLogScreen} />
      <Stack.Screen name="WorkoutSearch" component={WorkoutSearchScreen} />
      <Stack.Screen name="ExerciseLog" component={ExerciseLogScreen} />
    </Stack.Navigator>
  )
}
