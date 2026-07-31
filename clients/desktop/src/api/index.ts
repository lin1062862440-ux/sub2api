/**
 * Endpoint bindings for the LinAI backend.
 *
 * Paths are relative to the configured `/api/v1` base and match the routes the
 * web frontend calls, so no backend change is needed for the desktop client.
 */
import { http } from '@/lib/http'
import type {
  AuthResponse,
  DashboardStats,
  LoginResponse,
  ModelStatsResponse,
  PublicSettings,
  TrendResponse,
  User,
} from './types'

// ==================== Auth ====================

/** The backend authenticates by email address, not username. */
export function login(payload: { email: string; password: string; turnstile_token?: string }) {
  return http.post<LoginResponse>('/auth/login', payload, { anonymous: true })
}

export function loginWith2FA(payload: { temp_token: string; totp_code: string }) {
  return http.post<AuthResponse>('/auth/login/2fa', payload, { anonymous: true })
}

export function logout(refreshToken: string | null) {
  return http.post<unknown>('/auth/logout', refreshToken ? { refresh_token: refreshToken } : {})
}

export function getCurrentUser() {
  return http.get<User & { run_mode?: 'standard' | 'simple' }>('/auth/me')
}

/** Public settings, readable without a token. Drives the login method list. */
export function getPublicSettings() {
  return http.get<PublicSettings>('/settings/public', { anonymous: true })
}

// ==================== Profile ====================

export function getProfile() {
  return http.get<User>('/user/profile')
}

// ==================== Dashboard ====================

export function getDashboardStats() {
  return http.get<DashboardStats>('/usage/dashboard/stats')
}

export function getDashboardTrend(params: { start_date?: string; end_date?: string; granularity?: 'day' | 'hour' } = {}) {
  return http.get<TrendResponse>('/usage/dashboard/trend', { query: params })
}

export function getDashboardModels(params: { start_date?: string; end_date?: string; limit?: number } = {}) {
  return http.get<ModelStatsResponse>('/usage/dashboard/models', { query: params })
}

export * from './types'
