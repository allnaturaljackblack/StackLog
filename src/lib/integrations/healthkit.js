import AppleHealthKit from 'react-native-health'
import AsyncStorage from '@react-native-async-storage/async-storage'

const LAST_SYNC_KEY = 'healthkit_last_sync'

// Guard: returns true only when the native module is actually loaded (custom dev client / production build)
export function isNativeModuleReady() {
  return !!(AppleHealthKit && typeof AppleHealthKit.isAvailable === 'function')
}

function buildPermissions() {
  return {
    permissions: {
      read: [
        AppleHealthKit.Constants.Permissions.Workout,
        AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
        AppleHealthKit.Constants.Permissions.DistanceWalkingRunning,
        AppleHealthKit.Constants.Permissions.DistanceCycling,
        AppleHealthKit.Constants.Permissions.DistanceSwimming,
      ],
      write: [],
    },
  }
}

// Maps HKWorkoutActivityType integer values to readable exercise names
// https://developer.apple.com/documentation/healthkit/hkworkoutactivitytype
const ACTIVITY_TYPE_MAP = {
  1:   'American Football',
  2:   'Archery',
  3:   'Australian Football',
  4:   'Badminton',
  5:   'Baseball',
  6:   'Basketball',
  7:   'Bowling',
  8:   'Boxing',
  9:   'Climbing',
  10:  'Cricket',
  11:  'Cross Training',
  12:  'Curling',
  13:  'Cycling',
  14:  'Dance',
  16:  'Elliptical',
  20:  'Functional Strength Training',
  21:  'Golf',
  22:  'Gymnastics',
  23:  'Handball',
  24:  'Hiking',
  25:  'Hockey',
  26:  'Hunting',
  27:  'Lacrosse',
  28:  'Martial Arts',
  29:  'Mind and Body',
  31:  'Paddle Sports',
  32:  'Play',
  33:  'Preparation and Recovery',
  34:  'Racquetball',
  35:  'Rowing',
  36:  'Rugby',
  37:  'Running',
  38:  'Sailing',
  39:  'Skating Sports',
  40:  'Snow Sports',
  41:  'Soccer',
  42:  'Softball',
  43:  'Squash',
  44:  'Stair Climbing',
  45:  'Surfing Sports',
  46:  'Swimming',
  47:  'Table Tennis',
  48:  'Tennis',
  49:  'Track and Field',
  50:  'Traditional Strength Training',
  51:  'Volleyball',
  52:  'Walking',
  53:  'Water Fitness',
  54:  'Water Polo',
  55:  'Water Sports',
  56:  'Wrestling',
  57:  'Yoga',
  58:  'Barre',
  59:  'Core Training',
  60:  'Cross Country Skiing',
  61:  'Downhill Skiing',
  62:  'Flexibility',
  63:  'High Intensity Interval Training',
  64:  'Jump Rope',
  65:  'Kickboxing',
  66:  'Pilates',
  67:  'Snowboarding',
  68:  'Stairs',
  69:  'Step Training',
  70:  'Wheelchair Walk Pace',
  71:  'Wheelchair Run Pace',
  72:  'Tai Chi',
  73:  'Mixed Cardio',
  74:  'Hand Cycling',
  75:  'Disc Sports',
  76:  'Fitness Gaming',
  3000: 'Other',
}

function activityTypeName(typeInt) {
  return ACTIVITY_TYPE_MAP[typeInt] || `Workout (${typeInt})`
}

export async function requestHealthKitPermissions() {
  if (!isNativeModuleReady()) throw new Error('HealthKit native module not available. Rebuild your dev client.')
  return new Promise((resolve, reject) => {
    AppleHealthKit.initHealthKit(buildPermissions(), (err) => {
      if (err) {
        reject(new Error('HealthKit permission denied: ' + err))
      } else {
        resolve(true)
      }
    })
  })
}

export async function isHealthKitAvailable() {
  if (!isNativeModuleReady()) return false
  return new Promise((resolve) => {
    AppleHealthKit.isAvailable((err, available) => {
      resolve(!err && available)
    })
  })
}

export async function getLastSyncDate() {
  const stored = await AsyncStorage.getItem(LAST_SYNC_KEY)
  if (stored) return new Date(stored)
  // Default: go back 30 days on first sync
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d
}

export async function setLastSyncDate(date) {
  await AsyncStorage.setItem(LAST_SYNC_KEY, date.toISOString())
}

// Returns an array of normalized workout objects ready for syncEngine
export async function fetchWorkoutsSince(sinceDate) {
  return new Promise((resolve, reject) => {
    const options = {
      startDate: sinceDate.toISOString(),
      endDate: new Date().toISOString(),
      ascending: true,
    }

    AppleHealthKit.getSamples(
      { ...options, type: 'Workout' },
      (err, results) => {
        if (err) {
          // getSamples may not be available on all versions — fallback gracefully
          reject(new Error('HealthKit getSamples error: ' + JSON.stringify(err)))
          return
        }

        const workouts = (results || []).map((w) => ({
          source: 'healthkit',
          externalId: w.id || `${w.startDate}-${w.activityType}`,
          name: activityTypeName(w.activityType),
          startedAt: w.startDate,
          endedAt: w.endDate,
          caloriesBurned: w.energy ? Math.round(w.energy.quantity) : null,
          // distance stored in km; HK returns metres by default
          distanceKm: w.distance ? +(w.distance.quantity / 1000).toFixed(3) : null,
          durationMin: w.duration ? +(w.duration / 60).toFixed(1) : null,
          activityType: w.activityType,
          sourceName: w.sourceName || 'Apple Health',
        }))

        resolve(workouts)
      }
    )
  })
}
