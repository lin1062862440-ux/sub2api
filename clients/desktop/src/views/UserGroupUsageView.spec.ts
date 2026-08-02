import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  groups: vi.fn(), members: vi.fn(), usage: vi.fn(), replace: vi.fn(),
  route: { name: 'user-group-usage', query: { group_id: '3' } },
  session: { user: { role: 'admin' }, userGroupCapabilities: { can_access: true, can_manage: true, group_count: 1 } },
}))
vi.mock('@/api/user-groups', () => ({ listUserGroups: mocks.groups, getUserGroupMembers: mocks.members, getUserGroupUsage: mocks.usage }))
vi.mock('@/stores/session', () => ({ session: mocks.session }))
vi.mock('vue-router', () => ({ useRoute: () => mocks.route, useRouter: () => ({ replace: mocks.replace }) }))

import UserGroupUsageView from './UserGroupUsageView.vue'

describe('UserGroupUsageView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.groups.mockResolvedValue([{ id: 3, name: '研发团队', description: '', status: 'active', member_count: 1, viewer_count: 0, created_at: '', updated_at: '' }])
    mocks.members.mockResolvedValue([{ user_id: 7, username: 'Lin', email: 'lin@example.com', status: 'active', balance: 28, joined_at: '' }])
    mocks.usage.mockResolvedValue({
      summary: { total_requests: 120, total_input_tokens: 1000, total_output_tokens: 500, total_cache_tokens: 200, total_tokens: 1700, total_actual_cost: 8.5, balance_consumption: 3.5, subscription_consumption: 5 },
      by_user: [{ user_id: 7, username: 'Lin', email: 'lin@example.com', total_requests: 120, total_tokens: 1700, total_actual_cost: 8.5, balance_consumption: 3.5, subscription_consumption: 5 }],
      items: [{ id: 1, user_id: 7, username: 'Lin', email: 'lin@example.com', request_id: 'req-1', model: 'claude-sonnet-4', input_tokens: 1000, output_tokens: 500, cache_creation_tokens: 100, cache_read_tokens: 100, total_tokens: 1700, actual_cost: 8.5, billing_type: 1, created_at: '2026-08-01T08:00:00Z' }],
      total: 1, page: 1, page_size: 20, pages: 1,
    })
  })

  it('loads a seven-day range and switches between member and request detail views', async () => {
    const wrapper = mount(UserGroupUsageView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
    await flushPromises()
    expect(mocks.usage).toHaveBeenCalledWith(3, expect.objectContaining({ page: 1, page_size: 20 }))
    const firstParams = mocks.usage.mock.calls[0][1]
    expect(Math.round((new Date(firstParams.end_date).getTime() - new Date(firstParams.start_date).getTime()) / 86_400_000)).toBe(6)
    expect(wrapper.text()).toContain('余额消费')
    expect(wrapper.text()).toContain('$3.50')
    expect(wrapper.text()).toContain('成员汇总')

    const modeButtons = wrapper.findAll('.ug-result-switch button')
    await modeButtons[1]!.trigger('click')
    expect(wrapper.text()).toContain('req-1')
    expect(wrapper.text()).toContain('订阅计费')
  })

  it('submits advanced filters and paginates request details', async () => {
    mocks.usage.mockResolvedValue({
      summary: { total_requests: 120, total_input_tokens: 1000, total_output_tokens: 500, total_cache_tokens: 200, total_tokens: 1700, total_actual_cost: 8.5, balance_consumption: 3.5, subscription_consumption: 5 },
      by_user: [],
      items: [{ id: 1, user_id: 7, username: 'Lin', email: 'lin@example.com', request_id: 'req-1', model: 'claude-sonnet-4', input_tokens: 1000, output_tokens: 500, cache_creation_tokens: 100, cache_read_tokens: 100, total_tokens: 1700, actual_cost: 8.5, billing_type: 1, created_at: '2026-08-01T08:00:00Z' }],
      total: 21, page: 1, page_size: 20, pages: 2,
    })
    const wrapper = mount(UserGroupUsageView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
    await flushPromises()

    await wrapper.get('.more').trigger('click')
    const advanced = wrapper.get('.ug-advanced-filters')
    const controls = advanced.findAll('select')
    await controls[0]!.setValue('7')
    await advanced.get('input').setValue('claude-sonnet-4')
    await controls[1]!.setValue('1')
    await wrapper.get('[data-testid="group-usage-filters"]').trigger('submit')
    await flushPromises()

    expect(mocks.usage).toHaveBeenLastCalledWith(3, expect.objectContaining({
      user_id: 7,
      model: 'claude-sonnet-4',
      billing_type: 1,
      page: 1,
    }))

    const modeButtons = wrapper.findAll('.ug-result-switch button')
    await modeButtons[1]!.trigger('click')
    const next = wrapper.findAll('button').find((button) => button.text().includes('下一页'))
    expect(next).toBeDefined()
    await next!.trigger('click')
    await flushPromises()
    expect(mocks.usage).toHaveBeenLastCalledWith(3, expect.objectContaining({ page: 2 }))
  })
})
