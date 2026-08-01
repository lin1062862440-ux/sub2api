/**
 * Endpoint bindings for the LinAI backend.
 *
 * Paths are relative to the configured `/api/v1` base and match the routes the
 * web frontend calls, so no backend change is needed for the desktop client.
 */
import { http } from '@/lib/http'
import type {
  AuthResponse,
  ApiKey,
  ApiKeyOption,
  ApiKeyGroup,
  ApiKeyUsageResponse,
  ChannelMonitorDetail,
  ChannelMonitorListResponse,
  DashboardStats,
  ForgotPasswordResponse,
  GroupOption,
  LoginResponse,
  ModelStatsResponse,
  PaginatedResponse,
  PublicSettings,
  RedeemHistoryItem,
  RedeemResult,
  ResetPasswordResponse,
  SendVerifyCodeResponse,
  SubscriptionSummary,
  TrendResponse,
  User,
  UserErrorRequest,
  UserErrorRequestDetail,
  UsageErrorFilters,
  UsageFilters,
  UsageLog,
  UsageSnapshot,
  UsageStats,
  UserSubscription,
  CreateApiKeyRequest,
  UpdateApiKeyRequest,
} from './types'

// ==================== Auth ====================

/** The backend authenticates by email address, not username. */
export function login(payload: { email: string; password: string; turnstile_token?: string }) {
  return http.post<LoginResponse>('/auth/login', payload, { anonymous: true })
}

export function loginWith2FA(payload: { temp_token: string; totp_code: string }) {
  return http.post<AuthResponse>('/auth/login/2fa', payload, { anonymous: true })
}

export interface RegisterPayload {
  username: string
  email: string
  password: string
  verify_code?: string
  turnstile_token?: string
  promo_code?: string
  invitation_code?: string
  aff_code?: string
}

export function register(payload: RegisterPayload) {
  return http.post<AuthResponse>('/auth/register', payload, { anonymous: true })
}

export function sendVerifyCode(payload: { email: string; turnstile_token?: string }) {
  return http.post<SendVerifyCodeResponse>('/auth/send-verify-code', payload, { anonymous: true })
}

export function forgotPassword(payload: {
  email: string
  turnstile_token?: string
  reset_target?: 'web' | 'desktop'
}) {
  return http.post<ForgotPasswordResponse>('/auth/forgot-password', payload, { anonymous: true })
}

export function resetPassword(payload: { email: string; token: string; new_password: string }) {
  return http.post<ResetPasswordResponse>('/auth/reset-password', payload, { anonymous: true })
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

export function updateProfile(payload: { username?: string; avatar_url?: string | null }) {
  return http.put<User>('/user', payload)
}

export function changePassword(payload: { old_password: string; new_password: string }) {
  return http.put<{ message: string }>('/user/password', payload)
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

export function getSubscriptionSummary() {
  return http.get<SubscriptionSummary>('/subscriptions/summary')
}

// ==================== API keys ====================

export function getApiKeys(params: {
  page?: number
  page_size?: number
  search?: string
  status?: string
  group_id?: number
  sort_by?: string
  sort_order?: 'asc' | 'desc'
} = {}) {
  return http.get<PaginatedResponse<ApiKey>>('/keys', { query: params })
}

export function getApiKeyGroups() {
  return http.get<ApiKeyGroup[]>('/groups/available')
}

export function getApiKeyUsage(apiKeyIds: number[]) {
  return http.post<ApiKeyUsageResponse>('/usage/dashboard/api-keys-usage', {
    api_key_ids: apiKeyIds,
  })
}

export function createApiKey(payload: CreateApiKeyRequest) {
  return http.post<ApiKey>('/keys', payload)
}

export function updateApiKey(id: number, payload: UpdateApiKeyRequest) {
  return http.put<ApiKey>(`/keys/${id}`, payload)
}

export function deleteApiKey(id: number) {
  return http.delete<{ message: string }>(`/keys/${id}`)
}

// ==================== User services ====================

export function getChannelMonitors() {
  return http.get<ChannelMonitorListResponse>('/channel-monitors')
}

export function getChannelMonitorDetail(id: number) {
  return http.get<ChannelMonitorDetail>(`/channel-monitors/${id}/status`)
}

export function getSubscriptions() {
  return http.get<UserSubscription[]>('/subscriptions')
}

export function redeemCode(code: string) {
  return http.post<RedeemResult>('/redeem', { code })
}

export function getRedeemHistory() {
  return http.get<RedeemHistoryItem[]>('/redeem/history')
}

// ==================== Usage ====================

export function getUsageStats(filters: UsageFilters) {
  return http.get<UsageStats>('/usage/stats', { query: { ...filters } })
}

export function getUsageSnapshot(filters: UsageFilters & { granularity: 'hour' | 'day' }) {
  return http.get<UsageSnapshot>('/usage/dashboard/snapshot-v2', {
    query: {
      ...filters,
      include_trend: true,
      include_model_stats: false,
      include_group_stats: true,
    },
  })
}

export function getUsageModels(filters: UsageFilters) {
  return http.get<ModelStatsResponse>('/usage/dashboard/models', {
    query: { ...filters, model_source: 'requested' },
  })
}

export function getUsageRecords(filters: UsageFilters & { page: number; page_size: number }) {
  return http.get<PaginatedResponse<UsageLog>>('/usage', {
    query: { ...filters, sort_by: 'created_at', sort_order: 'desc' },
  })
}

export function getUsageErrors(filters: UsageErrorFilters & { page: number; page_size: number }) {
  return http.get<PaginatedResponse<UserErrorRequest>>('/usage/errors', {
    query: { ...filters, sort_by: 'created_at', sort_order: 'desc' },
  })
}

export function getUsageErrorDetail(id: number) {
  return http.get<UserErrorRequestDetail>(`/usage/errors/${id}`)
}

export function getUsageApiKeys() {
  return http.get<PaginatedResponse<ApiKeyOption>>('/keys', { query: { page: 1, page_size: 100 } })
}

export function getUsageGroups() {
  return http.get<GroupOption[]>('/groups/available')
}

export * from './types'
