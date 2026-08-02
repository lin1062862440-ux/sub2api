import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
  getRealtime: vi.fn(),
}))

vi.mock('@/api/admin/dashboard', () => ({
  getAdminDashboardSnapshot: mocks.getSnapshot,
  getAdminDashboardRealtime: mocks.getRealtime,
}))

import AdminDashboardView from './AdminDashboardView.vue'

const snapshot = {
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
    ratelimit_accounts: 2,
    overload_accounts: 1,
    total_requests: 90000,
    total_input_tokens: 4000000,
    total_output_tokens: 1000000,
    total_cache_creation_tokens: 100000,
    total_cache_read_tokens: 900000,
    total_tokens: 6000000,
    total_cost: 1200,
    total_actual_cost: 980,
    total_account_cost: 410,
    today_requests: 3200,
    today_input_tokens: 400000,
    today_output_tokens: 100000,
    today_cache_creation_tokens: 10000,
    today_cache_read_tokens: 90000,
    today_tokens: 600000,
    today_cost: 120,
    today_actual_cost: 98,
    today_account_cost: 41,
    average_duration_ms: 780,
    uptime: 172800,
    rpm: 64,
    tpm: 180000,
  },
  trend: [
    { date: '2026-08-01', requests: 2800, total_tokens: 520000 },
    { date: '2026-08-02', requests: 3200, total_tokens: 600000 },
  ],
  models: [
    { model: 'claude-sonnet-4', requests: 1800, total_tokens: 400000, actual_cost: 62 },
    { model: 'gpt-5', requests: 900, total_tokens: 160000, actual_cost: 28 },
  ],
  groups: [
    { group_id: 1, group_name: 'Claude Code', requests: 1900, total_tokens: 420000, cost: 80, actual_cost: 64 },
  ],
}

const realtime = {
  active_requests: 3,
  requests_per_minute: 64,
  average_response_time: 680,
  error_rate: 0.8,
}

function arrangeSuccess() {
  mocks.getSnapshot.mockResolvedValue(snapshot)
  mocks.getRealtime.mockResolvedValue(realtime)
}

describe('AdminDashboardView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    arrangeSuccess()
  })

  it('renders system metrics, account health and ranked usage from the snapshot', async () => {
    const wrapper = mount(AdminDashboardView)
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('管理概览')
    expect(wrapper.get('[data-testid="metric-users"]').text()).toContain('128')
    expect(wrapper.get('[data-testid="metric-today-cost"]').text()).toContain('$98.00')
    expect(wrapper.get('[data-testid="metric-active-requests"]').text()).toContain('3')
    expect(wrapper.get('[data-testid="account-health"]').text()).toContain('19')
    expect(wrapper.get('[data-testid="attention-count"]').text()).toContain('5')
    expect(wrapper.text()).toContain('claude-sonnet-4')
    expect(wrapper.text()).toContain('Claude Code')
    expect(wrapper.find('[data-testid="trend-line"]').exists()).toBe(true)
  })

  it('keeps snapshot data visible when realtime health is unavailable', async () => {
    mocks.getRealtime.mockRejectedValue(new Error('offline'))

    const wrapper = mount(AdminDashboardView)
    await flushPromises()

    expect(wrapper.get('[data-testid="metric-users"]').text()).toContain('128')
    expect(wrapper.get('[data-testid="partial-warning"]').text()).toContain('实时状态')
  })

  it('shows an initial loading transition without rendering stale zero metrics', () => {
    mocks.getSnapshot.mockReturnValue(new Promise(() => {}))
    mocks.getRealtime.mockReturnValue(new Promise(() => {}))

    const wrapper = mount(AdminDashboardView)

    expect(wrapper.find('[data-testid="admin-dashboard-loading"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="metric-users"]').exists()).toBe(false)
  })

  it('offers a retry when the core snapshot fails', async () => {
    mocks.getSnapshot.mockRejectedValueOnce(new Error('snapshot unavailable'))

    const wrapper = mount(AdminDashboardView)
    await flushPromises()

    expect(wrapper.get('[data-testid="admin-dashboard-error"]').text()).toContain('管理数据加载失败')

    await wrapper.get('[data-testid="retry-dashboard"]').trigger('click')
    await flushPromises()

    expect(mocks.getSnapshot).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[data-testid="metric-users"]').text()).toContain('128')
  })
})
