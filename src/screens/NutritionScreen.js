import { View, Text } from 'react-native'
import { colors } from '../utils/theme'

export default function NutritionScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: 32 }}>Nutrition</Text>
    </View>
  )
}