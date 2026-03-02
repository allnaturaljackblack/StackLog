import { createNativeStackNavigator } from '@react-navigation/native-stack'
import FoodSearchScreen from '../screens/food/FoodSearchScreen'
import FoodDetailScreen from '../screens/food/FoodDetailScreen'
import MealDetailScreen from '../screens/food/MealDetailScreen'

const Stack = createNativeStackNavigator()

export default function FoodNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="FoodSearch" component={FoodSearchScreen} />
      <Stack.Screen name="FoodDetail" component={FoodDetailScreen} />
      <Stack.Screen name="MealDetail" component={MealDetailScreen} />
    </Stack.Navigator>
  )
}