import type { ApiKey, ModelStat, PaginatedResponse, TrendPoint, UsageLog, UsageRequestType } from '@/api/types'

export interface AdminDashboardStats {
  total_users: number
  today_new_users: number
  active_users: number
  hourly_active_users: number
  stats_updated_at: string
  stats_stale: boolean
  total_api_keys: number
  active_api_keys: number
  total_accounts: number
  normal_accounts: number
  error_accounts: number
  ratelimit_accounts: number
  overload_accounts: number
  total_requests: number
  total_input_tokens: number
  total_output_tokens: number
  total_cache_creation_tokens: number
  total_cache_read_tokens: number
  total_tokens: number
  total_cost: number
  total_actual_cost: number
  total_account_cost: number
  today_requests: number
  today_input_tokens: number
  today_output_tokens: number
  today_cache_creation_tokens: number
  today_cache_read_tokens: number
  today_tokens: number
  today_cost: number
  today_actual_cost: number
  today_account_cost: number
  average_duration_ms: number
  uptime: number
  rpm: number
  tpm: number
}

export interface AdminGroupStat {
  group_id: number
  group_name: string
  requests: number
  total_tokens: number
  cost: number
  actual_cost: number
  account_cost?: number
}

export interface AdminUserTrendPoint {
  date: string
  user_id: number
  email: string
  username: string
  requests: number
  tokens: number
  cost: number
  actual_cost: number
}

export interface AdminDashboardSnapshot {
  generated_at: string
  start_date: string
  end_date: string
  granularity: string
  stats?: AdminDashboardStats
  trend?: TrendPoint[]
  models?: Array<ModelStat & { account_cost?: number }>
  groups?: AdminGroupStat[]
  users_trend?: AdminUserTrendPoint[]
}

export interface AdminDashboardRealtime {
  active_requests: number
  requests_per_minute: number
  average_response_time: number
  error_rate: number
}

export interface AdminDashboardSnapshotParams {
  start_date?: string
  end_date?: string
  granularity?: 'day' | 'hour'
  user_id?: number
  api_key_id?: number
  model?: string
  account_id?: number
  group_id?: number
  request_type?: UsageRequestType
  stream?: boolean
  billing_type?: number
}

export type AdminAccountPlatform = 'anthropic' | 'openai' | 'gemini' | 'antigravity' | 'grok'
export type AdminAccountType = 'oauth' | 'setup-token' | 'apikey' | 'upstream' | 'bedrock' | 'service_account'
export type AdminAccountStatus = 'active' | 'inactive' | 'error'

export interface AdminAccountModel {
  id: string
  type?: string
  object?: string
  display_name?: string
  owned_by?: string
  created_at?: string
}

export interface AdminAccountUsageWindowStats {
  requests: number
  tokens: number
  cost: number
  standard_cost?: number
  user_cost?: number
}

export interface AdminAccountUsageProgress {
  utilization: number
  resets_at: string | null
  remaining_seconds: number
  window_stats?: AdminAccountUsageWindowStats | null
  used_requests?: number
  limit_requests?: number
}

export interface AdminAccountQuotaWindow {
  limit?: number | null
  remaining?: number | null
  reset_at?: string | null
  reset_unix?: number | null
}

export interface AdminAccountUsageInfo {
  source?: 'passive' | 'active'
  updated_at: string | null
  five_hour: AdminAccountUsageProgress | null
  seven_day: AdminAccountUsageProgress | null
  seven_day_sonnet: AdminAccountUsageProgress | null
  seven_day_fable?: AdminAccountUsageProgress | null
  gemini_shared_daily?: AdminAccountUsageProgress | null
  gemini_pro_daily?: AdminAccountUsageProgress | null
  gemini_flash_daily?: AdminAccountUsageProgress | null
  gemini_shared_minute?: AdminAccountUsageProgress | null
  gemini_pro_minute?: AdminAccountUsageProgress | null
  gemini_flash_minute?: AdminAccountUsageProgress | null
  antigravity_quota?: Record<string, { utilization: number; reset_time: string }> | null
  grok_request_quota?: AdminAccountQuotaWindow | null
  grok_token_quota?: AdminAccountQuotaWindow | null
  subscription_tier?: string
}

export interface AdminAccountTestRequest {
  model_id: string
  prompt: string
  mode?: string
}

export interface AdminAccountGroup {
  id: number
  name: string
  platform?: string
}

export interface AdminAccount {
  id: number
  name: string
  notes?: string | null
  platform: AdminAccountPlatform
  type: AdminAccountType
  credentials_status?: Record<string, boolean>
  proxy_id: number | null
  concurrency: number
  current_concurrency?: number
  priority: number
  rate_multiplier?: number
  status: AdminAccountStatus
  error_message: string | null
  schedulable: boolean
  last_used_at: string | null
  expires_at: number | null
  rate_limited_at: string | null
  rate_limit_reset_at: string | null
  overload_until: string | null
  temp_unschedulable_until: string | null
  temp_unschedulable_reason: string | null
  created_at: string
  updated_at: string
  group_ids?: number[]
  groups?: AdminAccountGroup[]
}

export interface AdminAccountListParams {
  page?: number
  page_size?: number
  platform?: string
  type?: string
  status?: string
  group?: string
  search?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export interface CreateAdminAccountRequest {
  name: string
  notes?: string | null
  platform: AdminAccountPlatform
  type: AdminAccountType
  credentials: Record<string, unknown>
  proxy_id?: number | null
  concurrency?: number
  priority?: number
  rate_multiplier?: number
  group_ids?: number[]
  expires_at?: number | null
  auto_pause_on_expired?: boolean
}

export interface UpdateAdminAccountRequest {
  name?: string
  notes?: string | null
  type?: AdminAccountType
  credentials?: Record<string, unknown>
  proxy_id?: number | null
  concurrency?: number
  priority?: number
  rate_multiplier?: number
  status?: AdminAccountStatus
  group_ids?: number[]
  expires_at?: number | null
  auto_pause_on_expired?: boolean
}

export type AdminAccountListResponse = PaginatedResponse<AdminAccount>

export interface AdminAccountTestResult {
  success: boolean
  message: string
  latency_ms?: number
}

export interface AdminUser {
  id: number
  username: string
  email: string
  avatar_url?: string | null
  role: 'admin' | 'user'
  balance: number
  frozen_balance?: number
  concurrency: number
  current_concurrency?: number
  rpm_limit?: number
  status: 'active' | 'disabled'
  allowed_groups: number[] | null
  group_rates?: Record<number, number>
  notes: string
  last_active_at?: string | null
  last_used_at?: string | null
  created_at: string
  updated_at: string
  deleted_at?: string | null
  subscriptions?: Array<{
    id: number
    status: string
    group_id: number
    expires_at: string | null
  }>
  auth_bindings?: Record<string, boolean | Record<string, unknown>>
  identity_bindings?: Record<string, boolean | Record<string, unknown>>
}

export interface AdminUserListParams {
  page?: number
  page_size?: number
  status?: 'active' | 'disabled'
  role?: 'admin' | 'user'
  search?: string
  group_name?: string
  api_key_group_id?: number
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export interface CreateAdminUserRequest {
  email: string
  password: string
  username?: string
  notes?: string
  role?: 'admin' | 'user'
  balance?: number
  concurrency?: number
  rpm_limit?: number
  allowed_groups?: number[] | null
}

export interface UpdateAdminUserRequest {
  email?: string
  password?: string
  username?: string
  notes?: string
  role?: 'admin' | 'user'
  balance?: number
  concurrency?: number
  rpm_limit?: number
  status?: 'active' | 'disabled'
  allowed_groups?: number[] | null
  group_rates?: Record<number, number | null>
}

export interface AdminGroupOption {
  id: number
  name: string
  platform?: string
  is_exclusive?: boolean
  status?: string
}

export type AdminGroupPlatform = 'anthropic' | 'openai' | 'gemini' | 'antigravity' | 'grok' | 'composite'
export type AdminGroupSubscriptionType = 'standard' | 'subscription'

export interface AdminGroup {
  id: number
  name: string
  description: string | null
  platform: AdminGroupPlatform
  rate_multiplier: number
  rpm_limit?: number
  is_exclusive: boolean
  status: 'active' | 'inactive'
  subscription_type: AdminGroupSubscriptionType
  daily_limit_usd: number | null
  weekly_limit_usd: number | null
  monthly_limit_usd: number | null
  account_count?: number
  active_account_count?: number
  rate_limited_account_count?: number
  sort_order: number
  created_at: string
  updated_at: string
}

export interface AdminGroupListParams {
  page?: number
  page_size?: number
  search?: string
  platform?: AdminGroupPlatform
  status?: 'active' | 'inactive'
}

export interface AdminGroupListResponse extends PaginatedResponse<AdminGroup> {}

export interface CreateAdminGroupRequest {
  name: string
  description?: string | null
  platform?: AdminGroupPlatform
  rate_multiplier?: number
  rpm_limit?: number
  is_exclusive?: boolean
  subscription_type?: AdminGroupSubscriptionType
  daily_limit_usd?: number | null
  weekly_limit_usd?: number | null
  monthly_limit_usd?: number | null
}

export interface UpdateAdminGroupRequest extends Partial<CreateAdminGroupRequest> {
  status?: 'active' | 'inactive'
}

export interface AdminBalanceUpdateRequest {
  balance: number
  operation: 'set' | 'add' | 'subtract'
  notes?: string
}

export interface AdminBindIdentityRequest {
  provider_type: string
  provider_key: string
  provider_subject: string
  issuer?: string | null
  metadata?: Record<string, unknown> | null
  channel?: {
    channel: string
    channel_app_id: string
    channel_subject: string
    metadata?: Record<string, unknown> | null
  }
}

export interface AdminBoundIdentity {
  user_id: number
  provider_type: string
  provider_key: string
  provider_subject: string
  verified_at?: string | null
  issuer?: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface AdminUserUsageSummary {
  total_requests: number
  total_cost: number
  total_tokens: number
}

export interface AdminBalanceHistoryItem {
  id: number
  type: string
  value: number
  status: string
  created_at: string
  notes?: string
}

export interface AdminBalanceHistoryResponse extends PaginatedResponse<AdminBalanceHistoryItem> {
  total_recharged: number
}

export type AdminQuotaPlatform = 'anthropic' | 'openai' | 'gemini' | 'antigravity' | 'grok'
export type AdminQuotaWindow = 'daily' | 'weekly' | 'monthly'

export interface AdminPlatformQuota {
  platform: AdminQuotaPlatform
  daily_limit_usd: number | null
  weekly_limit_usd: number | null
  monthly_limit_usd: number | null
  daily_usage_usd: number
  weekly_usage_usd: number
  monthly_usage_usd: number
  daily_window_resets_at?: string | null
  weekly_window_resets_at?: string | null
  monthly_window_resets_at?: string | null
}

export type AdminPlatformQuotaUpdate = Pick<
  AdminPlatformQuota,
  'platform' | 'daily_limit_usd' | 'weekly_limit_usd' | 'monthly_limit_usd'
>

export type AdminUserListResponse = PaginatedResponse<AdminUser>
export type AdminUserApiKeysResponse = PaginatedResponse<ApiKey>

export interface AdminUsageLog extends UsageLog {
  user_id?: number
  account_id?: number | null
  request_id?: string
  upstream_model?: string | null
  account_rate_multiplier?: number | null
  account_stats_cost?: number | null
  ip_address?: string | null
  user?: { id: number; email: string; username?: string }
  account?: { id: number; name: string }
}

export interface AdminUsageStats {
  total_requests: number
  total_input_tokens: number
  total_output_tokens: number
  total_cache_tokens: number
  total_cache_creation_tokens: number
  total_cache_read_tokens: number
  total_tokens: number
  total_cost: number
  total_actual_cost: number
  total_account_cost: number
  average_duration_ms: number
}

export interface AdminUsageParams {
  page?: number
  page_size?: number
  start_date?: string
  end_date?: string
  user_id?: number
  api_key_id?: number
  account_id?: number
  group_id?: number
  model?: string
  request_type?: UsageRequestType
  billing_type?: number
  billing_mode?: string
}

export interface AdminUsageError {
  id: number
  created_at: string
  phase: string
  type: string
  error_owner: string
  error_source: string
  severity: string
  status_code: number
  platform: string
  model: string
  resolved: boolean
  request_id: string
  message: string
  user_id?: number | null
  user_email: string
  api_key_id?: number | null
  api_key_name?: string
  account_id?: number | null
  account_name: string
  group_id?: number | null
  group_name: string
  client_ip?: string | null
  request_path?: string
  user_agent?: string
  error_body?: string
  upstream_status_code?: number | null
  upstream_error_message?: string
}

export type AdminMonitorProvider = 'openai' | 'anthropic' | 'gemini' | 'grok'
export type AdminMonitorStatus = 'operational' | 'degraded' | 'failed' | 'error' | ''

export interface AdminChannelMonitor {
  id: number
  name: string
  provider: AdminMonitorProvider
  api_mode: 'chat_completions' | 'responses'
  endpoint: string
  api_key_masked: string
  api_key_decrypt_failed?: boolean
  primary_model: string
  extra_models: string[]
  group_name: string
  enabled: boolean
  interval_seconds: number
  jitter_seconds: number
  last_checked_at: string | null
  created_at: string
  updated_at: string
  primary_status: AdminMonitorStatus
  primary_latency_ms: number | null
  availability_7d: number
}

export interface AdminChannelMonitorInput {
  name: string
  provider: AdminMonitorProvider
  api_mode?: 'chat_completions' | 'responses'
  endpoint: string
  api_key: string
  primary_model: string
  extra_models?: string[]
  group_name?: string
  enabled?: boolean
  interval_seconds: number
  jitter_seconds?: number
}

export interface AdminMonitorHistoryItem {
  id: number
  model: string
  status: Exclude<AdminMonitorStatus, ''>
  latency_ms: number | null
  ping_latency_ms: number | null
  message: string
  checked_at: string
}

export interface AdminAuditLog {
  id: number
  created_at: string
  actor_user_id?: number
  actor_email: string
  actor_role: string
  auth_method: string
  credential_masked: string
  action: string
  method: string
  path: string
  request_id: string
  client_ip: string
  user_agent: string
  request_body?: string
  status_code: number
  latency_ms: number
  extra?: Record<string, unknown>
}

export interface AdminSubscription {
  id:number;user_id:number;group_id:number;status:'active'|'expired'|'revoked'|'suspended';starts_at:string;expires_at:string|null;daily_usage_usd:number;weekly_usage_usd:number;monthly_usage_usd:number;created_at:string;updated_at:string;revoked_at?:string|null
  user?:{id:number;email:string;username:string};group?:{id:number;name:string;platform?:string;daily_limit_usd?:number|null;weekly_limit_usd?:number|null;monthly_limit_usd?:number|null}
}
export interface AdminSubscriptionQuotaWindow {
  limit_usd: number
  used_usd: number
  remaining_usd: number
  percentage: number
  window_start?: string
  resets_at?: string
  resets_in_seconds?: number | null
}
export interface AdminSubscriptionProgress {
  id: number
  group_name: string
  daily?: AdminSubscriptionQuotaWindow | null
  weekly?: AdminSubscriptionQuotaWindow | null
  monthly?: AdminSubscriptionQuotaWindow | null
  expires_at: string | null
  expires_in_days: number
}
export interface AdminBulkAssignResult {
  success_count: number
  created_count: number
  reused_count: number
  failed_count: number
  subscriptions: AdminSubscription[]
  errors: string[]
  statuses?: Record<string, string>
}
export type AdminRedeemCodeType='balance'|'concurrency'|'subscription'|'invitation'
export interface AdminRedeemCode {id:number;code:string;type:AdminRedeemCodeType;value:number;status:'active'|'used'|'expired'|'unused'|'disabled';used_by:number|null;used_at:string|null;created_at:string;expires_at?:string|null;notes?:string;group_id?:number|null;validity_days?:number;user?:{id:number;email:string};group?:{id:number;name:string}}
export interface AdminRedeemStats {total_codes:number;active_codes:number;used_codes:number;expired_codes:number;total_value_distributed:number;by_type:Record<AdminRedeemCodeType,number>}
export type AdminAnnouncementStatus='draft'|'active'|'archived';export type AdminAnnouncementNotifyMode='silent'|'popup'
export interface AdminAnnouncementTargeting {any_of?:Array<{all_of?:Array<{type:'subscription'|'balance';operator:'in'|'gt'|'gte'|'lt'|'lte'|'eq';group_ids?:number[];value?:number}>}>}
export interface AdminAnnouncement {id:number;title:string;content:string;status:AdminAnnouncementStatus;notify_mode:AdminAnnouncementNotifyMode;targeting:AdminAnnouncementTargeting;starts_at?:string;ends_at?:string;created_at:string;updated_at:string}
export interface AdminAnnouncementInput {title:string;content:string;status?:AdminAnnouncementStatus;notify_mode?:AdminAnnouncementNotifyMode;targeting:AdminAnnouncementTargeting;starts_at?:number;ends_at?:number}
export interface AdminAnnouncementReadStatus {user_id:number;email:string;username:string;balance:number;eligible:boolean;read_at?:string}
