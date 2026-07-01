import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FeedScreen from '../screens/FeedScreen'
import NutritionScreen from '../screens/NutritionScreen'
import ExerciseScreen from '../screens/ExerciseScreen'
import ExploreScreen from '../screens/ExploreScreen'
import ProfileScreen from '../screens/ProfileScreen'
import { colors, fonts, fontSize } from '../utils/theme'

const Tab = createBottomTabNavigator()

const TAB_CONFIG = [
  { name: 'Feed',      icon: 'home',      label: 'Feed'      },
  { name: 'Nutrition', icon: 'nutrition',  label: 'Nutrition' },
  { name: 'Exercise',  icon: 'barbell',    label: 'Exercise'  },
  { name: 'Explore',   icon: 'people',     label: 'Explore'   },
  { name: 'Profile',   icon: 'person',     label: 'Profile'   },
]

function CustomTabBar({ state, navigation }) {
  const insets = useSafeAreaInsets()
  const bottomPad = Math.max(insets.bottom, 8)

  return (
    <View style={[styles.tabBarWrapper, { paddingBottom: bottomPad }]}>
      <View style={styles.tabBar}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index
          const config = TAB_CONFIG.find(t => t.name === route.name) || TAB_CONFIG[0]

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name)
            }
          }

          return (
            <TouchableOpacity
              key={route.key}
              style={styles.tabItem}
              onPress={onPress}
              activeOpacity={0.8}
            >
              <View style={[styles.pill, isFocused && styles.pillActive]}>
                <Ionicons
                  name={isFocused ? config.icon : `${config.icon}-outline`}
                  size={20}
                  color={isFocused ? colors.textLight : colors.textMuted}
                />
                {isFocused && (
                  <Text style={styles.pillLabel} numberOfLines={1}>{config.label}</Text>
                )}
              </View>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

export default function TabNavigator({ onPressAddWorkout, onPressAddFood }) {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <CustomTabBar
          {...props}
          onPressAddWorkout={onPressAddWorkout}
          onPressAddFood={onPressAddFood}
        />
      )}
    >
      <Tab.Screen name="Feed"      component={FeedScreen}      />
      <Tab.Screen name="Nutrition" component={NutritionScreen} />
      <Tab.Screen name="Exercise"  component={ExerciseScreen}  />
      <Tab.Screen name="Explore"   component={ExploreScreen}   />
      <Tab.Screen name="Profile"   component={ProfileScreen}   />
    </Tab.Navigator>
  )
}

const styles = StyleSheet.create({
  tabBarWrapper: {
    backgroundColor: colors.bgCard,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    paddingHorizontal: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    minWidth: 44,
  },
  pillActive: {
    backgroundColor: colors.bgDark,
  },
  pillLabel: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.xs + 1,
    color: colors.textLight,
    letterSpacing: 0.1,
  },
})
