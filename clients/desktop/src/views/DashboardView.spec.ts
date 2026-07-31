import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDashboardStats: vi.fn(),
  getDashboardTrend: vi.fn(),
  getDashboardModels: vi.fn(),
  refreshUser: vi.fn(),
  session: {
    user: {
      id: 1,
      username: 'Lin',
      email: 'lin@example.com',
      role: 'user',
      balance: 18.2,
      concurrency: 5,
    },
    runMode: 'standard',
  },
}))

vi.mock('@/api', () => ({
  getDashboardStats: mocks.getDashboardStats,
  getDashboardTrend: mocks.getDashboardTrend,
  getDashboardModels: mocks.getDashboardModels,
}))

vi.mock('@/stores/session', () => ({
  session: mocks.session,
  refreshUser: mocks.refreshUser,
}))

vi.mock('@/lib/http', () => ({
  ApiError: class ApiError extends Error {
    status = 0
  },
}))

import DashboardView from './DashboardView.vue'

const stats = {
  total_api_keys: 4,
  active_api_keys: 3,
  total_requests: 9400,
  total_input_tokens: 400000,
  total_output_tokens: 120000,
  total_cache_creation_tokens: 20000,
  total_cache_read_tokens: 60000,
  total_tokens: 600000,
  total_cost: 44,
  total_actual_cost: 36,
  today_requests: 1240,
  today_input_tokens: 60000,
  today_output_tokens: 18000,
  today_cache_creation_tokens: 3000,
  today_cache_read_tokens: 9000,
  today_tokens: 90000,
  today_cost: 6,
  today_actual_cost: 4.8,
  average_duration_ms: 820,
  rpm: 14,
  tpm: 24000,
  by_platform: [
    {
      platform: 'anthropic',
      total_requests: 8000,
      total_tokens: 540000,
      total_actual_cost: 30,
    },
  ],
}

const trend = {
  trend: [
    { date: '2026-07-31', requests: 900, total_tokens: 70000 },
    { date: '2026-08-01', requests: 1240, total_tokens: 90000 },
  ],
}

const models = {
  models: [
    { model: 'claude-sonnet-4', requests: 1000, total_tokens: 70000, actual_cost: 4.1 },
  ],
}

function arrangeSuccess() {
  mocks.getDashboardStats.mockResolvedValue(stats)
  mocks.getDashboardTrend.mockResolvedValue(trend)
  mocks.getDashboardModels.mockResolvedValue(models)
  mocks.refreshUser.mockResolvedValue(undefined)
}

describe('DashboardView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.session.runMode = 'standard'
    arrangeSuccess()
  })

  it('renders headline usage metrics from the live contract', async () => {
    const wrapper = mount(DashboardView)
    await flushPromises()

    expect(wrapper.get('[data-testid="metric-today-requests"]').text()).toContain('1,240')
    expect(wrapper.get('[data-testid="metric-cost"]').text()).toContain('$4.80')
    expect(wrapper.text()).toContain('claude-sonnet-4')
  })

  it('hides balance and cost in simple mode', async () => {
    mocks.session.runMode = 'simple'
    const wrapper = mount(DashboardView)
    await flushPromises()

    expect(wrapper.find('[data-testid="metric-balance"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="metric-cost"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="metric-api-keys"]').text()).toContain('3')
  })

  it('keeps successful stats when a secondary endpoint fails', async () => {
    mocks.getDashboardTrend.mockRejectedValue(new Error('trend unavailable'))
    const wrapper = mount(DashboardView)
    await flushPromises()

    expect(wrapper.get('[data-testid="metric-today-requests"]').text()).toContain('1,240')
    expect(wrapper.get('[data-testid="refresh-notice"]').text()).toContain('请求趋势')
  })
})
