import { useState, useMemo } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
  SectionList,
} from 'react-native'
import { colors, spacing, radius, fontSize } from '../../utils/theme'

// ---------------------------------------------------------------------------
// Exercise library — grouped by muscle group
// ---------------------------------------------------------------------------
const EXERCISE_LIBRARY = [
  {
    muscleGroup: 'Chest',
    exercises: [
      'Barbell Bench Press',
      'Incline Barbell Press',
      'Decline Barbell Press',
      'Dumbbell Bench Press',
      'Incline Dumbbell Press',
      'Dumbbell Fly',
      'Cable Fly',
      'Push-Up',
      'Dips (Chest)',
      'Machine Chest Press',
    ],
  },
  {
    muscleGroup: 'Back',
    exercises: [
      'Pull-Up',
      'Chin-Up',
      'Barbell Row',
      'Dumbbell Row',
      'Seated Cable Row',
      'Lat Pulldown',
      'T-Bar Row',
      'Deadlift',
      'Romanian Deadlift',
      'Face Pull',
      'Straight-Arm Pulldown',
    ],
  },
  {
    muscleGroup: 'Shoulders',
    exercises: [
      'Overhead Press (Barbell)',
      'Dumbbell Shoulder Press',
      'Arnold Press',
      'Lateral Raise',
      'Front Raise',
      'Rear Delt Fly',
      'Upright Row',
      'Cable Lateral Raise',
      'Machine Shoulder Press',
    ],
  },
  {
    muscleGroup: 'Biceps',
    exercises: [
      'Barbell Curl',
      'Dumbbell Curl',
      'Hammer Curl',
      'Incline Dumbbell Curl',
      'Concentration Curl',
      'Cable Curl',
      'Preacher Curl',
      'Reverse Curl',
    ],
  },
  {
    muscleGroup: 'Triceps',
    exercises: [
      'Tricep Pushdown (Cable)',
      'Skull Crusher',
      'Close-Grip Bench Press',
      'Overhead Tricep Extension',
      'Dips (Triceps)',
      'Tricep Kickback',
      'Diamond Push-Up',
    ],
  },
  {
    muscleGroup: 'Legs',
    exercises: [
      'Barbell Squat',
      'Front Squat',
      'Leg Press',
      'Romanian Deadlift',
      'Bulgarian Split Squat',
      'Lunges',
      'Leg Extension',
      'Leg Curl',
      'Calf Raise',
      'Goblet Squat',
      'Hip Thrust',
      'Sumo Deadlift',
    ],
  },
  {
    muscleGroup: 'Core',
    exercises: [
      'Plank',
      'Crunches',
      'Hanging Leg Raise',
      'Cable Crunch',
      'Russian Twist',
      'Ab Wheel Rollout',
      'Side Plank',
      'Dead Bug',
      'Pallof Press',
    ],
  },
  {
    muscleGroup: 'Cardio',
    exercises: [
      'Treadmill Run',
      'Stationary Bike',
      'Rowing Machine',
      'Jump Rope',
      'Elliptical',
      'Stair Climber',
      'Battle Ropes',
      'Burpees',
      'Box Jumps',
    ],
  },
]

const MUSCLE_GROUPS = ['All', ...EXERCISE_LIBRARY.map((g) => g.muscleGroup)]

export default function WorkoutSearchScreen({ navigation, route }) {
  const [query, setQuery] = useState('')
  const [activeGroup, setActiveGroup] = useState('All')

  // Build SectionList data filtered by query + muscle group
  const sections = useMemo(() => {
    const lowerQuery = query.toLowerCase()

    return EXERCISE_LIBRARY
      .filter((group) => activeGroup === 'All' || group.muscleGroup === activeGroup)
      .map((group) => ({
        title: group.muscleGroup,
        data: group.exercises.filter((ex) =>
          lowerQuery === '' || ex.toLowerCase().includes(lowerQuery)
        ),
      }))
      .filter((section) => section.data.length > 0)
  }, [query, activeGroup])

  function handleSelect(exerciseName, muscleGroup) {
    const supersetWithExId = route.params?.supersetWithExId ?? null
    navigation.navigate('WorkoutSession', {
      addExercise: { name: exerciseName, muscleGroup, supersetWithExId },
    })
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Exercise</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search exercises…"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Text style={styles.clearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Muscle group pills */}
      <FlatList
        data={MUSCLE_GROUPS}
        keyExtractor={(item) => item}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillRow}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.pill, activeGroup === item && styles.pillActive]}
            onPress={() => setActiveGroup(item)}
          >
            <Text style={[styles.pillText, activeGroup === item && styles.pillTextActive]}>
              {item}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Exercise sections */}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item}
        contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 40 }}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item, section }) => (
          <TouchableOpacity
            style={styles.exerciseRow}
            onPress={() => handleSelect(item, section.title)}
            activeOpacity={0.7}
          >
            <Text style={styles.exerciseName}>{item}</Text>
            <Text style={styles.addChevron}>+</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No exercises found</Text>
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 22,
    color: colors.text,
  },
  headerTitle: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: fontSize.xl,
    letterSpacing: -0.3,
    color: colors.text,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    fontSize: 16,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontFamily: 'Barlow_400Regular',
    fontSize: fontSize.md,
    color: colors.text,
  },
  clearBtn: {
    fontSize: 14,
    color: colors.textMuted,
    padding: spacing.xs,
  },
  pillRow: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  pillText: {
    fontFamily: 'Barlow_600SemiBold',
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  pillTextActive: {
    color: colors.textLight,
  },
  sectionHeader: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: fontSize.lg,
    letterSpacing: -0.2,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exerciseName: {
    fontFamily: 'Barlow_500Medium',
    fontSize: fontSize.md,
    color: colors.text,
  },
  addChevron: {
    fontSize: 22,
    color: colors.accentRed,
    fontFamily: 'Barlow_700Bold',
  },
  emptyText: {
    fontFamily: 'Barlow_400Regular',
    fontSize: fontSize.md,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
})
