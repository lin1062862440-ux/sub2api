/**
 * Response shapes for the endpoints this client uses.
 *
 * These mirror `frontend/src/types/index.ts` and `frontend/src/api/usage.ts`,
 * trimmed to the fields the desktop client actually reads.
 */

export interface User {
  id: number
  username: string
  email: string
  avatar_url?: string | null
  role: 'admin' | 'user'
  balance: number
  frozen_balance?: number
  concurrency: number
  rpm_limit?: number
  status: 'active' | 'disabled'
  last_active_at?: string | null
  created_at: string
  updated_at: string
}

export interface AuthResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type: string
  user: User & { run_mode?: 'standard' | 'simple' }
}

/** Returned instead of `AuthResponse` when the account has TOTP enabled. */
export interface TotpLoginResponse {
  requires_2fa: true
  temp_token: string
  user_email_masked?: string
}

export type LoginResponse = AuthResponse | TotpLoginResponse

export function isTotpRequired(response: LoginResponse): response is TotpLoginResponse {
  return 'requires_2fa' in response && response.requires_2fa === true
}

export interface PlatformDashboardStats {
  platform: string
  total_requests: number
  total_tokens: number
  total_cost: number
  total_actual_cost: number
  today_requests: number
  today_tokens: number
  today_cost: number
  today_actual_cost: number
}

export interface DashboardStats {
  total_api_keys: number
  active_api_keys: number
  total_requests: number
  total_input_tokens: number
  total_output_tokens: number
  total_cache_creation_tokens: number
  total_cache_read_tokens: number
  total_tokens: number
  total_cost: number
  total_actual_cost: number
  today_requests: number
  today_input_tokens: number
  today_output_tokens: number
  today_cache_creation_tokens: number
  today_cache_read_tokens: number
  today_tokens: number
  today_cost: number
  today_actual_cost: number
  average_duration_ms: number
  rpm: number
  tpm: number
  by_platform?: PlatformDashboardStats[]
}

export interface TrendPoint {
  date: string
  requests: number
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  total_tokens: number
  cost: number
  actual_cost: number
}

export interface TrendResponse {
  trend: TrendPoint[]
  start_date: string
  end_date: string
  granularity: string
}

export interface ModelStat {
  model: string
  requests: number
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  total_tokens: number
  cost: number
  actual_cost: number
}

export interface ModelStatsResponse {
  models: ModelStat[]
}

export interface SubscriptionSummaryItem {
  id: number
  group_id: number
  group_name: string
  status: string
  daily_used_usd?: number
  daily_limit_usd?: number
  weekly_used_usd?: number
  weekly_limit_usd?: number
  monthly_used_usd?: number
  monthly_limit_usd?: number
  expires_at?: string
}

export interface SubscriptionSummary {
  active_count: number
  total_used_usd: number
  subscriptions: SubscriptionSummaryItem[]
}

export type MonitorStatus = 'operational' | 'degraded' | 'failed' | 'error'
export type MonitorProvider = 'openai' | 'anthropic' | 'gemini' | 'grok' | string

export interface ChannelMonitorTimelinePoint {
  status: MonitorStatus
  latency_ms: number | null
  ping_latency_ms: number | null
  checked_at: string
}

export interface ChannelMonitorExtraModel {
  model: string
  status: MonitorStatus
  latency_ms: number | null
}

export interface ChannelMonitor {
  id: number
  name: string
  provider: MonitorProvider
  group_name: string
  primary_model: string
  primary_status: MonitorStatus
  primary_latency_ms: number | null
  primary_ping_latency_ms: number | null
  availability_7d: number
  extra_models: ChannelMonitorExtraModel[]
  timeline: ChannelMonitorTimelinePoint[]
}

export interface ChannelMonitorListResponse {
  items: ChannelMonitor[]
}

export interface ChannelMonitorModelDetail {
  model: string
  latest_status: MonitorStatus
  latest_latency_ms: number | null
  availability_7d: number
  availability_15d: number
  availability_30d: number
  avg_latency_7d_ms: number | null
}

export interface ChannelMonitorDetail {
  id: number
  name: string
  provider: MonitorProvider
  group_name: string
  models: ChannelMonitorModelDetail[]
}

export interface SubscriptionGroup {
  id: number
  name: string
  description?: string | null
  platform?: string
  subscription_type?: 'standard' | 'subscription' | 'team_subscription'
  rate_multiplier?: number
  daily_limit_usd?: number | null
  weekly_limit_usd?: number | null
  monthly_limit_usd?: number | null
  peak_rate_enabled?: boolean
  peak_start?: string
  peak_end?: string
  peak_rate_multiplier?: number
}

export type SubscriptionStatus = 'active' | 'expired' | 'revoked' | 'suspended'

export interface UserSubscription {
  id: number
  user_id: number
  group_id: number
  status: SubscriptionStatus
  starts_at: string
  expires_at: string | null
  daily_usage_usd: number
  weekly_usage_usd: number
  monthly_usage_usd: number
  daily_window_start: string | null
  weekly_window_start: string | null
  monthly_window_start: string | null
  team_weekly_limit_usd?: number | null
  team_weekly_usage_usd?: number | null
  team_weekly_window_start?: string | null
  created_at: string
  updated_at: string
  revoked_at?: string | null
  group?: SubscriptionGroup
}

export interface RedeemHistoryItem {
  id: number
  code: string
  type: string
  value: number
  status: string
  used_at: string | null
  created_at: string
  notes?: string
  group_id?: number
  validity_days?: number
  group?: { id: number; name: string }
}

export interface RedeemResult {
  id?: number
  code?: string
  type: string
  value: number
  status?: string
  used_at?: string | null
  created_at?: string
  message?: string
  new_balance?: number
  new_concurrency?: number
  group_name?: string
  group_id?: number
  validity_days?: number
  group?: { id: number; name: string }
}

export type UsageRequestType = 'unknown' | 'sync' | 'stream' | 'ws_v2' | 'cyber' | 'live'

export interface UsageFilters {
  start_date?: string
  end_date?: string
  timezone?: string
  api_key_id?: number
  model?: string
  group_id?: number
  request_type?: UsageRequestType
  billing_type?: number | null
  billing_mode?: string | null
}

export interface UsageStats {
  total_requests: number
  total_input_tokens: number
  total_output_tokens: number
  total_cache_tokens: number
  total_cache_read_tokens: number
  total_cache_creation_tokens: number
  total_tokens: number
  total_cost: number
  total_actual_cost: number
  average_duration_ms: number
}

export interface UsageLog {
  id: number
  api_key_id: number
  model: string
  inbound_endpoint?: string | null
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  total_tokens?: number
  actual_cost: number
  request_type?: UsageRequestType
  stream: boolean
  duration_ms: number | null
  first_token_ms: number | null
  billing_type: number
  billing_mode?: string | null
  created_at: string
  api_key?: { id?: number; name: string }
  group?: { id: number; name: string }
}

export interface UsageGroupStat {
  group_id: number
  group_name: string
  requests: number
  total_tokens: number
  cost: number
  actual_cost: number
}

export interface UsageSnapshot {
  generated_at: string
  start_date: string
  end_date: string
  granularity: string
  trend?: TrendPoint[]
  groups?: UsageGroupStat[]
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages?: number
  total_pages?: number
}

export interface UserErrorRequest {
  id: number
  created_at: string
  model: string
  inbound_endpoint: string
  status_code: number
  category: string
  platform: string
  message: string
  key_name: string
  key_deleted: boolean
  client_ip?: string
  group_name?: string
}

export interface UserErrorRequestDetail extends UserErrorRequest {
  error_body: string
  upstream_status_code?: number
}

export interface UsageErrorFilters {
  start_date?: string
  end_date?: string
  timezone?: string
  api_key_id?: number
  model?: string
  status_code?: number
  category?: string
}

export interface ApiKeyOption {
  id: number
  name: string
}

export interface GroupOption {
  id: number
  name: string
}

export type ApiKeyStatus = 'active' | 'inactive' | 'quota_exhausted' | 'expired'

export interface ApiKeyGroup {
  id: number
  name: string
  description: string | null
  platform: string
  rate_multiplier: number
  subscription_type?: 'standard' | 'subscription'
}

export interface ApiKey {
  id: number
  user_id: number
  key: string
  name: string
  group_id: number | null
  status: ApiKeyStatus
  ip_whitelist: string[]
  ip_blacklist: string[]
  last_used_at: string | null
  last_used_ip: string | null
  quota: number
  quota_used: number
  expires_at: string | null
  created_at: string
  updated_at: string
  current_concurrency: number
  group?: ApiKeyGroup
  rate_limit_5h: number
  rate_limit_1d: number
  rate_limit_7d: number
  usage_5h: number
  usage_1d: number
  usage_7d: number
  reset_5h_at: string | null
  reset_1d_at: string | null
  reset_7d_at: string | null
}

export interface CreateApiKeyRequest {
  name: string
  group_id: number
  custom_key?: string
  ip_whitelist?: string[]
  ip_blacklist?: string[]
  quota?: number
  expires_in_days?: number
  rate_limit_5h?: number
  rate_limit_1d?: number
  rate_limit_7d?: number
}

export interface UpdateApiKeyRequest {
  name?: string
  group_id?: number | null
  status?: 'active' | 'inactive'
  ip_whitelist?: string[]
  ip_blacklist?: string[]
  quota?: number
  expires_at?: string | null
  rate_limit_5h?: number
  rate_limit_1d?: number
  rate_limit_7d?: number
}

export interface ApiKeyUsageStat {
  api_key_id: number
  today_actual_cost: number
  total_actual_cost: number
}

export interface ApiKeyUsageResponse {
  stats: Record<string, ApiKeyUsageStat>
}

/**
 * Public site configuration. Drives which login methods the client offers, so
 * the desktop app exposes exactly what the deployment has enabled.
 */
export interface PublicSettings {
  site_name: string
  site_logo: string
  site_subtitle: string
  api_base_url?: string
  version: string
  registration_enabled: boolean
  email_verify_enabled?: boolean
  registration_email_suffix_whitelist?: string[]
  promo_code_enabled?: boolean
  invitation_code_enabled?: boolean
  affiliate_enabled?: boolean
  login_agreement_enabled?: boolean
  login_agreement_mode?: 'modal' | 'checkbox' | string
  login_agreement_updated_at?: string
  login_agreement_revision?: string
  login_agreement_documents?: LoginAgreementDocument[]
  password_reset_enabled: boolean
  turnstile_enabled: boolean
  turnstile_site_key: string
  passkey_enabled?: boolean
  linuxdo_oauth_enabled: boolean
  dingtalk_oauth_enabled?: boolean
  wechat_oauth_enabled: boolean
  oidc_oauth_enabled: boolean
  oidc_oauth_provider_name: string
  github_oauth_enabled: boolean
  google_oauth_enabled: boolean
  payment_enabled: boolean
  doc_url: string
  contact_info: string
  allow_user_view_error_requests?: boolean
  channel_monitor_enabled?: boolean
}

export interface LoginAgreementDocument {
  id: string
  title: string
  content_md: string
}

export interface SendVerifyCodeResponse {
  message: string
  countdown: number
}

export interface ForgotPasswordResponse {
  message: string
}

export interface ResetPasswordResponse {
  message: string
}
