import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  progress: vi.fn(),
  assign: vi.fn(),
  bulkAssign: vi.fn(),
  extend: vi.fn(),
  reset: vi.fn(),
  revoke: vi.fn(),
  restore: vi.fn(),
  groups: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/api/admin/subscriptions', () => ({
  listAdminSubscriptions: mocks.list,
  getAdminSubscriptionProgress: mocks.progress,
  assignAdminSubscription: mocks.assign,
  bulkAssignAdminSubscriptions: mocks.bulkAssign,
  extendAdminSubscription: mocks.extend,
  resetAdminSubscriptionQuota: mocks.reset,
  revokeAdminSubscription: mocks.revoke,
  restoreAdminSubscription: mocks.restore,
}))
vi.mock('@/api/admin/users', () => ({ getAdminGroups: mocks.groups }))
vi.mock('@/stores/toast', () => ({ toast: {
  success: mocks.toastSuccess,
  warning: mocks.toastWarning,
  error: mocks.toastError,
} }))

import View from './AdminSubscriptionsView.vue'

const subscription = {
  id: 3,
  user_id: 7,
  group_id: 2,
  status: 'active',
  starts_at: '2026-08-01',
  expires_at: '2026-09-01',
  daily_usage_usd: 4,
  weekly_usage_usd: 12,
  monthly_usage_usd: 20,
  created_at: '',
  updated_at: '',
  user: { id: 7, email: 'lin@example.com', username: 'Lin' },
  group: { id: 2, name: 'Claude Code', daily_limit_usd: 10, weekly_limit_usd: 50, monthly_limit_usd: 100 },
}

describe('AdminSubscriptionsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.list.mockResolvedValue({ items: [subscription], total: 1, page: 1, page_size: 20 })
    mocks.groups.mockResolvedValue([{ id: 2, name: 'Claude Code' }])
    mocks.progress.mockResolvedValue({
      id: 3,
      group_name: 'Claude Code',
      daily: { used_usd: 32.05, limit_usd: 400, remaining_usd: 367.95, percentage: 8.009257707, resets_in_seconds: 21_600 },
      weekly: { used_usd: 113.24, limit_usd: 500, remaining_usd: 386.76, percentage: 22.6459541288, resets_in_seconds: 360_000 },
      expires_at: '2026-09-01',
      expires_in_days: 30,
    })
    mocks.assign.mockResolvedValue(subscription)
    mocks.bulkAssign.mockResolvedValue({
      success_count: 3,
      created_count: 2,
      reused_count: 1,
      failed_count: 0,
      subscriptions: [subscription],
      errors: [],
    })
    mocks.extend.mockResolvedValue(subscription)
    mocks.reset.mockResolvedValue(subscription)
    mocks.revoke.mockResolvedValue({ message: 'ok' })
    mocks.restore.mockResolvedValue(subscription)
  })

  it('renders subscription cards and confirms extension and quota reset', async () => {
    const wrapper = mount(View)
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('订阅管理')
    expect(wrapper.text()).toContain('lin@example.com')
    const dailyQuota = wrapper.get('[data-testid="subscription-quota-daily-3"]')
    expect(dailyQuota.get('.quota-amount strong').text()).toBe('$32.05')
    expect(dailyQuota.get('.quota-amount span').text()).toBe('/ $400.00')
    expect(dailyQuota.text()).toContain('8%')
    expect(dailyQuota.text()).toContain('6 小时后重置')
    expect(wrapper.get('[data-testid="subscription-quota-weekly-3"]').text()).toContain('22.6%')
    expect(wrapper.find('[data-testid="subscription-quota-monthly-3"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('8.009257707%')
    await wrapper.get('[data-testid="extend-subscription-3"]').trigger('click')
    expect(mocks.extend).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="subscription-extend-days"]').setValue('45')
    await wrapper.get('[data-testid="confirm-subscription-action"]').trigger('click')
    await flushPromises()
    expect(mocks.extend).toHaveBeenCalledWith(3, 45)
    await wrapper.get('[data-testid="reset-subscription-3"]').trigger('click')
    expect(mocks.reset).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="subscription-action-dialog"]').text()).toContain('重置用量')
    await wrapper.get('[data-testid="confirm-subscription-action"]').trigger('click')
    await flushPromises()
    expect(mocks.reset).toHaveBeenCalledWith(3, { daily: true, weekly: true, monthly: true })
  })

  it('searches across subscriptions and supports pagination', async () => {
    mocks.list.mockResolvedValue({ items: [subscription], total: 55, page: 1, page_size: 20 })
    const wrapper = mount(View)
    await flushPromises()

    await wrapper.get('[data-testid="subscription-search"]').setValue('lin@example.com')
    await wrapper.get('[data-testid="subscription-filters"]').trigger('submit')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 1,
      page_size: 20,
      search: 'lin@example.com',
    }))

    await wrapper.get('[data-testid="subscription-page-2"]').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
  })

  it('assigns a subscription to one user and group', async () => {
    const wrapper = mount(View)
    await flushPromises()
    await wrapper.get('[data-testid="assign-subscription"]').trigger('click')
    await wrapper.get('[data-testid="subscription-user-id"]').setValue('7')
    await wrapper.get('[data-testid="subscription-group-id"]').setValue('2')
    await wrapper.get('[data-testid="subscription-editor"]').trigger('submit')
    await flushPromises()

    expect(mocks.assign).toHaveBeenCalledWith({ user_id: 7, group_id: 2, validity_days: 30 })
  })

  it('keeps assignment errors visible in the editor and emits an error toast', async () => {
    mocks.assign.mockRejectedValueOnce(new Error('分配服务暂不可用'))
    const wrapper = mount(View)
    await flushPromises()

    await wrapper.get('[data-testid="assign-subscription"]').trigger('click')
    await wrapper.get('[data-testid="subscription-user-id"]').setValue('7')
    await wrapper.get('[data-testid="subscription-group-id"]').setValue('2')
    await wrapper.get('[data-testid="subscription-editor"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="subscription-assignment-error"]').text()).toContain('分配服务暂不可用')
    expect(mocks.toastError).toHaveBeenCalledWith('订阅分配失败', { detail: '分配服务暂不可用' })
    expect(wrapper.find('[data-testid="subscription-editor"]').exists()).toBe(true)
  })

  it('bulk assigns a subscription from comma, space, or line separated user ids', async () => {
    const wrapper = mount(View)
    await flushPromises()
    await wrapper.get('[data-testid="assign-subscription"]').trigger('click')
    await wrapper.get('[data-testid="subscription-mode-bulk"]').trigger('click')
    await wrapper.get('[data-testid="subscription-user-ids"]').setValue('7, 8\n9')
    await wrapper.get('[data-testid="subscription-group-id"]').setValue('2')
    await wrapper.get('[data-testid="subscription-editor"]').trigger('submit')
    await flushPromises()

    expect(mocks.bulkAssign).toHaveBeenCalledWith({ user_ids: [7, 8, 9], group_id: 2, validity_days: 30 })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('批量分配完成：成功 3 个，失败 0 个')
  })

  it('requires an in-app confirmation before revoking an active subscription', async () => {
    const wrapper = mount(View)
    await flushPromises()

    await wrapper.get('[data-testid="toggle-subscription-3"]').trigger('click')
    expect(mocks.revoke).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="subscription-action-dialog"]').text()).toContain('撤销订阅')
    await wrapper.get('[data-testid="confirm-subscription-action"]').trigger('click')
    await flushPromises()
    expect(mocks.revoke).toHaveBeenCalledWith(3)
  })

  it('preserves loading, empty, and retryable error states', async () => {
    mocks.list.mockRejectedValueOnce(new Error('offline'))
    const wrapper = mount(View)

    expect(wrapper.find('.loading').exists()).toBe(true)
    await flushPromises()
    expect(wrapper.text()).toContain('订阅列表加载失败')
    expect(wrapper.text()).toContain('offline')

    await wrapper.get('.empty button').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenCalledTimes(2)

    mocks.list.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 20 })
    await wrapper.get('.toolbar button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('暂无订阅')
  })

  it('renders team member quota without calling the ordinary progress endpoint', async () => {
    mocks.list.mockResolvedValue({
      items: [{
        ...subscription,
        id: 9,
        owner_user_group_id: 3,
        team_weekly_limit_usd: 300,
        team_weekly_usage_usd: 120.5,
        team_weekly_window_start: '2026-08-01T00:00:00Z',
        group: { id: 8, name: 'OpenAI Team', subscription_type: 'team_subscription' },
      }],
      total: 1,
      page: 1,
      page_size: 20,
    })
    const wrapper = mount(View)
    await flushPromises()

    expect(mocks.progress).not.toHaveBeenCalled()
    const quota = wrapper.get('[data-testid="subscription-quota-team-weekly-9"]')
    expect(quota.text()).toContain('本周已用 / 成员分配额度')
    expect(quota.text()).toContain('$120.50')
    expect(quota.text()).toContain('/ $300.00')
    expect(wrapper.find('[data-testid="reset-subscription-9"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('团队额度请在“套餐与额度”中管理')
  })
})
