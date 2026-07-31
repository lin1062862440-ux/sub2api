const today = new Date()

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

export function isTotpRequired(response: { requires_2fa?: boolean }) {
  return response.requires_2fa === true
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

export async function getDashboardStats() {
  return {
    total_api_keys: 6,
    active_api_keys: 5,
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
    today_actual_cost: 24.86,
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
