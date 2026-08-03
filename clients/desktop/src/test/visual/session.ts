import { reactive, readonly } from 'vue'
import type { User } from '@/api/types'

const visualQuery = new URLSearchParams(window.location.search)
const showLogin = visualQuery.get('screen') === 'login'
const requestedRole = visualQuery.get('role')
const visualRole = requestedRole === 'user' ? 'user' : 'admin'
const requestedWorkspace = visualQuery.get('workspace')
const visualWorkspace = visualRole === 'admin' && requestedWorkspace === 'personal'
  ? 'personal'
  : visualRole === 'admin'
    ? 'admin'
    : 'personal'

// This module is loaded while the router is created, before bootstrap runs.
// Persisting here makes the first route guard and shell render deterministic.
localStorage.setItem('linai.desktop.workspace', visualWorkspace)

const visualUser: User = {
  id: 1,
  username: 'Lin',
  email: 'lin@example.com',
  avatar_url: null,
  role: visualRole,
  balance: 128.6,
  frozen_balance: 0,
  concurrency: 12,
  status: 'active' as const,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
}

const state = reactive({
  ready: true,
  user: showLogin ? null : visualUser,
  settings: {
    site_name: 'LinAI',
    site_logo: '',
    site_subtitle: '让每一位上帝感受 AI 的爱',
    allow_user_view_error_requests: true,
  },
  runMode: 'standard' as const,
  userGroupCapabilities: { can_access: true, can_manage: true, group_count: 3 },
  offline: false,
})

export const session = readonly(state)
export const isAuthenticated = () => state.user !== null
export const hasUserGroupAccess = () => state.user?.role === 'admin' || state.userGroupCapabilities.can_access
export const canManageUserGroups = () => state.user?.role === 'admin' || state.userGroupCapabilities.can_manage
export function revokeUserGroupAccess() {
  state.userGroupCapabilities = { can_access: false, can_manage: false, group_count: 0 }
}
export async function loadUserGroupCapabilities() { return state.userGroupCapabilities }
export async function bootstrap() {}
export async function refreshUser() {}
export function setCurrentUser(user: User) {
  Object.assign(visualUser, user)
}
export async function reloadSettings() {}
export async function completeLogin() {
  state.user = visualUser
}
export async function signOut() {
  state.user = null
}
