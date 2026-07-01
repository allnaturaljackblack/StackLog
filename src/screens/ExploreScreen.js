import { useState, useCallback } from 'react'
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  Image, StyleSheet, SafeAreaView, ActivityIndicator, Alert,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { searchUsers, sendFollowRequest, unfollowUser } from '../lib/socialApi'
import { colors, fonts, fontSize, spacing, radius } from '../utils/theme'

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

// ---------------------------------------------------------------------------
// Follow button
// ---------------------------------------------------------------------------
function FollowButton({ status, onFollow, onUnfollow, loading }) {
  if (loading) return <ActivityIndicator size="small" color={colors.textMuted} style={{ width: 90 }} />

  if (status === 'accepted') {
    return (
      <TouchableOpacity
        style={[styles.followBtn, styles.followBtnFollowing]}
        onPress={onUnfollow}
        activeOpacity={0.8}
      >
        <Text style={[styles.followBtnText, styles.followBtnTextFollowing]}>Following</Text>
      </TouchableOpacity>
    )
  }

  if (status === 'pending') {
    return (
      <TouchableOpacity
        style={[styles.followBtn, styles.followBtnPending]}
        onPress={onUnfollow}
        activeOpacity={0.8}
      >
        <Text style={[styles.followBtnText, styles.followBtnTextPending]}>Requested</Text>
      </TouchableOpacity>
    )
  }

  return (
    <TouchableOpacity style={[styles.followBtn, styles.followBtnFollow]} onPress={onFollow} activeOpacity={0.85}>
      <Text style={[styles.followBtnText, styles.followBtnTextFollow]}>Follow</Text>
    </TouchableOpacity>
  )
}

// ---------------------------------------------------------------------------
// User card
// ---------------------------------------------------------------------------
function UserCard({ user, onPressProfile, onFollowChange }) {
  const [status,  setStatus]  = useState(user.followStatus)
  const [loading, setLoading] = useState(false)

  async function handleFollow() {
    setLoading(true)
    try {
      await sendFollowRequest(user.id, user.visibility)
      const newStatus = user.visibility === 'public' ? 'accepted' : 'pending'
      setStatus(newStatus)
      onFollowChange?.()
    } catch {
      Alert.alert('Error', 'Could not send follow request.')
    } finally {
      setLoading(false)
    }
  }

  async function handleUnfollow() {
    const label = status === 'pending' ? 'withdraw your follow request' : 'unfollow this person'
    Alert.alert(
      status === 'pending' ? 'Withdraw Request?' : 'Unfollow?',
      `Are you sure you want to ${label}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: status === 'pending' ? 'Withdraw' : 'Unfollow',
          style: 'destructive',
          onPress: async () => {
            setLoading(true)
            try {
              await unfollowUser(user.id)
              setStatus('none')
              onFollowChange?.()
            } catch {
              Alert.alert('Error', 'Could not unfollow.')
            } finally {
              setLoading(false)
            }
          },
        },
      ]
    )
  }

  return (
    <TouchableOpacity style={styles.userCard} onPress={() => onPressProfile(user.id)} activeOpacity={0.75}>
      {/* Avatar */}
      {user.avatar_url ? (
        <Image source={{ uri: user.avatar_url }} style={styles.avatar} resizeMode="cover" />
      ) : (
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarInitials}>{getInitials(user.display_name)}</Text>
        </View>
      )}

      {/* Name + username */}
      <View style={styles.userInfo}>
        <Text style={styles.displayName} numberOfLines={1}>{user.display_name || 'User'}</Text>
        {!!user.username && (
          <Text style={styles.username} numberOfLines={1}>@{user.username}</Text>
        )}
      </View>

      {/* Follow button */}
      <FollowButton
        status={status}
        onFollow={handleFollow}
        onUnfollow={handleUnfollow}
        loading={loading}
      />
    </TouchableOpacity>
  )
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function ExploreScreen({ navigation }) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  useFocusEffect(useCallback(() => {
    // Clear search when leaving and returning
  }, []))

  async function handleSearch(text) {
    setQuery(text)
    if (!text.trim()) {
      setResults([])
      setSearched(false)
      return
    }
    setLoading(true)
    setSearched(true)
    try {
      const data = await searchUsers(text)
      setResults(data)
    } catch {
      Alert.alert('Error', 'Could not search. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleClear() {
    setQuery('')
    setResults([])
    setSearched(false)
  }

  function handlePressProfile(userId) {
    navigation.navigate('UserProfile', { userId })
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.pageTitle}>Explore</Text>

        {/* Search bar */}
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or @username…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={handleSearch}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={handleClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.centerWrap}>
            <ActivityIndicator size="small" color={colors.textMuted} />
          </View>
        ) : searched && results.length === 0 ? (
          <View style={styles.centerWrap}>
            <Ionicons name="person-outline" size={36} color={colors.border} />
            <Text style={styles.emptyTitle}>No users found</Text>
            <Text style={styles.emptySubtitle}>Try a different name or username</Text>
          </View>
        ) : !searched ? (
          <View style={styles.centerWrap}>
            <Ionicons name="people-outline" size={40} color={colors.border} />
            <Text style={styles.emptyTitle}>Find your friends</Text>
            <Text style={styles.emptySubtitle}>Search by name or @username to follow people</Text>
          </View>
        ) : (
          <View style={styles.resultsList}>
            {results.map(user => (
              <UserCard
                key={user.id}
                user={user}
                onPressProfile={handlePressProfile}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 40,
    gap: spacing.md,
  },
  pageTitle: {
    fontFamily: fonts.bold,
    fontSize: 32,
    color: colors.text,
  },

  // Search bar
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontFamily: fonts.regular,
    fontSize: fontSize.md,
    color: colors.text,
  },

  // Empty / loading states
  centerWrap: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
  },
  emptySubtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Results
  resultsList: {
    gap: spacing.xs,
  },

  // User card
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.bgDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontFamily: fonts.bold,
    fontSize: fontSize.md,
    color: colors.textLight,
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  displayName: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.md,
    color: colors.text,
    letterSpacing: -0.2,
  },
  username: {
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },

  // Follow button
  followBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followBtnFollow: {
    backgroundColor: colors.bgDark,
  },
  followBtnFollowing: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  followBtnPending: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  followBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: fontSize.sm,
  },
  followBtnTextFollow: {
    color: colors.textLight,
  },
  followBtnTextFollowing: {
    color: colors.text,
  },
  followBtnTextPending: {
    color: colors.textMuted,
  },
})
