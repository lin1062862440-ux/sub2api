import type {
  ApiKey,
  ApiKeyGroup,
  CreateApiKeyRequest,
  UpdateApiKeyRequest,
  User,
} from '@/api/types'
import { previewBoolean, previewRouteFlag } from './preview-query'

const today = new Date()
const visualQuery = new URLSearchParams(window.location.search)
const slowPreview = previewBoolean(visualQuery, 'slow')

function previewFlag(name: 'empty' | 'error', route: string) {
  return previewRouteFlag(visualQuery, name, route)
}

function assertPreviewRoute(route: string) {
  if (previewFlag('error', route)) throw new Error(`visual preview ${route} error`)
}

async function maybeDelay() {
  if (slowPreview) await new Promise((resolve) => window.setTimeout(resolve, 900))
}

export type { User } from '@/api/types'

const visualUser: User = {
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

export function isTotpRequired(response: { requires_2fa?: boolean }) {
  return response.requires_2fa === true
}

export async function getCurrentUser() {
  return visualUser
}

export async function login() {
  return {
    access_token: 'visual-access-token',
    refresh_token: 'visual-refresh-token',
    token_type: 'Bearer',
    user: visualUser,
  }
}

export async function loginWith2FA() {
  return login()
}

function day(offset: number): string {
  const value = new Date(today)
  value.setDate(value.getDate() + offset)
  return value.toISOString().slice(0, 10)
}

const visualApiKeyGroups: ApiKeyGroup[] = [
  { id: 1, name: '余粮消费', description: 'openai', platform: 'openai', rate_multiplier: 1, subscription_type: 'standard' },
  { id: 2, name: '生图分组', description: 'openai', platform: 'openai', rate_multiplier: 1, subscription_type: 'standard' },
  { id: 3, name: 'grok', description: 'grok', platform: 'grok', rate_multiplier: 1, subscription_type: 'standard' },
  { id: 4, name: 'Claude', description: 'kiro 独立反代，稳定满', platform: 'anthropic', rate_multiplier: 1, subscription_type: 'standard' },
]

let visualApiKeys: ApiKey[] = [
  {
    id: 1,
    user_id: 1,
    key: 'sk-e29b47f1f81248df8d37',
    name: '1',
    group_id: 4,
    status: 'active',
    ip_whitelist: [],
    ip_blacklist: [],
    last_used_at: new Date(Date.now() - 18 * 60_000).toISOString(),
    last_used_ip: '127.0.0.1',
    quota: 0,
    quota_used: 0,
    expires_at: null,
    created_at: day(-18) + 'T08:00:00Z',
    updated_at: new Date().toISOString(),
    current_concurrency: 0,
    group: visualApiKeyGroups[3],
    rate_limit_5h: 0,
    rate_limit_1d: 0,
    rate_limit_7d: 0,
    usage_5h: 0,
    usage_1d: 0,
    usage_7d: 0,
    reset_5h_at: null,
    reset_1d_at: null,
    reset_7d_at: null,
  },
]

export async function getApiKeys(params: {
  page?: number
  page_size?: number
  search?: string
  status?: string
  group_id?: number
} = {}) {
  await maybeDelay()
  const page = params.page ?? 1
  const pageSize = params.page_size ?? 8
  const query = params.search?.trim().toLowerCase()
  const filtered = visualApiKeys.filter((key) => {
    const matchesSearch = !query || key.name.toLowerCase().includes(query) || key.key.toLowerCase().includes(query)
    const matchesStatus = !params.status || key.status === params.status
    const matchesGroup = params.group_id === undefined || key.group_id === params.group_id
    return matchesSearch && matchesStatus && matchesGroup
  })
  const start = (page - 1) * pageSize
  return {
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    page_size: pageSize,
    pages: Math.max(1, Math.ceil(filtered.length / pageSize)),
  }
}

export async function getApiKeyGroups() {
  await maybeDelay()
  return visualApiKeyGroups
}

export async function getApiKeyUsage(apiKeyIds: number[]) {
  await maybeDelay()
  return {
    stats: Object.fromEntries(apiKeyIds.map((id) => [String(id), {
      api_key_id: id,
      today_actual_cost: 0,
      total_actual_cost: id === 1 ? 400.25 : 0,
    }])),
  }
}

export async function createApiKey(payload: CreateApiKeyRequest) {
  const now = new Date()
  const group = visualApiKeyGroups.find((item) => item.id === payload.group_id)
  const created: ApiKey = {
    id: Math.max(0, ...visualApiKeys.map((key) => key.id)) + 1,
    user_id: 1,
    key: payload.custom_key || `sk-visual-${Date.now()}`,
    name: payload.name,
    group_id: payload.group_id,
    status: 'active',
    ip_whitelist: payload.ip_whitelist || [],
    ip_blacklist: payload.ip_blacklist || [],
    last_used_at: null,
    last_used_ip: null,
    quota: payload.quota || 0,
    quota_used: 0,
    expires_at: payload.expires_in_days ? new Date(now.getTime() + payload.expires_in_days * 86_400_000).toISOString() : null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    current_concurrency: 0,
    group,
    rate_limit_5h: payload.rate_limit_5h || 0,
    rate_limit_1d: payload.rate_limit_1d || 0,
    rate_limit_7d: payload.rate_limit_7d || 0,
    usage_5h: 0,
    usage_1d: 0,
    usage_7d: 0,
    reset_5h_at: null,
    reset_1d_at: null,
    reset_7d_at: null,
  }
  visualApiKeys = [created, ...visualApiKeys]
  return created
}

export async function updateApiKey(id: number, payload: UpdateApiKeyRequest) {
  const current = visualApiKeys.find((key) => key.id === id)
  if (!current) throw new Error('未找到 API 密钥')
  const group = payload.group_id === undefined
    ? current.group
    : visualApiKeyGroups.find((item) => item.id === payload.group_id)
  const updated: ApiKey = {
    ...current,
    ...payload,
    expires_at: payload.expires_at === '' ? null : (payload.expires_at ?? current.expires_at),
    group,
    updated_at: new Date().toISOString(),
  }
  visualApiKeys = visualApiKeys.map((key) => key.id === id ? updated : key)
  return updated
}

export async function deleteApiKey(id: number) {
  visualApiKeys = visualApiKeys.filter((key) => key.id !== id)
  return { message: 'API key deleted' }
}

export async function getDashboardStats() {
  await maybeDelay()
  return {
    total_api_keys: visualApiKeys.length,
    active_api_keys: visualApiKeys.filter((key) => key.status === 'active').length,
    total_requests: 186420,
    total_input_tokens: 45280000,
    total_output_tokens: 12460000,
    total_cache_creation_tokens: 4820000,
    total_cache_read_tokens: 22140000,
    total_tokens: 84700000,
    total_cost: 642.18,
    total_actual_cost: 518.42,
    today_requests: 8420,
    today_input_tokens: 2160000,
    today_output_tokens: 640000,
    today_cache_creation_tokens: 180000,
    today_cache_read_tokens: 920000,
    today_tokens: 3900000,
    today_cost: 31.2,
    today_actual_cost: 0,
    average_duration_ms: 734,
    rpm: 38,
    tpm: 68420,
    by_platform: [
      { platform: 'anthropic', total_requests: 112400, total_tokens: 52800000, total_actual_cost: 342.18 },
      { platform: 'openai', total_requests: 54820, total_tokens: 24100000, total_actual_cost: 142.74 },
      { platform: 'gemini', total_requests: 19200, total_tokens: 7800000, total_actual_cost: 33.5 },
    ],
  }
}

export async function getDashboardTrend() {
  return {
    trend: [
      5240,
      7180,
      6420,
      9380,
      11040,
      9880,
      8420,
    ].map((requests, index) => ({
      date: day(index - 6),
      requests,
      input_tokens: requests * 240,
      output_tokens: requests * 72,
      cache_creation_tokens: requests * 18,
      cache_read_tokens: requests * 86,
      total_tokens: requests * 416,
      cost: requests * 0.0037,
      actual_cost: requests * 0.0029,
    })),
  }
}

export async function getDashboardModels() {
  return {
    models: [
      { model: 'claude-sonnet-4', requests: 68400, total_tokens: 31200000, actual_cost: 218.4 },
      { model: 'gpt-5.2-codex', requests: 49200, total_tokens: 24100000, actual_cost: 156.82 },
      { model: 'gemini-2.5-pro', requests: 31800, total_tokens: 17400000, actual_cost: 86.32 },
      { model: 'claude-opus-4', requests: 19420, total_tokens: 12000000, actual_cost: 56.88 },
    ],
  }
}

export async function getUsageStats() {
  await maybeDelay()
  return {
    total_requests: 1286,
    total_input_tokens: 4682400,
    total_output_tokens: 1268800,
    total_cache_tokens: 2174600,
    total_cache_read_tokens: 1842200,
    total_cache_creation_tokens: 332400,
    total_tokens: 8125800,
    total_cost: 48.72,
    total_actual_cost: 36.46,
    average_duration_ms: 684,
  }
}

export async function getUsageSnapshot() {
  const requests = [84, 126, 118, 176, 224, 286, 272]
  const tokenTotals = [416000, 824000, 642000, 1380000, 1210000, 1820000, 1633800]
  return {
    generated_at: new Date().toISOString(),
    start_date: day(-1),
    end_date: day(0),
    granularity: 'hour',
    trend: requests.map((count, index) => ({
      date: `${day(index < 3 ? -1 : 0)} ${String((index * 4 + 14) % 24).padStart(2, '0')}:00`,
      requests: count,
      input_tokens: Math.round(tokenTotals[index] * .58),
      output_tokens: Math.round(tokenTotals[index] * .18),
      cache_creation_tokens: Math.round(tokenTotals[index] * .04),
      cache_read_tokens: Math.round(tokenTotals[index] * .2),
      total_tokens: tokenTotals[index],
      cost: count * 0.041,
      actual_cost: count * 0.029,
    })),
    groups: [
      { group_id: 1, group_name: 'Claude 通用', requests: 628, total_tokens: 4120000, cost: 24.8, actual_cost: 18.62 },
      { group_id: 2, group_name: 'OpenAI 高速', requests: 452, total_tokens: 2780000, cost: 16.4, actual_cost: 12.18 },
      { group_id: 3, group_name: 'Gemini 长文本', requests: 206, total_tokens: 1225800, cost: 7.52, actual_cost: 5.66 },
    ],
  }
}

export async function getUsageModels() {
  return {
    models: [
      { model: 'claude-sonnet-4', requests: 512, input_tokens: 1920000, output_tokens: 486000, cache_creation_tokens: 188000, cache_read_tokens: 1210000, total_tokens: 3804000, cost: 22.6, actual_cost: 16.84 },
      { model: 'gpt-5.2-codex', requests: 394, input_tokens: 1480000, output_tokens: 436000, cache_creation_tokens: 82000, cache_read_tokens: 760000, total_tokens: 2758000, cost: 16.5, actual_cost: 12.28 },
      { model: 'gemini-2.5-pro', requests: 238, input_tokens: 842000, output_tokens: 252000, cache_creation_tokens: 42000, cache_read_tokens: 274000, total_tokens: 1410000, cost: 8.42, actual_cost: 6.31 },
      { model: 'claude-opus-4', requests: 142, input_tokens: 440400, output_tokens: 94800, cache_creation_tokens: 20400, cache_read_tokens: 154200, total_tokens: 709800, cost: 4.2, actual_cost: 3.14 },
    ],
  }
}

const visualUsageSeeds = [
  { id: 1006, api_key_id: 1, model: 'claude-sonnet-4', inbound_endpoint: '/v1/messages', input_tokens: 8240, output_tokens: 1280, cache_creation_tokens: 640, cache_read_tokens: 4260, total_tokens: 14420, actual_cost: 0.0684, request_type: 'stream' as const, stream: true, duration_ms: 1260, first_token_ms: 284, billing_type: 0, billing_mode: 'token', created_at: new Date(Date.now() - 3 * 60_000).toISOString(), api_key: { id: 1, name: 'production-key' }, group: { id: 1, name: 'Claude 通用' } },
  { id: 1005, api_key_id: 2, model: 'gpt-5.2-codex', inbound_endpoint: '/v1/responses', input_tokens: 12480, output_tokens: 3620, cache_creation_tokens: 0, cache_read_tokens: 8840, total_tokens: 24940, actual_cost: 0.1042, request_type: 'sync' as const, stream: false, duration_ms: 2184, first_token_ms: 0, billing_type: 1, billing_mode: 'token', created_at: new Date(Date.now() - 11 * 60_000).toISOString(), api_key: { id: 2, name: 'coding-agent' }, group: { id: 2, name: 'OpenAI 高速' } },
  { id: 1004, api_key_id: 1, model: 'claude-sonnet-4', inbound_endpoint: '/v1/messages', input_tokens: 4260, output_tokens: 920, cache_creation_tokens: 120, cache_read_tokens: 2280, total_tokens: 7580, actual_cost: 0.0368, request_type: 'stream' as const, stream: true, duration_ms: 864, first_token_ms: 196, billing_type: 0, billing_mode: 'token', created_at: new Date(Date.now() - 26 * 60_000).toISOString(), api_key: { id: 1, name: 'production-key' }, group: { id: 1, name: 'Claude 通用' } },
  { id: 1003, api_key_id: 3, model: 'gemini-2.5-pro', inbound_endpoint: '/v1beta/models', input_tokens: 18620, output_tokens: 2240, cache_creation_tokens: 0, cache_read_tokens: 0, total_tokens: 20860, actual_cost: 0.0522, request_type: 'sync' as const, stream: false, duration_ms: 1534, first_token_ms: 0, billing_type: 1, billing_mode: 'per_request', created_at: new Date(Date.now() - 42 * 60_000).toISOString(), api_key: { id: 3, name: 'research-lab' }, group: { id: 3, name: 'Gemini 长文本' } },
  { id: 1002, api_key_id: 2, model: 'gpt-5.2-codex', inbound_endpoint: '/v1/responses', input_tokens: 6820, output_tokens: 1820, cache_creation_tokens: 0, cache_read_tokens: 3140, total_tokens: 11780, actual_cost: 0.0486, request_type: 'ws_v2' as const, stream: true, duration_ms: 942, first_token_ms: 172, billing_type: 1, billing_mode: 'token', created_at: new Date(Date.now() - 58 * 60_000).toISOString(), api_key: { id: 2, name: 'coding-agent' }, group: { id: 2, name: 'OpenAI 高速' } },
  { id: 1001, api_key_id: 1, model: 'claude-opus-4', inbound_endpoint: '/v1/messages', input_tokens: 2680, output_tokens: 740, cache_creation_tokens: 240, cache_read_tokens: 1260, total_tokens: 4920, actual_cost: 0.0648, request_type: 'live' as const, stream: true, duration_ms: 718, first_token_ms: 148, billing_type: 0, billing_mode: 'token', created_at: new Date(Date.now() - 76 * 60_000).toISOString(), api_key: { id: 1, name: 'production-key' }, group: { id: 1, name: 'Claude 通用' } },
]

const visualUsageRows = Array.from({ length: 24 }, (_, index) => {
  const seed = visualUsageSeeds[index % visualUsageSeeds.length]!
  return {
    ...seed,
    id: 1100 - index,
    created_at: new Date(Date.now() - (index + 1) * 7 * 60_000).toISOString(),
    group: index === 0
      ? { id: 9, name: '跨区域模型推理与超长上下文联合调度' }
      : seed.group,
  }
})

export async function getUsageRecords(params: { page?: number; page_size?: number } = {}) {
  assertPreviewRoute('usage')
  const page = Math.max(1, Math.floor(params.page ?? 1))
  const pageSize = Math.max(1, Math.floor(params.page_size ?? 20))
  const rows = previewFlag('empty', 'usage') ? [] : visualUsageRows
  const start = (page - 1) * pageSize
  return {
    items: rows.slice(start, start + pageSize),
    total: rows.length,
    page,
    page_size: pageSize,
    pages: rows.length ? Math.ceil(rows.length / pageSize) : 0,
  }
}

const visualErrors = [
  { id: 77, created_at: new Date(Date.now() - 18 * 60_000).toISOString(), model: 'claude-sonnet-4', inbound_endpoint: '/v1/messages', status_code: 429, category: 'rate_limit', platform: 'anthropic', message: '上游服务当前请求受限', key_name: 'production-key', key_deleted: false, group_name: 'Claude 通用' },
  { id: 76, created_at: new Date(Date.now() - 46 * 60_000).toISOString(), model: 'gpt-5.2-codex', inbound_endpoint: '/v1/responses', status_code: 502, category: 'upstream', platform: 'openai', message: '上游连接提前关闭', key_name: 'coding-agent', key_deleted: false, group_name: 'OpenAI 高速' },
  { id: 75, created_at: new Date(Date.now() - 72 * 60_000).toISOString(), model: 'gemini-2.5-pro', inbound_endpoint: '/v1beta/models', status_code: 400, category: 'invalid_request', platform: 'gemini', message: '请求参数不符合模型要求', key_name: 'research-lab', key_deleted: false, group_name: 'Gemini 长文本' },
]

export async function getUsageErrors(params: { page?: number; page_size?: number } = {}) {
  return { items: visualErrors, total: 3, page: params.page ?? 1, page_size: params.page_size ?? 20 }
}

export async function getUsageErrorDetail(id: number) {
  const row = visualErrors.find((item) => item.id === id) ?? visualErrors[0]
  return { ...row, upstream_status_code: row.status_code === 429 ? 529 : row.status_code, error_body: '{"error":{"type":"overloaded_error","message":"Upstream service is temporarily overloaded"}}' }
}

export async function getUsageApiKeys() {
  return { items: [{ id: 1, name: 'production-key' }, { id: 2, name: 'coding-agent' }, { id: 3, name: 'research-lab' }], total: 3, page: 1, page_size: 100 }
}

export async function getUsageGroups() {
  return [{ id: 1, name: 'Claude 通用' }, { id: 2, name: 'OpenAI 高速' }, { id: 3, name: 'Gemini 长文本' }]
}

export async function getSubscriptionSummary() {
  return {
    active_count: 3,
    total_used_usd: 34,
    subscriptions: [
      { id: 1, group_id: 1, group_name: '通用订阅', status: 'active', daily_used_usd: 2, daily_limit_usd: 10 },
      { id: 2, group_id: 2, group_name: '日限额订阅', status: 'active', daily_used_usd: 10, daily_limit_usd: 10 },
      { id: 3, group_id: 3, group_name: '周限额订阅', status: 'active', weekly_used_usd: 100, weekly_limit_usd: 100 },
    ],
  }
}

export async function getChannelMonitors() {
  await maybeDelay()
  return {
    items: [
      {
        id: 1,
        name: 'Claude 主线路',
        provider: 'anthropic',
        group_name: 'Claude 通用',
        primary_model: 'claude-sonnet-4',
        primary_status: 'operational',
        primary_latency_ms: 682,
        primary_ping_latency_ms: 86,
        availability_7d: 99.96,
        extra_models: [
          { model: 'claude-opus-4', status: 'operational', latency_ms: 924 },
          { model: 'claude-haiku-4', status: 'operational', latency_ms: 416 },
        ],
        timeline: Array.from({ length: 60 }, (_, index) => ({
          status: 'operational',
          latency_ms: 620 + index * 9,
          ping_latency_ms: 80 + index,
          checked_at: new Date(Date.now() - index * 30 * 60_000).toISOString(),
        })),
      },
      {
        id: 2,
        name: 'OpenAI 高速线路',
        provider: 'openai',
        group_name: 'OpenAI 高速',
        primary_model: 'gpt-5.2-codex',
        primary_status: 'degraded',
        primary_latency_ms: 1840,
        primary_ping_latency_ms: 122,
        availability_7d: 97.42,
        extra_models: [{ model: 'gpt-5.2', status: 'operational', latency_ms: 990 }],
        timeline: Array.from({ length: 60 }, (_, index) => ({
          status: index === 2 || index === 8 ? 'degraded' : 'operational',
          latency_ms: index === 2 || index === 8 ? 1840 : 840 + index * 15,
          ping_latency_ms: 112 + index,
          checked_at: new Date(Date.now() - index * 30 * 60_000).toISOString(),
        })),
      },
      {
        id: 3,
        name: 'Gemini 长文本',
        provider: 'gemini',
        group_name: 'Gemini 专线',
        primary_model: 'gemini-2.5-pro',
        primary_status: 'operational',
        primary_latency_ms: 734,
        primary_ping_latency_ms: 96,
        availability_7d: 99.84,
        extra_models: [{ model: 'gemini-2.5-flash', status: 'operational', latency_ms: 382 }],
        timeline: Array.from({ length: 60 }, (_, index) => ({
          status: 'operational', latency_ms: 690 + index * 6, ping_latency_ms: 90 + index,
          checked_at: new Date(Date.now() - index * 30 * 60_000).toISOString(),
        })),
      },
      {
        id: 4,
        name: 'Grok 通用线路',
        provider: 'grok',
        group_name: 'Grok 通用',
        primary_model: 'grok-4',
        primary_status: 'operational',
        primary_latency_ms: 912,
        primary_ping_latency_ms: 108,
        availability_7d: 99.21,
        extra_models: [],
        timeline: Array.from({ length: 60 }, (_, index) => ({
          status: 'operational', latency_ms: 870 + index * 6, ping_latency_ms: 100 + index,
          checked_at: new Date(Date.now() - index * 30 * 60_000).toISOString(),
        })),
      },
    ],
  }
}

export async function getChannelMonitorDetail(id: number) {
  await maybeDelay()
  const models = id === 1
    ? [
        { model: 'claude-sonnet-4', latest_status: 'operational', latest_latency_ms: 682, availability_7d: 99.96, availability_15d: 99.9, availability_30d: 99.82, avg_latency_7d_ms: 714 },
        { model: 'claude-opus-4', latest_status: 'operational', latest_latency_ms: 924, availability_7d: 99.84, availability_15d: 99.76, availability_30d: 99.7, avg_latency_7d_ms: 968 },
        { model: 'claude-haiku-4', latest_status: 'operational', latest_latency_ms: 416, availability_7d: 100, availability_15d: 99.98, availability_30d: 99.94, avg_latency_7d_ms: 438 },
      ]
    : [{ model: id === 2 ? 'gpt-5.2-codex' : 'primary-model', latest_status: id === 2 ? 'degraded' : 'operational', latest_latency_ms: id === 2 ? 1840 : 780, availability_7d: id === 2 ? 97.42 : 99.8, availability_15d: 98.2, availability_30d: 98.86, avg_latency_7d_ms: id === 2 ? 1280 : 810 }]
  return { id, name: id === 1 ? 'Claude 主线路' : '渠道详情', provider: id === 1 ? 'anthropic' : 'openai', group_name: id === 1 ? 'Claude 通用' : 'OpenAI 高速', models }
}

export async function getSubscriptions() {
  await maybeDelay()
  return [
    {
      id: 11, user_id: 1, group_id: 1, status: 'active', starts_at: day(-31) + 'T00:00:00Z', expires_at: day(27) + 'T00:00:00Z',
      daily_usage_usd: 7.2, weekly_usage_usd: 32, monthly_usage_usd: 74,
      daily_window_start: day(0) + 'T00:00:00Z', weekly_window_start: day(-4) + 'T00:00:00Z', monthly_window_start: day(-1) + 'T00:00:00Z', created_at: day(-31) + 'T00:00:00Z', updated_at: new Date().toISOString(),
      group: { id: 1, name: 'Claude 专业版', description: '适合日常开发与长任务', platform: 'anthropic', rate_multiplier: 1, daily_limit_usd: 10, weekly_limit_usd: 50, monthly_limit_usd: 100 },
    },
    {
      id: 12, user_id: 1, group_id: 2, status: 'active', starts_at: day(-12) + 'T00:00:00Z', expires_at: day(48) + 'T00:00:00Z',
      daily_usage_usd: 5, weekly_usage_usd: 100, monthly_usage_usd: 138,
      daily_window_start: day(0) + 'T00:00:00Z', weekly_window_start: day(-3) + 'T00:00:00Z', monthly_window_start: day(-1) + 'T00:00:00Z', created_at: day(-12) + 'T00:00:00Z', updated_at: new Date().toISOString(),
      group: { id: 2, name: 'OpenAI 团队版', description: '面向高频编码与自动化工作流', platform: 'openai', rate_multiplier: 1, daily_limit_usd: 20, weekly_limit_usd: 100, monthly_limit_usd: 300 },
    },
    {
      id: 13, user_id: 1, group_id: 3, status: 'expired', starts_at: day(-90) + 'T00:00:00Z', expires_at: day(-60) + 'T00:00:00Z',
      daily_usage_usd: 0, weekly_usage_usd: 0, monthly_usage_usd: 0,
      daily_window_start: null, weekly_window_start: null, monthly_window_start: null, created_at: day(-90) + 'T00:00:00Z', updated_at: day(-60) + 'T00:00:00Z',
      group: { id: 3, name: 'Gemini 体验版', description: '已结束的历史订阅', platform: 'gemini', rate_multiplier: 1, daily_limit_usd: 5, weekly_limit_usd: null, monthly_limit_usd: null },
    },
  ]
}

let visualRedeemHistory = [
  { id: 301, code: 'LINAI-2026-PRO-30', type: 'subscription', value: 30, status: 'used', used_at: new Date(Date.now() - 2 * 86_400_000).toISOString(), created_at: day(-4) + 'T00:00:00Z', validity_days: 30, group: { id: 1, name: 'Claude 专业版' } },
  { id: 300, code: 'LINAI-BALANCE-50', type: 'balance', value: 50, status: 'used', used_at: new Date(Date.now() - 9 * 86_400_000).toISOString(), created_at: day(-12) + 'T00:00:00Z' },
]

export async function redeemCode(code: string) {
  await maybeDelay()
  const item = { id: Date.now(), code, type: 'balance', value: 20, status: 'used', used_at: new Date().toISOString(), created_at: new Date().toISOString(), message: '兑换成功', new_balance: 148.6 }
  visualRedeemHistory = [item, ...visualRedeemHistory]
  return item
}

export async function getRedeemHistory() {
  await maybeDelay()
  return visualRedeemHistory
}

export async function getProfile() {
  return visualUser
}

export async function updateProfile(payload: { username?: string; avatar_url?: string | null }) {
  Object.assign(visualUser, payload)
  return visualUser
}

export async function changePassword() {
  return { message: 'Password changed successfully' }
}
