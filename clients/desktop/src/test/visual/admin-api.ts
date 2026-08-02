const now = '2026-08-02T08:00:00Z'

const account = {
  id: 1,
  name: 'Claude 主池',
  platform: 'anthropic' as const,
  type: 'apikey' as const,
  proxy_id: null,
  concurrency: 10,
  current_concurrency: 3,
  priority: 10,
  status: 'active' as const,
  error_message: null,
  schedulable: true,
  last_used_at: now,
  expires_at: null,
  rate_limited_at: null,
  rate_limit_reset_at: null,
  overload_until: null,
  temp_unschedulable_until: null,
  temp_unschedulable_reason: null,
  created_at: now,
  updated_at: now,
  groups: [{ id: 1, name: 'Claude Code' }],
}

const user = {
  id: 7,
  username: 'Lin',
  email: 'lin@example.com',
  role: 'user' as const,
  balance: 32.5,
  frozen_balance: 2,
  concurrency: 8,
  current_concurrency: 2,
  rpm_limit: 60,
  status: 'active' as const,
  allowed_groups: [1],
  group_rates: {},
  notes: '主账号',
  last_active_at: now,
  last_used_at: now,
  created_at: now,
  updated_at: now,
  subscriptions: [{ id: 3, status: 'active', group_id: 1, expires_at: '2026-09-01T00:00:00Z' }],
}

const adminGroup = {
  id: 1,
  name: 'Claude Code',
  description: 'Anthropic 订阅额度与请求调度',
  platform: 'anthropic' as const,
  rate_multiplier: 1.2,
  rpm_limit: 120,
  is_exclusive: true,
  status: 'active' as const,
  subscription_type: 'subscription' as const,
  daily_limit_usd: 10,
  weekly_limit_usd: 50,
  monthly_limit_usd: 200,
  account_count: 6,
  active_account_count: 5,
  rate_limited_account_count: 1,
  sort_order: 1,
  created_at: now,
  updated_at: now,
}

const monitor = {
  id: 4,
  name: 'Claude Monitor',
  provider: 'anthropic',
  api_mode: 'chat_completions',
  endpoint: 'https://api.example.com',
  api_key_masked: 'sk-***',
  primary_model: 'claude-sonnet-4',
  extra_models: [],
  group_name: 'Claude Code',
  enabled: true,
  interval_seconds: 300,
  jitter_seconds: 0,
  last_checked_at: now,
  created_at: now,
  updated_at: now,
  primary_status: 'operational',
  primary_latency_ms: 420,
  availability_7d: 99.9,
}

const auditLog = {
  id: 12,
  created_at: now,
  actor_email: 'admin@linai.local',
  actor_role: 'admin',
  auth_method: 'bearer',
  credential_masked: 'Bearer ***',
  action: 'user.update',
  method: 'PUT',
  path: '/api/v1/admin/users/7',
  request_id: 'req-preview-1',
  client_ip: '127.0.0.1',
  user_agent: 'LinAI Desktop',
  status_code: 200,
  latency_ms: 28,
  request_body: '{"password":"***"}',
}

const subscription = {
  id: 3,
  user_id: 7,
  group_id: 1,
  status: 'active',
  starts_at: '2026-08-01T00:00:00Z',
  expires_at: '2026-09-01T00:00:00Z',
  daily_usage_usd: 4,
  weekly_usage_usd: 12,
  monthly_usage_usd: 20,
  created_at: now,
  updated_at: now,
  user: { id: 7, email: user.email, username: user.username },
  group: { id: 1, name: 'Claude Code', daily_limit_usd: 10, weekly_limit_usd: 50, monthly_limit_usd: 100 },
}

const redeemCode = {
  id: 1,
  code: 'LINAI-PREVIEW-2026',
  type: 'balance',
  value: 20,
  status: 'active',
  used_by: null,
  used_at: null,
  expires_at: '2026-09-01T00:00:00Z',
  created_at: now,
}

const announcement = {
  id: 8,
  title: 'LinAI 桌面端管理工作区已上线',
  content: '现在可以在桌面客户端中完成常用的运营与管理操作。',
  status: 'active',
  notify_mode: 'silent',
  targeting: {},
  starts_at: now,
  created_at: now,
  updated_at: now,
}

export async function getAdminDashboardSnapshot() {
  return {
    generated_at: now,
    start_date: '2026-07-27',
    end_date: '2026-08-02',
    granularity: 'day',
    stats: {
      total_users: 128, today_new_users: 6, active_users: 42, hourly_active_users: 9,
      stats_updated_at: now, stats_stale: false, total_api_keys: 70, active_api_keys: 58,
      total_accounts: 24, normal_accounts: 19, error_accounts: 2, ratelimit_accounts: 2,
      overload_accounts: 1, total_requests: 90000, total_input_tokens: 4000000,
      total_output_tokens: 1000000, total_cache_creation_tokens: 100000,
      total_cache_read_tokens: 900000, total_tokens: 6000000, total_cost: 1200,
      total_actual_cost: 980, total_account_cost: 410, today_requests: 3200,
      today_input_tokens: 400000, today_output_tokens: 100000, today_cache_creation_tokens: 10000,
      today_cache_read_tokens: 90000, today_tokens: 600000, today_cost: 120,
      today_actual_cost: 98, today_account_cost: 41, average_duration_ms: 780,
      uptime: 172800, rpm: 64, tpm: 180000,
    },
    trend: [
      { date: '2026-08-01', requests: 2800, total_tokens: 520000 },
      { date: '2026-08-02', requests: 3200, total_tokens: 600000 },
    ],
    models: [
      { model: 'claude-sonnet-4', requests: 1800, total_tokens: 400000, actual_cost: 62 },
      { model: 'gpt-5', requests: 900, total_tokens: 160000, actual_cost: 28 },
    ],
    groups: [{ group_id: 1, group_name: 'Claude Code', requests: 1900, total_tokens: 420000, cost: 80, actual_cost: 64 }],
  }
}

export async function getAdminDashboardRealtime() {
  return { active_requests: 3, requests_per_minute: 64, average_response_time: 680, error_rate: 0.8 }
}

export async function listAdminAccounts() {
  return { items: [account, { ...account, id: 2, name: 'Codex 备用', platform: 'openai' as const, status: 'error' as const, schedulable: false, error_message: 'refresh token expired', groups: [{ id: 2, name: 'Codex' }] }], total: 2, page: 1, page_size: 20 }
}
export async function getAdminAccount() { return account }
export async function createAdminAccount(payload: Record<string, unknown>) { return { ...account, ...payload } }
export async function updateAdminAccount(_id: number, payload: Record<string, unknown>) { return { ...account, ...payload } }
export async function testAdminAccount() { return { success: true, message: '连接正常', latency_ms: 420 } }
export async function refreshAdminAccountCredentials() { return account }
export async function clearAdminAccountError() { return account }
export async function recoverAdminAccount() { return account }
export async function setAdminAccountSchedulable(_id: number, schedulable: boolean) { return { ...account, schedulable } }

export async function listAdminUsers() {
  return { items: [user, { ...user, id: 8, username: 'Nova', email: 'nova@example.com', balance: 8.2, current_concurrency: 0 }], total: 2, page: 1, page_size: 20 }
}
export async function getAdminUser() { return user }
export async function getAdminGroups() { return [{ id: 1, name: 'Claude Code', platform: 'anthropic', is_exclusive: true }] }
export async function listAdminGroups() { return { items: [adminGroup, { ...adminGroup, id: 2, name: 'Codex Team', platform: 'openai' as const, description: 'OpenAI 团队订阅', rate_multiplier: 1, rpm_limit: 90, monthly_limit_usd: 160 }], total: 2, page: 1, page_size: 20 } }
export async function createAdminGroup(payload: Record<string, unknown>) { return { ...adminGroup, ...payload } }
export async function updateAdminGroup(_id: number, payload: Record<string, unknown>) { return { ...adminGroup, ...payload } }
export async function updateAdminGroupStatus(_id: number, status: 'active' | 'inactive') { return { ...adminGroup, status } }
export async function createAdminUser(payload: Record<string, unknown>) { return { ...user, ...payload } }
export async function updateAdminUser(_id: number, payload: Record<string, unknown>) { return { ...user, ...payload } }
export async function deleteAdminUser() { return { message: 'deleted' } }
export async function updateAdminUserBalance() { return { ...user, balance: 52.5 } }
export async function replaceAdminUserGroup() { return { migrated_keys: 1 } }
export async function bindAdminUserIdentity() { return { provider_type: 'oidc', provider_subject: 'preview-user' } }
export async function getAdminUserApiKeys() { return { items: [{ id: 11, name: 'Desktop Key', status: 'active', quota: 0, quota_used: 8 }], total: 1, page: 1, page_size: 20 } }
export async function getAdminUserUsage() { return { total_requests: 2400, total_tokens: 880000, total_cost: 24.8 } }
export async function getAdminUserBalanceHistory() { return { items: [{ id: 1, type: 'admin_balance', value: 20, status: 'used', created_at: now, notes: 'manual' }], total: 1, page: 1, page_size: 20, total_recharged: 20 } }
export async function getAdminUserPlatformQuotas() { return { platform_quotas: [{ platform: 'anthropic', daily_limit_usd: 10, weekly_limit_usd: 50, monthly_limit_usd: 100, daily_usage_usd: 4, weekly_usage_usd: 12, monthly_usage_usd: 20 }] } }
export async function updateAdminUserPlatformQuotas() { return { platform_quotas: [] } }
export async function resetAdminUserPlatformQuota() { return { platform_quotas: [] } }

export async function getAdminUsageStats() { return { total_requests: 1200, total_tokens: 800000, total_actual_cost: 42, total_account_cost: 18, average_duration_ms: 720 } }
export async function listAdminUsage() { return { items: [{ id: 1, user, account, api_key: { name: 'Desktop Key' }, model: 'claude-sonnet-4', input_tokens: 100, output_tokens: 50, cache_creation_tokens: 0, cache_read_tokens: 0, actual_cost: 1.2, duration_ms: 620, stream: true, billing_type: 0, created_at: now }], total: 1, page: 1, page_size: 20 } }
export async function listAdminUsageErrors() { return { items: [{ id: 9, user_email: user.email, account_name: account.name, model: 'claude-sonnet-4', status_code: 429, message: 'rate limited', platform: 'anthropic', created_at: now }], total: 1, page: 1, page_size: 20 } }
export async function getAdminUsageError() { return { id: 9, error_body: 'upstream limit', message: 'rate limited' } }

export async function listAdminChannelMonitors() { return { items: [monitor], total: 1, page: 1, page_size: 20 } }
export async function getAdminChannelMonitor() { return monitor }
export async function createAdminChannelMonitor(payload: Record<string, unknown>) { return { ...monitor, ...payload } }
export async function updateAdminChannelMonitor(_id: number, payload: Record<string, unknown>) { return { ...monitor, ...payload } }
export async function deleteAdminChannelMonitor() {}
export async function runAdminChannelMonitor() { return { results: [{ id: 1, model: 'claude-sonnet-4', status: 'operational', latency_ms: 390, ping_latency_ms: 40, message: 'ok', checked_at: now }] } }
export async function getAdminChannelMonitorHistory() { return { items: [{ id: 1, model: 'claude-sonnet-4', status: 'operational', latency_ms: 390, ping_latency_ms: 40, message: 'ok', checked_at: now }] } }

export async function listAdminAuditLogs() { return { items: [auditLog], total: 1, page: 1, page_size: 20 } }
export async function getAdminAuditLog() { return auditLog }

export async function listAdminSubscriptions() { return { items: [subscription], total: 1, page: 1, page_size: 20 } }
export async function getAdminSubscriptionProgress() { return { subscription_id: 3, daily: { used: 4, limit: 10, percentage: 40 }, weekly: { used: 12, limit: 50, percentage: 24 }, monthly: { used: 20, limit: 100, percentage: 20 }, days_remaining: 30 } }
export async function assignAdminSubscription() { return subscription }
export async function bulkAssignAdminSubscriptions() { return { success_count: 2, created_count: 2, reused_count: 0, failed_count: 0, subscriptions: [subscription], errors: [] } }
export async function extendAdminSubscription() { return subscription }
export async function resetAdminSubscriptionQuota() { return subscription }
export async function revokeAdminSubscription() { return { message: 'ok' } }
export async function restoreAdminSubscription() { return subscription }

export async function listAdminRedeemCodes() { return { items: [redeemCode], total: 1, page: 1, page_size: 20 } }
export async function getAdminRedeemStats() { return { total_codes: 10, active_codes: 6, used_codes: 3, expired_codes: 1, total_value_distributed: 60, by_type: { balance: 8, concurrency: 1, subscription: 1, invitation: 0 } } }
export async function generateAdminRedeemCodes() { return [redeemCode] }
export async function batchUpdateAdminRedeemCodes() { return { updated: 1, message: 'ok' } }
export async function batchDeleteAdminRedeemCodes() { return { deleted: 1, message: 'ok' } }
export async function exportAdminRedeemCodes() { return 'id,code\n1,LINAI-PREVIEW-2026\n' }
export async function expireAdminRedeemCode() { return { ...redeemCode, status: 'expired' } }
export async function deleteAdminRedeemCode() { return { message: 'ok' } }

export async function listAdminAnnouncements() { return { items: [announcement], total: 1, page: 1, page_size: 20 } }
export async function createAdminAnnouncement(payload: Record<string, unknown>) { return { ...announcement, ...payload } }
export async function updateAdminAnnouncement(_id: number, payload: Record<string, unknown>) { return { ...announcement, ...payload } }
export async function deleteAdminAnnouncement() { return { message: 'ok' } }
export async function getAdminAnnouncementReadStatus() { return { items: [{ user_id: 7, email: user.email, username: user.username, balance: user.balance, eligible: true, read_at: now }], total: 1, page: 1, page_size: 20 } }
