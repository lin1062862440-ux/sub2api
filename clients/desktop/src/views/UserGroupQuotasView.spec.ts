import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  groups: vi.fn(), quota: vi.fn(), policy: vi.fn(), managers: vi.fn(), members: vi.fn(), teams: vi.fn(), reset: vi.fn(), users: vi.fn(),
}))

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: '3' } }) }))
vi.mock('@/api/user-groups', () => ({
  listUserGroups: mocks.groups,
  getUserGroupQuotaOverview: mocks.quota,
  setUserGroupQuotaPolicy: mocks.policy,
  replaceUserGroupQuotaManagers: mocks.managers,
  updateUserGroupMemberQuotas: mocks.members,
  replaceUserGroupTeamSubscriptions: mocks.teams,
  resetUserGroupQuotaUsage: mocks.reset,
}))
vi.mock('@/api/admin/users', () => ({ listAdminUsers: mocks.users }))

import UserGroupQuotasView from './UserGroupQuotasView.vue'

const overview = {
  group_id: 3,
  policy: { enabled: true, weekly_limit_usd: 100, weekly_usage_usd: 35, weekly_reset_at: '2026-08-10T00:00:00Z' },
  managers: [],
  members: [{ user_id: 7, username: 'Lin', email: 'lin@example.com', status: 'active', weekly_limit_usd: 60, weekly_usage_usd: 20 }],
  allocated_usd: 60,
  can_manage: true,
  can_configure: true,
  team_subscription_groups: [{ billing_group_id: 12, name: 'OpenAI Team', platform: 'openai', status: 'active' }],
  available_team_subscription_groups: [{ billing_group_id: 12, name: 'OpenAI Team', platform: 'openai', status: 'active' }],
}

describe('UserGroupQuotasView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.groups.mockResolvedValue([{ id: 3, name: '研发团队', description: '', status: 'active', member_count: 1, viewer_count: 0, created_at: '', updated_at: '' }])
    mocks.quota.mockResolvedValue(overview)
    mocks.policy.mockResolvedValue(undefined)
    mocks.members.mockResolvedValue(undefined)
    mocks.teams.mockResolvedValue(undefined)
    mocks.users.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100 })
  })

  it('shows team quota usage and saves policy and member allocations', async () => {
    const wrapper = mount(UserGroupQuotasView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' }, Teleport: true } } })
    await flushPromises()

    expect(wrapper.get('[data-testid="team-quota-summary"]').text()).toContain('$35.00')
    expect(wrapper.text()).toContain('OpenAI Team')
    await wrapper.get('[data-testid="save-team-policy"]').trigger('click')
    await flushPromises()
    expect(mocks.teams).toHaveBeenCalledWith(3, [12])
    expect(mocks.policy).toHaveBeenCalledWith(3, { enabled: true, weekly_limit_usd: 100 })

    await wrapper.get('[data-testid="member-quota-7"]').setValue('50')
    await wrapper.get('[data-testid="save-member-quotas"]').trigger('click')
    await flushPromises()
    expect(mocks.members).toHaveBeenCalledWith(3, [{ user_id: 7, weekly_limit_usd: 50 }])
  })
})
