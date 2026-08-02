import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
const source = readFileSync(resolve(process.cwd(), 'src/mobile/views/MobileDashboardView.vue'), 'utf8')

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
    vi.useRealTimers()
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

  it('uses local calendar dates for the seven-day range before 08:00 in Asia/Shanghai', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-02T00:30:00+08:00'))

    mountView()

    expect(mocks.getDashboardTrend).toHaveBeenCalledWith({
      start_date: '2026-07-27',
      end_date: '2026-08-02',
      granularity: 'day',
    })
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
    expect(wrapper.get('[data-testid="dashboard-refresh"]').attributes('aria-label')).toBe('正在刷新首页')
    expect(wrapper.get('.mobile-page-scroll').attributes('aria-busy')).toBe('true')
    expect(wrapper.get('[data-testid="metric-requests"]').text()).toContain('9,400')
    expect(mocks.getDashboardStats).toHaveBeenCalledTimes(2)

    nextStats.resolve({ ...stats, total_requests: 9500 })
    nextTrend.resolve(trend)
    nextSubscriptions.resolve(subscriptions)
    await flushPromises()

    expect(wrapper.get('[data-testid="dashboard-refresh"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[data-testid="dashboard-refresh"]').attributes('aria-label')).toBe('刷新首页')
    expect(wrapper.get('.mobile-page-scroll').attributes('aria-busy')).toBe('false')
    expect(wrapper.get('[data-testid="metric-requests"]').text()).toContain('9,500')
  })

  it('keeps the newer load when an older request finishes last', async () => {
    const firstStats = deferred<typeof stats>()
    const firstTrend = deferred<typeof trend>()
    const firstSubscriptions = deferred<typeof subscriptions>()
    mocks.getDashboardStats.mockReturnValueOnce(firstStats.promise)
    mocks.getDashboardTrend.mockReturnValueOnce(firstTrend.promise)
    mocks.getSubscriptionSummary.mockReturnValueOnce(firstSubscriptions.promise)
    const wrapper = mountView()

    mocks.getDashboardStats.mockResolvedValueOnce({ ...stats, total_requests: 9700 })
    mocks.getDashboardTrend.mockResolvedValueOnce(trend)
    mocks.getSubscriptionSummary.mockResolvedValueOnce(subscriptions)
    const setupState = (wrapper.vm.$ as unknown as { setupState: { load: () => Promise<void> } }).setupState
    await setupState.load()
    await flushPromises()
    expect(wrapper.get('[data-testid="metric-requests"]').text()).toContain('9,700')

    firstStats.resolve({ ...stats, total_requests: 1200 })
    firstTrend.resolve(trend)
    firstSubscriptions.resolve(subscriptions)
    await flushPromises()

    expect(wrapper.get('[data-testid="metric-requests"]').text()).toContain('9,700')
  })

  it('ignores request completion after the view unmounts', async () => {
    const pendingStats = deferred<typeof stats>()
    const pendingTrend = deferred<typeof trend>()
    const pendingSubscriptions = deferred<typeof subscriptions>()
    mocks.getDashboardStats.mockReturnValueOnce(pendingStats.promise)
    mocks.getDashboardTrend.mockReturnValueOnce(pendingTrend.promise)
    mocks.getSubscriptionSummary.mockReturnValueOnce(pendingSubscriptions.promise)
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const wrapper = mountView()
    const setupState = (wrapper.vm.$ as unknown as { setupState: { stats: typeof stats | null } }).setupState

    wrapper.unmount()
    pendingStats.resolve(stats)
    pendingTrend.resolve(trend)
    pendingSubscriptions.resolve(subscriptions)
    await flushPromises()

    expect(warning).not.toHaveBeenCalled()
    expect(setupState.stats).toBeNull()
    warning.mockRestore()
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

  it('recovers from the fatal retry state and renders fresh data', async () => {
    mocks.getDashboardStats.mockRejectedValue(new Error('offline'))
    mocks.getDashboardTrend.mockRejectedValue(new Error('offline'))
    mocks.getSubscriptionSummary.mockRejectedValue(new Error('offline'))
    const wrapper = mountView()
    await flushPromises()

    arrangeSuccess()
    await wrapper.get('[data-testid="mobile-page-retry"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="mobile-page-error"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="metric-requests"]').text()).toContain('9,400')
  })

  it('retains prior data through a failed refresh and recovers on the next retry', async () => {
    const wrapper = mountView()
    await flushPromises()

    mocks.getDashboardStats.mockRejectedValueOnce(new Error('offline'))
    mocks.getDashboardTrend.mockRejectedValueOnce(new Error('offline'))
    mocks.getSubscriptionSummary.mockRejectedValueOnce(new Error('offline'))
    await wrapper.get('[data-testid="dashboard-refresh"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="metric-requests"]').text()).toContain('9,400')
    expect(wrapper.get('[data-testid="dashboard-partial-warning"]').text()).toContain('核心指标')

    mocks.getDashboardStats.mockResolvedValueOnce({ ...stats, total_requests: 9800 })
    mocks.getDashboardTrend.mockResolvedValueOnce(trend)
    mocks.getSubscriptionSummary.mockResolvedValueOnce(subscriptions)
    await wrapper.get('[data-testid="dashboard-partial-warning"] button').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="metric-requests"]').text()).toContain('9,800')
    expect(wrapper.find('[data-testid="dashboard-partial-warning"]').exists()).toBe(false)
  })

  it('shows an explicit empty subscription state without a redemption link', async () => {
    mocks.getSubscriptionSummary.mockResolvedValue({ active_count: 0, total_used_usd: 0, subscriptions: [] })

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('[data-testid="subscription-empty"]').text()).toContain('当前没有有效订阅')
    expect(wrapper.find('[data-testid="subscription-summary"] a').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('兑换')
  })

  it.each([
    ['unlimited', {}, '不限额度'],
    ['finite normal', { daily_used_usd: 2, daily_limit_usd: 10 }, '额度正常'],
    ['exhausted', { monthly_used_usd: 10, monthly_limit_usd: 10 }, '额度已用满'],
  ])('renders %s subscription quota semantics', async (_case, quota, expected) => {
    mocks.getSubscriptionSummary.mockResolvedValue({
      active_count: 1,
      total_used_usd: 0,
      subscriptions: [{
        id: 8,
        group_id: 4,
        group_name: 'Current Plan',
        status: 'active',
        expires_at: null,
        ...quota,
      }],
    })

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('[data-testid="subscription-summary"]').text()).toContain(expected)
  })

  it('uses safe expiry fallbacks for null and invalid dates', async () => {
    mocks.getSubscriptionSummary.mockResolvedValue({
      active_count: 2,
      total_used_usd: 0,
      subscriptions: [
        { id: 8, group_id: 4, group_name: 'No Expiry', status: 'active', expires_at: null },
        { id: 9, group_id: 5, group_name: 'Bad Expiry', status: 'active', expires_at: 'not-a-date' },
      ],
    })

    const wrapper = mountView()
    await flushPromises()

    const summary = wrapper.get('[data-testid="subscription-summary"]').text()
    expect(summary).toContain('长期有效')
    expect(summary).toContain('到期时间未知')
    expect(summary).not.toContain('Invalid Date')
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

  it('distinguishes unavailable and successful empty subscriptions in simple mode', async () => {
    mocks.session.runMode = 'simple'
    mocks.getSubscriptionSummary.mockRejectedValueOnce(new Error('offline'))
    const unavailable = mountView()
    await flushPromises()

    expect(unavailable.find('[data-testid="account-band"]').exists()).toBe(false)
    expect(unavailable.get('[data-testid="dashboard-partial-warning"]').text()).toContain('订阅概况')
    unavailable.unmount()

    mocks.getSubscriptionSummary.mockResolvedValueOnce({ active_count: 0, total_used_usd: 0, subscriptions: [] })
    const empty = mountView()
    await flushPromises()

    expect(empty.get('[data-testid="account-band"]').text()).toContain('0 个有效')
    expect(empty.get('[data-testid="subscription-empty"]').text()).toContain('当前没有有效订阅')
  })

  it('marks initial loading busy and gives partial retry a 44px touch target', () => {
    mocks.getDashboardStats.mockReturnValue(new Promise(() => {}))
    mocks.getDashboardTrend.mockReturnValue(new Promise(() => {}))
    mocks.getSubscriptionSummary.mockReturnValue(new Promise(() => {}))
    const wrapper = mountView()

    expect(wrapper.get('.mobile-page-scroll').attributes('aria-busy')).toBe('true')
    expect(source).toMatch(/\.partial-warning button\s*\{[^}]*min-height:\s*44px/s)
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
