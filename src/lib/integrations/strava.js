import * as AuthSession from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import AsyncStorage from '@react-native-async-storage/async-storage'
import axios from 'axios'

WebBrowser.maybeCompleteAuthSession()

const CLIENT_ID     = process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID
const CLIENT_SECRET = process.env.EXPO_PUBLIC_STRAVA_CLIENT_SECRET
const TOKENS_KEY    = 'strava_tokens'
const LAST_SYNC_KEY = 'strava_last_sync'

const DISCOVERY = {
  authorizationEndpoint: 'https://www.strava.com/oauth/mobile/authorize',
  tokenEndpoint:         'https://www.strava.com/oauth/token',
}

// Maps Strava activity type strings to human-readable exercise names
const ACTIVITY_TYPE_MAP = {
  Run:              'Running',
  Ride:             'Cycling',
  Swim:             'Swimming',
  Walk:             'Walking',
  Hike:             'Hiking',
  VirtualRide:      'Cycling',
  VirtualRun:       'Running',
  Rowing:           'Rowing',
  Kayaking:         'Kayaking',
  Yoga:             'Yoga',
  WeightTraining:   'Weight Training',
  Workout:          'Cross Training',
  Crossfit:         'CrossFit',
  Elliptical:       'Elliptical',
  StairStepper:     'Stair Climbing',
  RockClimbing:     'Climbing',
  Soccer:           'Soccer',
  IceSkate:         'Skating Sports',
  AlpineSki:        'Downhill Skiing',
  NordicSki:        'Cross Country Skiing',
  Snowboard:        'Snowboarding',
  Surf:             'Surfing Sports',
  Skateboard:       'Skating Sports',
  Handcycle:        'Hand Cycling',
  WheelchairPush:   'Wheelchair',
  Golf:             'Golf',
  Tennis:           'Tennis',
  BadmintonGame:    'Badminton',
  PickleBall:       'Racquetball',
  Pilates:          'Pilates',
}

function activityTypeName(type) {
  return ACTIVITY_TYPE_MAP[type] || type || 'Workout'
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function connectStrava() {
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'stacklog', path: 'strava' })

  const request = new AuthSession.AuthRequest({
    clientId:     CLIENT_ID,
    scopes:       ['activity:read_all'],
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    extraParams:  { approval_prompt: 'auto' },
  })

  const result = await request.promptAsync(DISCOVERY)

  if (result.type !== 'success') {
    throw new Error('Strava auth cancelled or failed')
  }

  const { code } = result.params
  const tokenRes = await axios.post(DISCOVERY.tokenEndpoint, {
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    grant_type:    'authorization_code',
  })

  const { access_token, refresh_token, expires_at } = tokenRes.data
  await AsyncStorage.setItem(TOKENS_KEY, JSON.stringify({ access_token, refresh_token, expires_at }))
  return true
}

export async function disconnectStrava() {
  await AsyncStorage.multiRemove([TOKENS_KEY, LAST_SYNC_KEY])
}

export async function isStravaConnected() {
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
  const res = await axios.post(DISCOVERY.tokenEndpoint, {
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type:    'refresh_token',
    refresh_token: tokens.refresh_token,
  })

  const updated = {
    access_token:  res.data.access_token,
    refresh_token: res.data.refresh_token,
    expires_at:    res.data.expires_at,
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
export async function fetchActivitiesSince(sinceDate) {
  const token = await getValidToken()
  if (!token) throw new Error('Strava not connected')

  const afterEpoch  = Math.floor(sinceDate.getTime() / 1000)
  const beforeEpoch = Math.floor(Date.now() / 1000)

  let page = 1
  const all = []

  while (true) {
    const res = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
      headers: { Authorization: `Bearer ${token}` },
      params:  { after: afterEpoch, before: beforeEpoch, per_page: 100, page },
    })

    const activities = res.data
    if (!activities.length) break

    all.push(...activities)
    if (activities.length < 100) break
    page++
  }

  return all.map((a) => ({
    source:        'strava',
    externalId:    String(a.id),
    name:          a.name || activityTypeName(a.type),
    startedAt:     a.start_date,
    endedAt:       null, // compute from elapsed_time
    caloriesBurned: a.calories || null,
    distanceKm:    a.distance ? +(a.distance / 1000).toFixed(3) : null,
    durationMin:   a.elapsed_time ? +(a.elapsed_time / 60).toFixed(1) : null,
    activityType:  a.type,
    sourceName:    'Strava',
    stravaData:    {
      averageSpeed:  a.average_speed,
      maxSpeed:      a.max_speed,
      elevationGain: a.total_elevation_gain,
      kudosCount:    a.kudos_count,
    },
  }))
}
