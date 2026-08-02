import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDashboardStats: vi.fn(),
  getDashboardTrend: vi.fn(),
  getDashboardModels: vi.fn(),
  getSubscriptionSummary: vi.fn(),
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
  getSubscriptionSummary: mocks.getSubscriptionSummary,
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

const subscriptions = {
  active_count: 3,
  total_used_usd: 34,
  subscriptions: [
    { id: 1, status: 'active', daily_used_usd: 2, daily_limit_usd: 10 },
    { id: 2, status: 'active', daily_used_usd: 10, daily_limit_usd: 10 },
    { id: 3, status: 'active', weekly_used_usd: 100, weekly_limit_usd: 100 },
  ],
}

function arrangeSuccess() {
  mocks.getDashboardStats.mockResolvedValue(stats)
  mocks.getDashboardTrend.mockResolvedValue(trend)
  mocks.getDashboardModels.mockResolvedValue(models)
  mocks.getSubscriptionSummary.mockResolvedValue(subscriptions)
  mocks.refreshUser.mockResolvedValue(undefined)
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

describe('DashboardView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.session.runMode = 'standard'
    arrangeSuccess()
  })

  it('keeps account metrics compact and moves request totals into the chart', async () => {
    const wrapper = mount(DashboardView)
    await flushPromises()

    expect(wrapper.get('[data-testid="metric-balance"]').text()).toContain('$18.20')
    expect(wrapper.get('[data-testid="metric-cost"]').text()).toContain('$4.80')
    expect(wrapper.get('[data-testid="metric-duration"]').text()).toContain('820ms')
    expect(wrapper.get('[data-testid="metric-subscriptions"]').find('svg').exists()).toBe(true)
    expect(wrapper.get('[data-testid="subscription-available"]').text()).toBe('1')
    expect(wrapper.get('[data-testid="subscription-exhausted"]').text()).toBe('2')
    expect(wrapper.get('[data-testid="subscription-total"]').text()).toBe('3')
    expect(wrapper.get('[data-testid="range-request-total"]').text()).toContain('2,140')
    expect(wrapper.get('[data-testid="range-token-total"]').text()).toContain('16万')
    expect(wrapper.text()).toContain('claude-sonnet-4')
  })

  it('hides billing metrics and excludes operational limits in simple mode', async () => {
    mocks.session.runMode = 'simple'
    const wrapper = mount(DashboardView)
    await flushPromises()

    expect(wrapper.find('[data-testid="metric-balance"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="metric-cost"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="metric-duration"]').text()).toContain('820ms')
    expect(wrapper.text()).not.toContain('活跃 Key')
    expect(wrapper.text()).not.toContain('并发上限')
    expect(wrapper.text()).not.toContain('服务运行中')
  })

  it('keeps successful stats when a secondary endpoint fails', async () => {
    mocks.getDashboardTrend.mockRejectedValue(new Error('trend unavailable'))
    const wrapper = mount(DashboardView)
    await flushPromises()

    expect(wrapper.get('[data-testid="metric-cost"]').text()).toContain('$4.80')
    expect(wrapper.get('[data-testid="refresh-notice"]').text()).toContain('请求趋势')
  })

  it('keeps the dashboard usable when the subscription summary fails', async () => {
    mocks.getSubscriptionSummary.mockRejectedValue(new Error('subscriptions unavailable'))
    const wrapper = mount(DashboardView)
    await flushPromises()

    expect(wrapper.get('[data-testid="metric-cost"]').text()).toContain('$4.80')
    expect(wrapper.get('[data-testid="refresh-notice"]').text()).toContain('订阅概况')
  })

  it('reloads range-aware charts when the time condition changes', async () => {
    const wrapper = mount(DashboardView)
    await flushPromises()

    expect(wrapper.get('[data-testid="trend-range"]').find('[data-testid="range-30"]').exists()).toBe(true)
    await wrapper.get('[data-testid="range-30"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="range-30"]').attributes('aria-pressed')).toBe('true')
    expect(mocks.getDashboardTrend).toHaveBeenLastCalledWith(expect.objectContaining({
      granularity: 'day',
      start_date: expect.any(String),
      end_date: expect.any(String),
    }))
    expect(mocks.getDashboardModels).toHaveBeenLastCalledWith(expect.objectContaining({
      limit: 10,
      start_date: expect.any(String),
      end_date: expect.any(String),
    }))
  })

  it('uses the local calendar date near the UTC day boundary', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 3, 0, 30))
    const wrapper = mount(DashboardView)
    await flushPromises()

    expect(mocks.getDashboardTrend).toHaveBeenCalledWith({
      granularity: 'day',
      start_date: '2026-07-28',
      end_date: '2026-08-03',
    })
    expect(mocks.getDashboardModels).toHaveBeenCalledWith({
      limit: 10,
      start_date: '2026-07-28',
      end_date: '2026-08-03',
    })

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('exposes loading and refreshing states without removing successful data', async () => {
    const initialStats = deferred<typeof stats>()
    mocks.getDashboardStats.mockReturnValueOnce(initialStats.promise)
    const wrapper = mount(DashboardView)

    expect(wrapper.get('.dashboard-page').classes()).toContain('is-loading')

    initialStats.resolve(stats)
    await flushPromises()
    expect(wrapper.get('.dashboard-page').classes()).toContain('is-loaded')
    expect(wrapper.get('[data-testid="metric-cost"]').text()).toContain('$4.80')

    const refreshedStats = deferred<typeof stats>()
    mocks.getDashboardStats.mockReturnValueOnce(refreshedStats.promise)
    await wrapper.get('.icon-button').trigger('click')

    expect(wrapper.get('.dashboard-page').classes()).toContain('is-refreshing')
    expect(wrapper.get('[data-testid="metric-cost"]').text()).toContain('$4.80')

    refreshedStats.resolve(stats)
    await flushPromises()
    expect(wrapper.get('.dashboard-page').classes()).not.toContain('is-refreshing')
  })
})
