/**
 * Session state.
 *
 * A plain reactive module rather than Pinia — the desktop client has one
 * session and one settings blob, so a store framework would only add ceremony.
 */
import { reactive, readonly } from 'vue'
import * as api from '@/api'
import type { PublicSettings, User } from '@/api'
import { getUserGroupCapabilities, type UserGroupCapabilities } from '@/api/user-groups'
import { clearSession, getSession, saveSession } from '@/lib/storage'
import { onUnauthorized, onUserGroupAccessDenied } from '@/lib/http'

interface SessionState {
  ready: boolean
  user: User | null
  settings: PublicSettings | null
  runMode: 'standard' | 'simple'
  userGroupCapabilities: UserGroupCapabilities | null
  /** True when the backend could not be reached during bootstrap. */
  offline: boolean
}

const state = reactive<SessionState>({
  ready: false,
  user: null,
  settings: null,
  runMode: 'standard',
  userGroupCapabilities: null,
  offline: false,
})

export const session = readonly(state)

export const isAuthenticated = () => state.user !== null

export const hasUserGroupAccess = () =>
  state.user?.role === 'admin' || state.userGroupCapabilities?.can_access === true

export const canManageUserGroups = () =>
  state.user?.role === 'admin' || state.userGroupCapabilities?.can_manage === true

export function revokeUserGroupAccess(): void {
  state.userGroupCapabilities = { can_access: false, can_manage: false, can_manage_quota: false, group_count: 0 }
}

export async function loadUserGroupCapabilities(force = false): Promise<UserGroupCapabilities> {
  if (state.user?.role === 'admin') {
    const capabilities = { can_access: true, can_manage: true, can_manage_quota: true, group_count: 0 }
    state.userGroupCapabilities = capabilities
    return capabilities
  }
  if (!state.user) {
    const unavailable = { can_access: false, can_manage: false, can_manage_quota: false, group_count: 0 }
    state.userGroupCapabilities = null
    return unavailable
  }
  if (!force && state.userGroupCapabilities) return state.userGroupCapabilities
  try {
    const capabilities = await getUserGroupCapabilities()
    state.userGroupCapabilities = capabilities
    return capabilities
  } catch {
    const unavailable = { can_access: false, can_manage: false, can_manage_quota: false, group_count: 0 }
    state.userGroupCapabilities = unavailable
    return unavailable
  }
}

/**
 * Loads public settings and, if a token is on disk, the current user.
 *
 * The backend address is fixed at build time, so there is nothing to configure
 * here — launch goes straight to login or the dashboard.
 */
export async function bootstrap(): Promise<void> {
  // `ready` must be set even if every step below fails: the router guard treats
  // "not ready" as "allow everything", so leaving it false would disable auth
  // redirects for the rest of the session.
  try {
    try {
      state.settings = await api.getPublicSettings()
      state.offline = false
    } catch {
      // An unreachable backend must not block the UI; the login screen surfaces
      // the failure when the user tries to sign in.
      state.settings = null
      state.offline = true
    }

    const stored = await getSession()
    if (!stored) return

    try {
      const user = await api.getCurrentUser()
      state.user = user
      state.runMode = user.run_mode ?? 'standard'
      await loadUserGroupCapabilities()
    } catch {
      // Keep the stored token when the backend is merely unreachable — only a
      // rejected token means the session is actually dead.
      if (!state.offline) {
        await clearSession()
      }
      state.user = null
      state.userGroupCapabilities = null
    }
  } finally {
    state.ready = true
  }
}

export async function reloadSettings(): Promise<void> {
  try {
    state.settings = await api.getPublicSettings()
    state.offline = false
  } catch {
    // keep the previous snapshot
  }
}

export async function completeLogin(auth: {
  access_token: string
  refresh_token?: string
  expires_in?: number
  user: User & { run_mode?: 'standard' | 'simple' }
}): Promise<void> {
  await saveSession({
    accessToken: auth.access_token,
    refreshToken: auth.refresh_token ?? null,
    expiresIn: auth.expires_in ?? null,
  })
  state.user = auth.user
  state.runMode = auth.user.run_mode ?? 'standard'
  await loadUserGroupCapabilities(true)
}

export async function refreshUser(): Promise<void> {
  const user = await api.getCurrentUser()
  state.user = user
  state.runMode = user.run_mode ?? 'standard'
  await loadUserGroupCapabilities(true)
}

/** Keeps shared chrome in sync after a profile mutation. */
export function setCurrentUser(user: User): void {
  state.user = user
  if (user.role === 'admin') {
    state.userGroupCapabilities = { can_access: true, can_manage: true, can_manage_quota: true, group_count: 0 }
  }
}

export async function signOut(): Promise<void> {
  const stored = await getSession()
  try {
    await api.logout(stored?.refreshToken ?? null)
  } catch {
    // Logging out locally matters more than the server acknowledging it.
  }
  await clearSession()
  state.user = null
  state.userGroupCapabilities = null
}

// A refresh failure anywhere in the app drops us back to the login screen.
onUnauthorized(() => {
  state.user = null
  state.userGroupCapabilities = null
})

onUserGroupAccessDenied(revokeUserGroupAccess)
