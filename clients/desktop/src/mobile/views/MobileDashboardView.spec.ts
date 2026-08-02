import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDashboardStats: vi.fn(),
  getDashboardTrend: vi.fn(),
  getSubscriptionSummary: vi.fn(),
  session: {
    user: {
      id: 1,
      username: 'Lin',
      email: 'lin@example.com',
      role: 'user',
      balance: 18.2,
      concurrency: 5,
    },
    runMode: 'standard' as 'standard' | 'simple',
  },
}))

vi.mock('@/api', () => ({
  getDashboardStats: mocks.getDashboardStats,
  getDashboardTrend: mocks.getDashboardTrend,
  getSubscriptionSummary: mocks.getSubscriptionSummary,
}))

vi.mock('@/stores/session', () => ({ session: mocks.session }))

import MobileDashboardView from './MobileDashboardView.vue'

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
  by_platform: [{ platform: 'anthropic', total_requests: 9400 }],
}

const trend = {
  trend: [
    { date: '2026-07-31', requests: 900, total_tokens: 70000 },
    { date: '2026-08-01', requests: 1240, total_tokens: 90000 },
  ],
  start_date: '2026-07-26',
  end_date: '2026-08-01',
  granularity: 'day',
}

const subscriptions = {
  active_count: 2,
  total_used_usd: 12,
  subscriptions: [
    {
      id: 1,
      group_id: 4,
      group_name: 'Claude Pro',
      status: 'active',
      daily_used_usd: 9.2,
      daily_limit_usd: 10,
      expires_at: '2026-08-05T00:00:00Z',
    },
    {
      id: 2,
      group_id: 5,
      group_name: 'OpenAI Plus',
      status: 'active',
      weekly_used_usd: 10,
      weekly_limit_usd: 100,
      expires_at: '2026-09-01T00:00:00Z',
    },
  ],
}

function arrangeSuccess() {
  mocks.getDashboardStats.mockResolvedValue(stats)
  mocks.getDashboardTrend.mockResolvedValue(trend)
  mocks.getSubscriptionSummary.mockResolvedValue(subscriptions)
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

const wrappers: Array<{ unmount: () => void }> = []

function mountView() {
  const wrapper = mount(MobileDashboardView)
  wrappers.push(wrapper)
  return wrapper
}

describe('MobileDashboardView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.session.runMode = 'standard'
    arrangeSuccess()
  })

  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  })

  it('keeps the MobilePage shell stable while the initial load is pending', () => {
    mocks.getDashboardStats.mockReturnValue(new Promise(() => {}))
    mocks.getDashboardTrend.mockReturnValue(new Promise(() => {}))
    mocks.getSubscriptionSummary.mockReturnValue(new Promise(() => {}))

    const wrapper = mountView()

    expect(wrapper.find('.mobile-page-scroll').exists()).toBe(true)
    expect(wrapper.get('h1').text()).toBe('首页')
    expect(wrapper.find('[data-testid="mobile-page-loading"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="dashboard-skeleton-metric"]')).toHaveLength(4)
    expect(wrapper.get('[data-testid="dashboard-refresh"]').attributes('disabled')).toBeDefined()
  })

  it('starts all dashboard requests together in one load cycle', () => {
    const pending = new Promise(() => {})
    mocks.getDashboardStats.mockReturnValue(pending)
    mocks.getDashboardTrend.mockReturnValue(pending)
    mocks.getSubscriptionSummary.mockReturnValue(pending)

    mountView()

    expect(mocks.getDashboardStats).toHaveBeenCalledTimes(1)
    expect(mocks.getDashboardTrend).toHaveBeenCalledTimes(1)
    expect(mocks.getSubscriptionSummary).toHaveBeenCalledTimes(1)
    expect(mocks.getDashboardTrend).toHaveBeenCalledWith(expect.objectContaining({
      start_date: expect.any(String),
      end_date: expect.any(String),
      granularity: 'day',
    }))
  })

  it('renders compact account, usage, trend, and subscription values', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('[data-testid="account-band"]').text()).toContain('$18.20')
    expect(wrapper.get('[data-testid="account-band"]').text()).toContain('2 个有效')
    expect(wrapper.get('[data-testid="metric-requests"]').text()).toContain('9,400')
    expect(wrapper.get('[data-testid="metric-tokens"]').text()).toContain('60万')
    expect(wrapper.get('[data-testid="metric-cost"]').text()).toContain('$36.00')
    expect(wrapper.get('[data-testid="metric-duration"]').text()).toContain('820ms')

    const trendSection = wrapper.get('[data-testid="usage-trend"]')
    expect(trendSection.findAll('[data-testid="trend-row"]')).toHaveLength(2)
    expect(trendSection.text()).toContain('07-31')
    expect(trendSection.text()).toContain('1,240')

    const subscriptionSection = wrapper.get('[data-testid="subscription-summary"]')
    expect(subscriptionSection.text()).toContain('2 个有效订阅')
    expect(subscriptionSection.text()).toContain('Claude Pro')
    expect(subscriptionSection.text()).toContain('额度接近上限')
    expect(subscriptionSection.text()).toContain('08月05日')
  })

  it('refreshes in place and disables the refresh action while busy', async () => {
    const wrapper = mountView()
    await flushPromises()

    const nextStats = deferred<typeof stats>()
    const nextTrend = deferred<typeof trend>()
    const nextSubscriptions = deferred<typeof subscriptions>()
    mocks.getDashboardStats.mockReturnValueOnce(nextStats.promise)
    mocks.getDashboardTrend.mockReturnValueOnce(nextTrend.promise)
    mocks.getSubscriptionSummary.mockReturnValueOnce(nextSubscriptions.promise)

    await wrapper.get('[data-testid="dashboard-refresh"]').trigger('click')

    expect(wrapper.get('[data-testid="dashboard-refresh"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="metric-requests"]').text()).toContain('9,400')
    expect(mocks.getDashboardStats).toHaveBeenCalledTimes(2)

    nextStats.resolve({ ...stats, total_requests: 9500 })
    nextTrend.resolve(trend)
    nextSubscriptions.resolve(subscriptions)
    await flushPromises()

    expect(wrapper.get('[data-testid="dashboard-refresh"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[data-testid="metric-requests"]').text()).toContain('9,500')
  })

  it('retains successful sections and reports only unavailable sections once', async () => {
    mocks.getDashboardTrend.mockRejectedValue(new Error('offline'))
    mocks.getSubscriptionSummary.mockRejectedValue(new Error('offline'))

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('[data-testid="metric-requests"]').text()).toContain('9,400')
    const warning = wrapper.get('[data-testid="dashboard-partial-warning"]')
    expect(warning.text()).toContain('用量趋势、订阅概况')
    expect(wrapper.findAll('[data-testid="dashboard-partial-warning"]')).toHaveLength(1)
    expect(wrapper.find('[data-testid="usage-trend"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="subscription-summary"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('0 个有效')
  })

  it('shows a retry state when every dashboard section fails', async () => {
    mocks.getDashboardStats.mockRejectedValue(new Error('offline'))
    mocks.getDashboardTrend.mockRejectedValue(new Error('offline'))
    mocks.getSubscriptionSummary.mockRejectedValue(new Error('offline'))

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('[data-testid="mobile-page-error"]').text()).toContain('暂时无法加载首页数据')
    await wrapper.get('[data-testid="mobile-page-retry"]').trigger('click')
    expect(mocks.getDashboardStats).toHaveBeenCalledTimes(2)
  })

  it('shows an explicit empty subscription state without a redemption link', async () => {
    mocks.getSubscriptionSummary.mockResolvedValue({ active_count: 0, total_used_usd: 0, subscriptions: [] })

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('[data-testid="subscription-empty"]').text()).toContain('当前没有有效订阅')
    expect(wrapper.find('[data-testid="subscription-summary"] a').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('兑换')
  })

  it('omits billing-only analytics in simple mode while keeping usage readable', async () => {
    mocks.session.runMode = 'simple'

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-testid="account-balance"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="metric-cost"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="metric-requests"]').text()).toContain('9,400')
    expect(wrapper.get('[data-testid="metric-tokens"]').text()).toContain('60万')
    expect(wrapper.get('[data-testid="metric-duration"]').text()).toContain('820ms')
  })

  it('excludes desktop-only analytics and long dashboard copy', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).not.toContain('平台分布')
    expect(wrapper.text()).not.toContain('模型用量')
    expect(wrapper.text()).not.toContain('API Key')
    expect(wrapper.text()).not.toContain('服务运行中')
    expect(wrapper.find('.platform-donut').exists()).toBe(false)
  })
})
