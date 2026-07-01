# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Start Expo dev server
npm run ios        # Run on iOS simulator
npm run android    # Run on Android emulator
npm run web        # Run in web browser
```

No test runner or linter is configured.

## Architecture

**StackLog** is a React Native (Expo) fitness and nutrition tracking app. Pure JavaScript — no TypeScript.

### Navigation Structure

`App.js` is the root — it manages auth state via Supabase and conditionally renders:
- No session → Auth stack (Login/Signup)
- Session + onboarding incomplete → `OnboardingNavigator` (9-screen flow)
- Session + onboarding complete → Main app with bottom tabs + modal stacks

The "+" log button in the tab bar opens a quick-log bottom sheet (not a screen) that launches either `FoodNavigator` or `WorkoutNavigator` as full-screen modals.

### Data Flow

No global state management (no Redux/Zustand/Context). Data flows via:
- **Supabase** as the backend source of truth — auth, profiles, food logs, workouts, water logs
- **Custom hooks** (`src/hooks/`) for shared data: `useProfile.js`, `useTodayLogs.js`
- Local `useState` for UI/form state within screens
- **USDA FoodData Central API** (primary) and **Open Food Facts** (barcode fallback) via `src/lib/foodApi.js`

### Key Directories

| Path | Purpose |
|------|---------|
| `src/lib/` | API clients and DB operations: `supabase.js`, `foodApi.js`, `foodLog.js`, `workoutLog.js`, `waterLog.js` |
| `src/hooks/` | Shared data hooks: `useProfile`, `useTodayLogs` |
| `src/screens/` | Feature screens grouped by domain: `auth/`, `food/`, `workout/`, `onboarding/` |
| `src/navigation/` | Navigator components: `TabNavigator`, `FoodNavigator`, `WorkoutNavigator`, `OnboardingNavigator` |
| `src/utils/theme.js` | Design system — colors, font sizes, spacing, border radii |
| `src/utils/tdee.js` | TDEE/macro calculations (Mifflin-St Jeor BMR) |

### Design System

All styling uses `src/utils/theme.js`. Reference it for colors, spacing, font sizes, and border radii rather than hardcoding values.

### Environment Variables

Stored in `.env` with `EXPO_PUBLIC_` prefix (Expo exposes these to the client):
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_USDA_API_KEY`

### Database Schema (Supabase)

Key tables: `profiles`, `food_logs`, `foods`, `workouts`, `workout_exercises`, `workout_sets`, `exercises`, `water_logs`. See `src/lib/` files for the exact column names used in queries.
