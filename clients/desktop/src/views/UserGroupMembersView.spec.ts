import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  groups: vi.fn(),
  members: vi.fn(),
  viewers: vi.fn(),
  promptViewers: vi.fn(),
  replaceMembers: vi.fn(),
  replaceViewers: vi.fn(),
  setPromptCapture: vi.fn(),
  replacePromptViewers: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  quota: vi.fn(),
  policy: vi.fn(),
  quotaManagers: vi.fn(),
  memberQuotas: vi.fn(),
  teams: vi.fn(),
  resetQuota: vi.fn(),
  users: vi.fn(),
  replaceRoute: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
  route: { params: { id: '3' }, query: {} as Record<string, string> },
  session: { user: { role: 'admin' }, userGroupCapabilities: { can_manage: true } },
}))

vi.mock('@/api/user-groups', () => ({
  listUserGroups: mocks.groups,
  getUserGroupMembers: mocks.members,
  getUserGroupViewers: mocks.viewers,
  getUserGroupPromptViewers: mocks.promptViewers,
  replaceUserGroupMembers: mocks.replaceMembers,
  replaceUserGroupViewers: mocks.replaceViewers,
  setUserGroupPromptCapture: mocks.setPromptCapture,
  replaceUserGroupPromptViewers: mocks.replacePromptViewers,
  updateUserGroup: mocks.update,
  archiveUserGroup: mocks.archive,
  getUserGroupQuotaOverview: mocks.quota,
  setUserGroupQuotaPolicy: mocks.policy,
  replaceUserGroupQuotaManagers: mocks.quotaManagers,
  updateUserGroupMemberQuotas: mocks.memberQuotas,
  replaceUserGroupTeamSubscriptions: mocks.teams,
  resetUserGroupQuotaUsage: mocks.resetQuota,
}))
vi.mock('@/api/admin/users', () => ({ listAdminUsers: mocks.users }))
vi.mock('@/stores/session', () => ({ session: mocks.session }))
vi.mock('@/stores/toast', () => ({ toast: {
  success: mocks.toastSuccess,
  error: mocks.toastError,
  warning: mocks.toastWarning,
} }))
vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ replace: mocks.replaceRoute }),
}))

import UserGroupMembersView from './UserGroupMembersView.vue'

describe('UserGroupMembersView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.session.user = { role: 'admin' }
    mocks.session.userGroupCapabilities = { can_manage: true }
    mocks.route.query = {}
    mocks.groups.mockResolvedValue([{ id: 3, name: '研发团队', description: '', status: 'active', member_count: 1, viewer_count: 0, prompt_capture_enabled: true, created_at: '', updated_at: '' }])
    mocks.members.mockResolvedValue([{ user_id: 7, username: 'Lin', email: 'lin@example.com', status: 'active', joined_at: '' }])
    mocks.quota.mockResolvedValue({
      group_id: 3,
      policy: { enabled: true, weekly_limit_usd: 100, weekly_usage_usd: 35, weekly_reset_at: '2026-08-10T00:00:00Z' },
      managers: [],
      members: [{ user_id: 7, username: 'Lin', email: 'lin@example.com', status: 'active', weekly_limit_usd: 60, weekly_usage_usd: 20 }],
      allocated_usd: 60,
      can_manage: true,
      can_configure: true,
      team_subscription_groups: [{ billing_group_id: 12, name: 'OpenAI Team', platform: 'openai', status: 'active' }],
      available_team_subscription_groups: [{ billing_group_id: 12, name: 'OpenAI Team', platform: 'openai', status: 'active' }],
    })
    mocks.promptViewers.mockResolvedValue([{ user_id: 9, username: 'Reviewer', email: 'reviewer@example.com', status: 'active', granted_at: '' }])
    mocks.users.mockResolvedValue({ items: [{ id: 9, username: 'Reviewer', email: 'reviewer@example.com', role: 'user', balance: 0, concurrency: 1, status: 'active', allowed_groups: [], notes: '', created_at: '', updated_at: '' }] })
    mocks.setPromptCapture.mockResolvedValue(undefined)
    mocks.replacePromptViewers.mockResolvedValue(undefined)
    mocks.policy.mockResolvedValue(undefined)
    mocks.quotaManagers.mockResolvedValue(undefined)
    mocks.memberQuotas.mockResolvedValue(undefined)
    mocks.teams.mockResolvedValue(undefined)
    mocks.resetQuota.mockResolvedValue(undefined)
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('lets an administrator configure capture and explicit Prompt viewers', async () => {
    const wrapper = mount(UserGroupMembersView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
    await flushPromises()

    await wrapper.get('[data-testid="manage-team-prompts"]').trigger('click')
    await flushPromises()
    expect(mocks.promptViewers).toHaveBeenCalledWith(3)
    expect(document.body.textContent).toContain('管理员不会自动获得查看权限')

    const save = document.body.querySelector<HTMLButtonElement>('[data-testid="save-prompt-settings"]')
    expect(save).not.toBeNull()
    save!.click()
    await flushPromises()

    expect(mocks.setPromptCapture).toHaveBeenCalledWith(3, true)
    expect(mocks.replacePromptViewers).toHaveBeenCalledWith(3, [9])
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Prompt 设置已更新')
  })

  it('keeps Prompt configuration hidden from team managers', async () => {
    mocks.session.user = { role: 'user' }
    const wrapper = mount(UserGroupMembersView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
    await flushPromises()

    expect(wrapper.find('[data-testid="manage-team-members"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="manage-team-prompts"]').exists()).toBe(false)
  })

  it('combines member identity, weekly usage and editable quota in one workspace', async () => {
    const wrapper = mount(UserGroupMembersView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' }, Teleport: true } } })
    await flushPromises()

    expect(wrapper.get('[data-testid="team-quota-summary"]').text()).toContain('$100.00')
    expect(wrapper.get('[data-testid="team-quota-summary"]').text()).toContain('$35.00')
    expect(wrapper.text()).toContain('OpenAI Team')
    const row = wrapper.get('[data-testid="team-member-row-7"]')
    expect(row.text()).toContain('Lin')
    expect(row.text()).toContain('$20.00')
    expect(row.text()).toContain('33%')

    await wrapper.get('[data-testid="member-quota-7"]').setValue('50')
    await wrapper.get('[data-testid="save-member-quotas"]').trigger('click')
    await flushPromises()
    expect(mocks.memberQuotas).toHaveBeenCalledWith(3, [{ user_id: 7, weekly_limit_usd: 50 }])
  })

  it('keeps quota data visible when members fail and retries only the member dataset', async () => {
    mocks.members.mockRejectedValueOnce(new Error('成员接口不可用'))
    const wrapper = mount(UserGroupMembersView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' }, Teleport: true } } })
    await flushPromises()

    expect(wrapper.text()).toContain('研发团队')
    expect(wrapper.get('[data-testid="team-quota-summary"]').text()).toContain('$100.00')
    expect(wrapper.get('[data-testid="team-members-error"]').text()).toContain('成员接口不可用')
    expect(wrapper.text()).not.toContain('无法加载团队')

    await wrapper.get('[data-testid="retry-team-members"]').trigger('click')
    await flushPromises()

    expect(mocks.members).toHaveBeenCalledTimes(2)
    expect(mocks.groups).toHaveBeenCalledTimes(1)
    expect(mocks.quota).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="team-member-row-7"]').text()).toContain('Lin')
  })

  it('shows all five required team summary metrics', async () => {
    const wrapper = mount(UserGroupMembersView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' }, Teleport: true } } })
    await flushPromises()

    const summary = wrapper.get('[data-testid="team-quota-summary"]').text()
    expect(summary).toContain('成员数量')
    expect(summary).toContain('团队周配额')
    expect(summary).toContain('本周用量')
    expect(summary).toContain('已分配成员额度')
    expect(summary).toContain('未分配额度')
    expect(summary).toContain('$40.00')
  })

  it('reports a post-save quota refresh failure as a sync warning', async () => {
    mocks.quota.mockResolvedValueOnce(await mocks.quota()).mockRejectedValueOnce(new Error('刷新超时'))
    const wrapper = mount(UserGroupMembersView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' }, Teleport: true } } })
    await flushPromises()

    await wrapper.get('[data-testid="member-quota-7"]').setValue('50')
    await wrapper.get('[data-testid="save-member-quotas"]').trigger('click')
    await flushPromises()

    expect(mocks.toastSuccess).toHaveBeenCalledWith('成员配额已保存')
    expect(mocks.toastWarning).toHaveBeenCalledWith('成员配额已保存，但最新数据同步失败', { detail: '刷新超时' })
    expect(mocks.toastError).not.toHaveBeenCalledWith('成员配额保存失败', expect.anything())
    expect(wrapper.get('[data-testid="member-quota-7"]').element).toHaveProperty('value', '50')
  })

  it('toasts quota policy and reset failures while preserving the open draft', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    mocks.policy.mockRejectedValueOnce(new Error('策略保存被拒绝'))
    mocks.resetQuota.mockRejectedValueOnce(new Error('重置请求被拒绝'))
    const wrapper = mount(UserGroupMembersView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' }, Teleport: true } } })
    await flushPromises()

    await wrapper.get('[data-testid="open-team-quota-settings"]').trigger('click')
    await wrapper.get('[data-testid="team-weekly-limit"]').setValue('125')
    await wrapper.get('[data-testid="save-team-policy"]').trigger('click')
    await flushPromises()

    expect(mocks.toastError).toHaveBeenCalledWith('团队周配额保存失败', { detail: '策略保存被拒绝' })
    expect(wrapper.find('[data-testid="team-quota-settings"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="team-weekly-limit"]').element).toHaveProperty('value', '125')

    await wrapper.get('[data-testid="reset-team-quota"]').trigger('click')
    await flushPromises()

    expect(mocks.toastError).toHaveBeenCalledWith('团队配额重置失败', { detail: '重置请求被拒绝' })
    expect(wrapper.find('[data-testid="team-quota-settings"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="team-weekly-limit"]').element).toHaveProperty('value', '125')
  })

  it('opens weekly settings from legacy routes and respects quota permissions', async () => {
    mocks.route.query = { openQuota: '1' }
    const wrapper = mount(UserGroupMembersView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' }, Teleport: true } } })
    await flushPromises()
    expect(wrapper.get('[data-testid="team-quota-settings"]')).toBeTruthy()
    wrapper.unmount()

    mocks.session.user = { role: 'user' }
    mocks.session.userGroupCapabilities = { can_manage: false }
    mocks.route.query = {}
    mocks.quota.mockResolvedValueOnce({ ...(await mocks.quota()), can_manage: false, can_configure: false })
    const readOnly = mount(UserGroupMembersView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' }, Teleport: true } } })
    await flushPromises()
    expect(readOnly.find('[data-testid="open-team-quota-settings"]').exists()).toBe(false)
    expect(readOnly.get('[data-testid="member-quota-7"]').attributes('disabled')).toBeDefined()
    expect(readOnly.find('[data-testid="save-member-quotas"]').exists()).toBe(false)
  })
})
