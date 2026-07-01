import * as AuthSession from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import AsyncStorage from '@react-native-async-storage/async-storage'
import axios from 'axios'

WebBrowser.maybeCompleteAuthSession()

const CLIENT_ID     = process.env.EXPO_PUBLIC_WHOOP_CLIENT_ID
const CLIENT_SECRET = process.env.EXPO_PUBLIC_WHOOP_CLIENT_SECRET
const TOKENS_KEY    = 'whoop_tokens'
const LAST_SYNC_KEY = 'whoop_last_sync'
const BASE_URL      = 'https://api.prod.whoop.com/developer/v1'

const DISCOVERY = {
  authorizationEndpoint: 'https://api.prod.whoop.com/oauth/oauth2/auth',
  tokenEndpoint:         'https://api.prod.whoop.com/oauth/oauth2/token',
}

// Whoop sport_id → exercise name mapping
// https://developer.whoop.com/docs/developing/data-models/workout/
const SPORT_MAP = {
  '-1':  'Activity',
  '0':   'Running',
  '1':   'Cycling',
  '16':  'Baseball',
  '17':  'Basketball',
  '18':  'Rowing',
  '19':  'Football',
  '20':  'Soccer',
  '21':  'Softball',
  '22':  'Volleyball',
  '23':  'Water Polo',
  '24':  'Wrestling',
  '25':  'Boxing',
  '27':  'Cross Country Skiing',
  '28':  'Downhill Skiing',
  '29':  'Snowboarding',
  '30':  'Swimming',
  '31':  'Tennis',
  '32':  'Golf',
  '33':  'Hiking',
  '34':  'Mountain Biking',
  '35':  'Gymnastics',
  '36':  'Weightlifting',
  '37':  'Cross Training',
  '38':  'Yoga',
  '39':  'Pilates',
  '40':  'Rock Climbing',
  '41':  'Elliptical',
  '42':  'Stair Climbing',
  '43':  'Walking',
  '44':  'Lacrosse',
  '45':  'Ice Hockey',
  '46':  'Field Hockey',
  '47':  'Martial Arts',
  '48':  'Surfing Sports',
  '49':  'Squash',
  '50':  'Racquetball',
  '51':  'Badminton',
  '52':  'Handball',
  '53':  'Obstacle Course Racing',
  '54':  'Triathlon',
  '55':  'Duathlon',
  '56':  'Biathlon',
  '57':  'Canoeing',
  '58':  'Kayaking',
  '59':  'Sailing',
  '60':  'Powerlifting',
  '61':  'Functional Fitness',
  '62':  'High Intensity Interval Training',
  '63':  'Spin',
  '64':  'Dance',
  '65':  'Bouldering',
  '66':  'Skateboarding',
  '67':  'Roller Skating',
  '68':  'Lacrosse',
  '126': 'Pickleball',
  '127': 'Padel',
}

function sportName(sportId) {
  return SPORT_MAP[String(sportId)] || `Workout (${sportId})`
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function connectWhoop() {
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'stacklog', path: 'whoop' })

  const request = new AuthSession.AuthRequest({
    clientId:     CLIENT_ID,
    scopes:       ['read:workout', 'read:profile', 'read:body_measurement'],
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    usePKCE:      true,
  })

  const result = await request.promptAsync(DISCOVERY)

  if (result.type !== 'success') {
    throw new Error('Whoop auth cancelled or failed')
  }

  const { code } = result.params
  const tokenRes = await axios.post(
    DISCOVERY.tokenEndpoint,
    new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  redirectUri,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code_verifier: request.codeVerifier,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )

  const { access_token, refresh_token, expires_in } = tokenRes.data
  const expires_at = Math.floor(Date.now() / 1000) + expires_in

  await AsyncStorage.setItem(TOKENS_KEY, JSON.stringify({ access_token, refresh_token, expires_at }))
  return true
}

export async function disconnectWhoop() {
  await AsyncStorage.multiRemove([TOKENS_KEY, LAST_SYNC_KEY])
}

export async function isWhoopConnected() {
  const stored = await AsyncStorage.getItem(TOKENS_KEY)
  return !!stored
}

async function getValidToken() {
  const stored = await AsyncStorage.getItem(TOKENS_KEY)
  if (!stored) return null

  const tokens = JSON.parse(stored)
  const nowSec = Math.floor(Date.now() / 1000)

  if (tokens.expires_at > nowSec + 60) {
    return tokens.access_token
  }

  // Refresh
  const res = await axios.post(
    DISCOVERY.tokenEndpoint,
    new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )

  const updated = {
    access_token:  res.data.access_token,
    refresh_token: res.data.refresh_token,
    expires_at:    Math.floor(Date.now() / 1000) + res.data.expires_in,
  }
  await AsyncStorage.setItem(TOKENS_KEY, JSON.stringify(updated))
  return updated.access_token
}

// ─── Data fetching ────────────────────────────────────────────────────────────

export async function getLastSyncDate() {
  const stored = await AsyncStorage.getItem(LAST_SYNC_KEY)
  if (stored) return new Date(stored)
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d
}

export async function setLastSyncDate(date) {
  await AsyncStorage.setItem(LAST_SYNC_KEY, date.toISOString())
}

// Returns normalized workout objects ready for syncEngine
export async function fetchWorkoutsSince(sinceDate) {
  const token = await getValidToken()
  if (!token) throw new Error('Whoop not connected')

  const all = []
  let nextToken = null

  do {
    const params = {
      start: sinceDate.toISOString(),
      end:   new Date().toISOString(),
      limit: 25,
    }
    if (nextToken) params.nextToken = nextToken

    const res = await axios.get(`${BASE_URL}/activity/workout`, {
      headers: { Authorization: `Bearer ${token}` },
      params,
    })

    const { records, next_token } = res.data
    all.push(...(records || []))
    nextToken = next_token || null
  } while (nextToken)

  return all.map((w) => {
    const startMs  = new Date(w.start).getTime()
    const endMs    = new Date(w.end).getTime()
    const durationMin = +((endMs - startMs) / 60000).toFixed(1)

    // Whoop returns kilojoules; convert to kcal
    const caloriesBurned = w.score?.kilojoule
      ? Math.round(w.score.kilojoule * 0.239006)
      : null

    return {
      source:        'whoop',
      externalId:    String(w.id),
      name:          sportName(w.sport_id),
      startedAt:     w.start,
      endedAt:       w.end,
      caloriesBurned,
      distanceKm:    null, // Whoop v1 doesn't expose distance
      durationMin,
      activityType:  w.sport_id,
      sourceName:    'Whoop',
      whoopData: {
        strain:   w.score?.strain,
        avgHeartRate: w.score?.average_heart_rate,
        maxHeartRate: w.score?.max_heart_rate,
      },
    }
  })
}
