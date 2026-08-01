/**
 * Session state.
 *
 * A plain reactive module rather than Pinia — the desktop client has one
 * session and one settings blob, so a store framework would only add ceremony.
 */
import { reactive, readonly } from 'vue'
import * as api from '@/api'
import type { PublicSettings, User } from '@/api'
import { clearSession, getSession, saveSession } from '@/lib/storage'
import { onUnauthorized } from '@/lib/http'

interface SessionState {
  ready: boolean
  user: User | null
  settings: PublicSettings | null
  runMode: 'standard' | 'simple'
  /** True when the backend could not be reached during bootstrap. */
  offline: boolean
}

const state = reactive<SessionState>({
  ready: false,
  user: null,
  settings: null,
  runMode: 'standard',
  offline: false,
})

export const session = readonly(state)

export const isAuthenticated = () => state.user !== null

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
    } catch {
      // Keep the stored token when the backend is merely unreachable — only a
      // rejected token means the session is actually dead.
      if (!state.offline) {
        await clearSession()
      }
      state.user = null
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
}

export async function refreshUser(): Promise<void> {
  const user = await api.getCurrentUser()
  state.user = user
  state.runMode = user.run_mode ?? 'standard'
}

/** Keeps shared chrome in sync after a profile mutation. */
export function setCurrentUser(user: User): void {
  state.user = user
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
}

// A refresh failure anywhere in the app drops us back to the login screen.
onUnauthorized(() => {
  state.user = null
})
