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
      subscription_id: 3,
      daily: { used: 4, limit: 10, percentage: 40 },
      weekly: { used: 12, limit: 50, percentage: 24 },
      monthly: { used: 20, limit: 100, percentage: 20 },
      days_remaining: 30,
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
    expect(wrapper.text()).toContain('40%')
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
    expect(wrapper.text()).toContain('成功 3 个')
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
})
