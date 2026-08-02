import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TrendPoint } from '@/api'
import type {
  AdminDashboardRealtime,
  AdminDashboardSnapshot,
  AdminDashboardSnapshotParams,
} from '@/api/admin/types'

const mocks = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
  getRealtime: vi.fn(),
}))

vi.mock('@/api/admin/dashboard', () => ({
  getAdminDashboardSnapshot: mocks.getSnapshot,
  getAdminDashboardRealtime: mocks.getRealtime,
}))

import MobileAdminDashboardView from './MobileAdminDashboardView.vue'

function trendPoint(date: string, requests: number, totalTokens: number): TrendPoint {
  return {
    date,
    requests,
    input_tokens: totalTokens,
    output_tokens: 0,
    cache_creation_tokens: 0,
    cache_read_tokens: 0,
    total_tokens: totalTokens,
    cost: 0,
    actual_cost: 0,
  }
}

const snapshot: AdminDashboardSnapshot = {
  generated_at: '2026-08-02T08:00:00Z',
  start_date: '2026-07-27',
  end_date: '2026-08-02',
  granularity: 'day',
  stats: {
    total_users: 128,
    today_new_users: 6,
    active_users: 42,
    hourly_active_users: 9,
    stats_updated_at: '2026-08-02T08:00:00Z',
    stats_stale: false,
    total_api_keys: 70,
    active_api_keys: 58,
    total_accounts: 24,
    normal_accounts: 19,
    error_accounts: 2,
    ratelimit_accounts: 5,
    overload_accounts: 1,
    total_requests: 90_000,
    total_input_tokens: 4_000_000,
    total_output_tokens: 1_000_000,
    total_cache_creation_tokens: 100_000,
    total_cache_read_tokens: 900_000,
    total_tokens: 6_000_000,
    total_cost: 1_200,
    total_actual_cost: 980,
    total_account_cost: 410,
    today_requests: 3_200,
    today_input_tokens: 400_000,
    today_output_tokens: 100_000,
    today_cache_creation_tokens: 10_000,
    today_cache_read_tokens: 90_000,
    today_tokens: 600_000,
    today_cost: 120,
    today_actual_cost: 98,
    today_account_cost: 41,
    average_duration_ms: 780,
    uptime: 172_800,
    rpm: 64,
    tpm: 180_000,
  },
  trend: [
    trendPoint('2026-08-01', 2_800, 520_000),
    trendPoint('2026-08-02', 3_200, 600_000),
  ],
  models: [
    {
      model: 'must-not-render-dense-model-ranking',
      requests: 1_800,
      input_tokens: 400_000,
      output_tokens: 0,
      cache_creation_tokens: 0,
      cache_read_tokens: 0,
      total_tokens: 400_000,
      cost: 80,
      actual_cost: 62,
    },
  ],
  groups: [
    { group_id: 1, group_name: 'must-not-render-dense-group-ranking', requests: 1_900, total_tokens: 420_000, cost: 80, actual_cost: 64 },
  ],
}

const realtime: AdminDashboardRealtime = {
  active_requests: 3,
  requests_per_minute: 64,
  average_response_time: 680,
  error_rate: 0.8,
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function arrangeSuccess() {
  mocks.getSnapshot.mockResolvedValue(snapshot)
  mocks.getRealtime.mockResolvedValue(realtime)
}

function requestedDays(params: AdminDashboardSnapshotParams): number {
  const start = Date.parse(`${params.start_date}T00:00:00Z`)
  const end = Date.parse(`${params.end_date}T00:00:00Z`)
  return Math.round((end - start) / 86_400_000) + 1
}

describe('MobileAdminDashboardView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    arrangeSuccess()
  })

  it('renders the compact mobile admin overview from snapshot and realtime data', async () => {
    const wrapper = mount(MobileAdminDashboardView)
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('管理概览')
    expect(wrapper.get('[data-testid="metric-users"]').text()).toContain('128')
    expect(wrapper.get('[data-testid="metric-account-health"]').text()).toContain('79%')
    expect(wrapper.get('[data-testid="metric-active-requests"]').text()).toContain('3')
    expect(wrapper.get('[data-testid="metric-today-cost"]').text()).toContain('$98.00')
    expect(wrapper.get('[data-testid="request-trend"]').text()).toContain('3,200')
    expect(wrapper.findAll('[data-testid="trend-point"]')).toHaveLength(2)

    const attention = wrapper.findAll('[data-testid="attention-item"]')
    expect(attention).toHaveLength(3)
    expect(attention.map((item) => item.text())).toEqual([
      expect.stringContaining('错误账号'),
      expect.stringContaining('限流账号'),
      expect.stringContaining('过载账号'),
    ])
    expect(wrapper.text()).not.toContain('must-not-render-dense-model-ranking')
    expect(wrapper.text()).not.toContain('must-not-render-dense-group-ranking')
  })

  it('requests and renders the selected 7 or 30 day trend range', async () => {
    const thirtyDaySnapshot = {
      ...snapshot,
      start_date: '2026-07-04',
      trend: [trendPoint('2026-08-02', 9_900, 1_100_000)],
    }
    mocks.getSnapshot.mockResolvedValueOnce(snapshot).mockResolvedValueOnce(thirtyDaySnapshot)

    const wrapper = mount(MobileAdminDashboardView)
    await flushPromises()

    expect(requestedDays(mocks.getSnapshot.mock.calls[0][0])).toBe(7)
    expect(wrapper.get('[data-range="7"]').attributes('aria-pressed')).toBe('true')

    await wrapper.get('[data-range="30"]').trigger('click')
    await flushPromises()

    expect(requestedDays(mocks.getSnapshot.mock.calls[1][0])).toBe(30)
    expect(wrapper.get('[data-range="30"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="request-trend"]').text()).toContain('9,900')
    expect(wrapper.get('[data-testid="request-trend"]').text()).toContain('07-04')
  })

  it('does not label retained 7 day trend data as 30 days when the range request fails', async () => {
    const failedSnapshot = deferred<AdminDashboardSnapshot>()
    mocks.getSnapshot
      .mockResolvedValueOnce(snapshot)
      .mockReturnValueOnce(failedSnapshot.promise)

    const wrapper = mount(MobileAdminDashboardView)
    await flushPromises()

    expect(wrapper.get('[data-testid="request-trend"]').text()).toContain('近 7 天请求变化')
    await wrapper.get('[data-range="30"]').trigger('click')

    expect(wrapper.get('[data-range="30"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="request-trend"]').text()).toContain('近 7 天请求变化')
    expect(wrapper.get('[data-testid="request-trend"]').text()).not.toContain('近 30 天请求变化')
    expect(wrapper.get('.mobile-page-scroll').attributes('aria-busy')).toBe('true')

    failedSnapshot.reject(new Error('token=range-request-secret'))
    await flushPromises()

    expect(wrapper.get('[data-range="7"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-range="30"]').attributes('aria-pressed')).toBe('false')
    expect(wrapper.get('[data-testid="request-trend"]').text()).toContain('近 7 天请求变化')
    expect(wrapper.get('[data-testid="request-trend"]').text()).toContain('3,200')
    expect(wrapper.get('[data-testid="request-trend"]').text()).not.toContain('近 30 天请求变化')
    expect(wrapper.get('[data-testid="partial-warning"]').text()).toContain('统计与趋势')
    expect(wrapper.text()).not.toContain('range-request-secret')
  })

  it('restores the 30 day range after a failed switch to 7 days and allows retry', async () => {
    const thirtyDaySnapshot = {
      ...snapshot,
      start_date: '2026-07-04',
      trend: [trendPoint('2026-08-02', 9_900, 1_100_000)],
    }
    mocks.getSnapshot
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(thirtyDaySnapshot)
      .mockRejectedValueOnce(new Error('credential=reverse-range-secret'))
      .mockResolvedValueOnce(snapshot)

    const wrapper = mount(MobileAdminDashboardView)
    await flushPromises()
    await wrapper.get('[data-range="30"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="request-trend"]').text()).toContain('近 30 天请求变化')
    expect(wrapper.get('[data-testid="request-trend"]').text()).toContain('9,900')

    await wrapper.get('[data-range="7"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-range="30"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="request-trend"]').text()).toContain('近 30 天请求变化')
    expect(wrapper.get('[data-testid="request-trend"]').text()).toContain('9,900')
    expect(wrapper.text()).not.toContain('reverse-range-secret')

    await wrapper.get('[data-range="7"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-range="7"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="request-trend"]').text()).toContain('近 7 天请求变化')
    expect(wrapper.get('[data-testid="request-trend"]').text()).toContain('3,200')
    expect(wrapper.find('[data-testid="partial-warning"]').exists()).toBe(false)
  })

  it('keeps current data visible and owns busy state while refreshing', async () => {
    const nextSnapshot = {
      ...snapshot,
      stats: { ...snapshot.stats!, total_users: 256 },
    }
    const pendingSnapshot = deferred<AdminDashboardSnapshot>()
    const pendingRealtime = deferred<AdminDashboardRealtime>()
    mocks.getSnapshot.mockResolvedValueOnce(snapshot).mockReturnValueOnce(pendingSnapshot.promise)
    mocks.getRealtime.mockResolvedValueOnce(realtime).mockReturnValueOnce(pendingRealtime.promise)

    const wrapper = mount(MobileAdminDashboardView)
    await flushPromises()
    await wrapper.get('[data-testid="admin-dashboard-refresh"]').trigger('click')

    expect(wrapper.get('[data-testid="metric-users"]').text()).toContain('128')
    expect(wrapper.get('.mobile-page-scroll').attributes('aria-busy')).toBe('true')
    expect(wrapper.get('[data-testid="admin-dashboard-refresh"]').attributes('aria-label')).toBe('正在刷新管理概览')
    expect(wrapper.get('[data-testid="admin-dashboard-refresh"]').attributes('disabled')).toBeDefined()

    pendingSnapshot.resolve(nextSnapshot)
    pendingRealtime.resolve({ ...realtime, active_requests: 8 })
    await flushPromises()

    expect(wrapper.get('[data-testid="metric-users"]').text()).toContain('256')
    expect(wrapper.get('[data-testid="metric-active-requests"]').text()).toContain('8')
    expect(wrapper.get('.mobile-page-scroll').attributes('aria-busy')).toBe('false')
  })

  it('shows snapshot content with a safe partial warning when realtime fails', async () => {
    mocks.getRealtime.mockRejectedValue(new Error('Bearer secret-realtime-token'))

    const wrapper = mount(MobileAdminDashboardView)
    await flushPromises()

    expect(wrapper.get('[data-testid="metric-users"]').text()).toContain('128')
    expect(wrapper.get('[data-testid="partial-warning"]').text()).toContain('实时状态')
    expect(wrapper.text()).not.toContain('secret-realtime-token')
  })

  it('shows realtime content with a safe partial warning when snapshot fails', async () => {
    mocks.getSnapshot.mockRejectedValue(new Error('api_key=secret-snapshot-key'))

    const wrapper = mount(MobileAdminDashboardView)
    await flushPromises()

    expect(wrapper.get('[data-testid="metric-active-requests"]').text()).toContain('3')
    expect(wrapper.get('[data-testid="metric-account-health"]').text()).toContain('—')
    expect(wrapper.get('[data-testid="attention-item"]').text()).toContain('—')
    expect(wrapper.get('[data-testid="partial-warning"]').text()).toContain('统计与趋势')
    expect(wrapper.find('[data-testid="mobile-page-error"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('secret-snapshot-key')
  })

  it('shows a generic retryable full error only when neither source has usable data', async () => {
    mocks.getSnapshot.mockRejectedValueOnce(new Error('credential=do-not-render'))
    mocks.getRealtime.mockRejectedValueOnce(new Error('token=do-not-render'))

    const wrapper = mount(MobileAdminDashboardView)
    await flushPromises()

    expect(wrapper.get('[data-testid="mobile-page-error"]').text()).toContain('暂时无法加载管理概览')
    expect(wrapper.text()).not.toContain('do-not-render')

    await wrapper.get('[data-testid="mobile-page-retry"]').trigger('click')
    await flushPromises()

    expect(mocks.getSnapshot).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[data-testid="metric-users"]').text()).toContain('128')
  })

  it('retains usable old data when both refresh requests fail', async () => {
    const wrapper = mount(MobileAdminDashboardView)
    await flushPromises()
    mocks.getSnapshot.mockRejectedValueOnce(new Error('raw snapshot failure'))
    mocks.getRealtime.mockRejectedValueOnce(new Error('raw realtime failure'))

    await wrapper.get('[data-testid="admin-dashboard-refresh"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="metric-users"]').text()).toContain('128')
    expect(wrapper.get('[data-testid="metric-active-requests"]').text()).toContain('3')
    expect(wrapper.get('[data-testid="partial-warning"]').text()).toContain('已保留现有数据')
    expect(wrapper.find('[data-testid="mobile-page-error"]').exists()).toBe(false)
  })

  it('ignores stale range responses and releases busy state for the latest request', async () => {
    const staleSnapshot = deferred<AdminDashboardSnapshot>()
    const staleRealtime = deferred<AdminDashboardRealtime>()
    const currentSnapshot = { ...snapshot, trend: [trendPoint('2026-08-02', 777, 10)] }
    mocks.getSnapshot
      .mockResolvedValueOnce(snapshot)
      .mockReturnValueOnce(staleSnapshot.promise)
      .mockResolvedValueOnce(currentSnapshot)
    mocks.getRealtime
      .mockResolvedValueOnce(realtime)
      .mockReturnValueOnce(staleRealtime.promise)
      .mockResolvedValueOnce({ ...realtime, active_requests: 7 })

    const wrapper = mount(MobileAdminDashboardView)
    await flushPromises()
    await wrapper.get('[data-range="30"]').trigger('click')
    await wrapper.get('[data-range="7"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="request-trend"]').text()).toContain('777')
    expect(wrapper.get('[data-testid="metric-active-requests"]').text()).toContain('7')
    expect(wrapper.get('.mobile-page-scroll').attributes('aria-busy')).toBe('false')

    staleSnapshot.resolve({ ...snapshot, trend: [trendPoint('2026-08-02', 30_030, 10)] })
    staleRealtime.resolve({ ...realtime, active_requests: 30 })
    await flushPromises()

    expect(wrapper.get('[data-testid="request-trend"]').text()).not.toContain('3万')
    expect(wrapper.get('[data-testid="metric-active-requests"]').text()).toContain('7')
    expect(wrapper.get('[data-range="7"]').attributes('aria-pressed')).toBe('true')
  })

  it('formats invalid and negative API values without leaking unsafe output', async () => {
    mocks.getSnapshot.mockResolvedValue({
      ...snapshot,
      stats: {
        ...snapshot.stats!,
        total_users: -12,
        total_accounts: 0,
        normal_accounts: Number.POSITIVE_INFINITY,
        error_accounts: Number.NaN,
        ratelimit_accounts: -4,
        overload_accounts: Number.POSITIVE_INFINITY,
        today_actual_cost: -9,
      },
      trend: [trendPoint('2026-08-02', Number.POSITIVE_INFINITY, -1)],
    })
    mocks.getRealtime.mockResolvedValue({
      active_requests: Number.NaN,
      requests_per_minute: Number.POSITIVE_INFINITY,
      average_response_time: -100,
      error_rate: Number.NaN,
    })

    const wrapper = mount(MobileAdminDashboardView)
    await flushPromises()

    expect(wrapper.get('[data-testid="metric-users"]').text()).toContain('0')
    expect(wrapper.get('[data-testid="metric-account-health"]').text()).toContain('0%')
    expect(wrapper.get('[data-testid="metric-active-requests"]').text()).toContain('—')
    expect(wrapper.get('[data-testid="metric-today-cost"]').text()).toContain('$0.00')
    expect(wrapper.text()).not.toMatch(/NaN|Infinity|\$-9\.00/)
  })

  it('does not apply pending responses after unmount', async () => {
    const pendingSnapshot = deferred<AdminDashboardSnapshot>()
    const pendingRealtime = deferred<AdminDashboardRealtime>()
    mocks.getSnapshot.mockReturnValue(pendingSnapshot.promise)
    mocks.getRealtime.mockReturnValue(pendingRealtime.promise)

    const wrapper = mount(MobileAdminDashboardView)
    wrapper.unmount()
    pendingSnapshot.resolve(snapshot)
    pendingRealtime.resolve(realtime)
    await flushPromises()

    expect(wrapper.exists()).toBe(false)
  })
})
