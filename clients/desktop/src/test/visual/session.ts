import { reactive, readonly } from 'vue'

const showLogin = new URLSearchParams(window.location.search).get('screen') === 'login'

const visualUser = {
  id: 1,
  username: 'Lin',
  email: 'lin@example.com',
  avatar_url: null,
  role: 'admin' as const,
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
  },
  runMode: 'standard' as const,
  offline: false,
})

export const session = readonly(state)
export const isAuthenticated = () => state.user !== null
export async function bootstrap() {}
export async function refreshUser() {}
export async function reloadSettings() {}
export async function completeLogin() {
  state.user = visualUser
}
export async function signOut() {
  state.user = null
}
