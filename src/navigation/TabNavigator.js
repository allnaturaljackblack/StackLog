import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { colors, fontSize } from '../utils/theme'

// Placeholder screens — we'll replace these one by one
import HomeScreen from '../screens/HomeScreen'
import FeedScreen from '../screens/FeedScreen'
import NutritionScreen from '../screens/NutritionScreen'
import ExerciseScreen from '../screens/ExerciseScreen'

const Tab = createBottomTabNavigator()

function CustomTabBar({ state, descriptors, navigation, onPressLog }) {
  const tabs = [
    { name: 'Home', label: 'Home', icon: '⊙' },
    { name: 'Feed', label: 'Feed', icon: '◎' },
    { name: 'Log', label: '', icon: '+' },
    { name: 'Nutrition', label: 'Nutrition', icon: '◈' },
    { name: 'Exercise', label: 'Exercise', icon: '◆' },
  ]

  return (
    <View style={styles.tabBar}>
      {tabs.map((tab, index) => {
        const isLog = tab.name === 'Log'
        const routeIndex = isLog ? null : state.routes.findIndex(r => r.name === tab.name)
        const isActive = !isLog && state.index === routeIndex

        if (isLog) {
          return (
            <TouchableOpacity
              key="log"
              style={styles.tabItem}
              onPress={onPressLog}
              activeOpacity={0.8}
            >
              <View style={styles.logButton}>
                <Text style={styles.logButtonText}>+</Text>
              </View>
            </TouchableOpacity>
          )
        }

        return (
          <TouchableOpacity
            key={tab.name}
            style={styles.tabItem}
            onPress={() => navigation.navigate(tab.name)}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 18, opacity: isActive ? 1 : 0.35 }}>
              {tab.icon}
            </Text>
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

export default function TabNavigator({ onPressLog }) {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} onPressLog={onPressLog} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Feed" component={FeedScreen} />
      <Tab.Screen name="Nutrition" component={NutritionScreen} />
      <Tab.Screen name="Exercise" component={ExerciseScreen} />
    </Tab.Navigator>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    height: 82,
    backgroundColor: colors.bgCard,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabLabel: {
    fontFamily: 'Barlow_400Regular',
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tabLabelActive: {
    fontFamily: 'Barlow_700Bold',
    color: colors.accentRed,
  },
  logButton: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.accentRed,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -18,
    shadowColor: colors.accentRed,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
  },
  logButtonText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '300',
    marginTop: -2,
  },
})