import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  groups: vi.fn(), subscriptions: vi.fn(), replace: vi.fn(),
  route: { name: 'user-group-subscriptions', query: { group_id: '3' } },
  session: { user: { role: 'admin' }, userGroupCapabilities: { can_access: true, can_manage: true, group_count: 1 } },
}))
vi.mock('@/api/user-groups', () => ({ listUserGroups: mocks.groups, getUserGroupSubscriptions: mocks.subscriptions }))
vi.mock('@/stores/session', () => ({ session: mocks.session }))
vi.mock('vue-router', () => ({ useRoute: () => mocks.route, useRouter: () => ({ replace: mocks.replace }) }))

import UserGroupSubscriptionsView from './UserGroupSubscriptionsView.vue'

describe('UserGroupSubscriptionsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.groups.mockResolvedValue([{ id: 3, name: '研发团队', description: '', status: 'active', member_count: 1, viewer_count: 0, created_at: '', updated_at: '' }])
    mocks.subscriptions.mockResolvedValue({
      summary: { member_count: 1, active_subscription_count: 1, no_subscription_count: 0, total_balance: 28, active_subscription_usage: 12 },
      items: [{ member: { user_id: 7, username: 'Lin', email: 'lin@example.com', status: 'active', balance: 28, joined_at: '' }, subscription_id: 9, billing_group: 'Claude Pro', platform: 'anthropic', status: 'active', expires_at: '2026-09-01T00:00:00Z', daily_used: 4, daily_limit: 10, weekly_used: 12, weekly_limit: 50, monthly_used: 20, monthly_limit: 100 }],
      total: 1, page: 1, page_size: 20, pages: 1,
    })
  })

  it('renders summary and all three quota windows', async () => {
    const wrapper = mount(UserGroupSubscriptionsView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
    await flushPromises()
    expect(wrapper.text()).toContain('研发团队')
    expect(wrapper.text()).toContain('成员总数')
    expect(wrapper.text()).toContain('$28.00')
    expect(wrapper.text()).toContain('日额度')
    expect(wrapper.text()).toContain('周额度')
    expect(wrapper.text()).toContain('月额度')
    expect(wrapper.text()).toContain('40%')
  })

  it('applies status filters, changes groups, and paginates', async () => {
    mocks.groups.mockResolvedValue([
      { id: 3, name: '研发团队', description: '', status: 'active', member_count: 1, viewer_count: 0, created_at: '', updated_at: '' },
      { id: 4, name: '运营团队', description: '', status: 'active', member_count: 1, viewer_count: 0, created_at: '', updated_at: '' },
    ])
    mocks.subscriptions.mockResolvedValue({
      summary: { member_count: 1, active_subscription_count: 0, no_subscription_count: 1, total_balance: 28, active_subscription_usage: 0 },
      items: [{ member: { user_id: 7, username: 'Lin', email: 'lin@example.com', status: 'active', balance: 28, joined_at: '' }, subscription_id: null, billing_group: '', platform: '', status: 'none', daily_used: 0, weekly_used: 0, monthly_used: 0 }],
      total: 21, page: 1, page_size: 20, pages: 2,
    })
    const wrapper = mount(UserGroupSubscriptionsView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
    await flushPromises()

    expect(wrapper.text()).toContain('无订阅')
    expect(wrapper.text()).toContain('未分配订阅')

    await wrapper.get('[data-testid="subscription-status"]').setValue('none')
    await flushPromises()
    expect(mocks.subscriptions).toHaveBeenLastCalledWith(3, expect.objectContaining({ status: 'none', page: 1 }))

    await wrapper.get('[data-testid="user-group-select"]').setValue('4')
    await flushPromises()
    expect(mocks.replace).toHaveBeenCalledWith({ query: expect.objectContaining({ group_id: '4' }) })
    expect(mocks.subscriptions).toHaveBeenLastCalledWith(4, expect.objectContaining({ page: 1 }))

    const next = wrapper.findAll('button').find((button) => button.text().includes('下一页'))
    expect(next).toBeDefined()
    await next!.trigger('click')
    await flushPromises()
    expect(mocks.subscriptions).toHaveBeenLastCalledWith(4, expect.objectContaining({ page: 2 }))
  })
})
