import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  groups: vi.fn(),
  members: vi.fn(),
  quota: vi.fn(),
  memberQuotas: vi.fn(),
  policy: vi.fn(),
  teams: vi.fn(),
  managers: vi.fn(),
  reset: vi.fn(),
  back: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
  session: { user: { role: 'admin' }, userGroupCapabilities: { can_manage: true } },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '3' }, query: {} }),
  useRouter: () => ({ back: mocks.back }),
}))
vi.mock('@/stores/session', () => ({ session: mocks.session }))
vi.mock('@/stores/toast', () => ({ toast: {
  success: mocks.toastSuccess,
  error: mocks.toastError,
  warning: mocks.toastWarning,
} }))
vi.mock('@/api/user-groups', () => ({
  listUserGroups: mocks.groups,
  getUserGroupMembers: mocks.members,
  getUserGroupQuotaOverview: mocks.quota,
  updateUserGroupMemberQuotas: mocks.memberQuotas,
  setUserGroupQuotaPolicy: mocks.policy,
  replaceUserGroupTeamSubscriptions: mocks.teams,
  replaceUserGroupQuotaManagers: mocks.managers,
  resetUserGroupQuotaUsage: mocks.reset,
}))

import MobileTeamWorkspaceView from './MobileTeamWorkspaceView.vue'
import source from './MobileTeamWorkspaceView.vue?raw'

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

describe('MobileTeamWorkspaceView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.groups.mockResolvedValue([{ id: 3, name: '研发团队', description: '核心研发成员', status: 'active', member_count: 1, viewer_count: 0, created_at: '', updated_at: '' }])
    mocks.members.mockResolvedValue([{ user_id: 7, username: 'Lin', email: 'lin@example.com', status: 'active', joined_at: '' }])
    mocks.quota.mockResolvedValue(overview)
    mocks.memberQuotas.mockResolvedValue(undefined)
    mocks.policy.mockResolvedValue(undefined)
    mocks.teams.mockResolvedValue(undefined)
    mocks.managers.mockResolvedValue(undefined)
    mocks.reset.mockResolvedValue(undefined)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('renders a narrow-screen member row with visible usage and allocation', async () => {
    const wrapper = mount(MobileTeamWorkspaceView, { global: { stubs: { Teleport: true } } })
    await flushPromises()

    const row = wrapper.get('[data-testid="mobile-team-member-7"]')
    expect(row.text()).toContain('Lin')
    expect(row.text()).toContain('$20.00')
    expect(row.text()).toContain('33%')
    expect(wrapper.get('[data-testid="mobile-member-quota-7"]').element).toHaveProperty('value', '60')
    expect(source).not.toContain('overflow-x: auto')
    expect(source).not.toContain('min-width: 700px')
  })

  it('opens the shared quota settings sheet in mobile mode', async () => {
    const wrapper = mount(MobileTeamWorkspaceView, { global: { stubs: { Teleport: true } } })
    await flushPromises()
    await wrapper.get('[data-testid="open-mobile-team-quota-settings"]').trigger('click')

    expect(wrapper.get('[data-testid="team-quota-settings"]').classes()).toContain('team-quota-sheet--mobile')
  })

  it('saves member quota edits through the existing API', async () => {
    const wrapper = mount(MobileTeamWorkspaceView, { global: { stubs: { Teleport: true } } })
    await flushPromises()
    await wrapper.get('[data-testid="mobile-member-quota-7"]').setValue('50')
    await wrapper.get('[data-testid="save-mobile-member-quotas"]').trigger('click')
    await flushPromises()

    expect(mocks.memberQuotas).toHaveBeenCalledWith(3, [{ user_id: 7, weekly_limit_usd: 50 }])
  })

  it('keeps quota data visible when members fail and retries only members', async () => {
    mocks.members.mockRejectedValueOnce(new Error('成员接口不可用'))
    const wrapper = mount(MobileTeamWorkspaceView, { global: { stubs: { Teleport: true } } })
    await flushPromises()

    expect(wrapper.get('[data-testid="mobile-team-quota-summary"]').text()).toContain('$100.00')
    expect(wrapper.get('[data-testid="mobile-team-members-error"]').text()).toContain('成员接口不可用')

    await wrapper.get('[data-testid="retry-mobile-team-members"]').trigger('click')
    await flushPromises()

    expect(mocks.members).toHaveBeenCalledTimes(2)
    expect(mocks.groups).toHaveBeenCalledTimes(1)
    expect(mocks.quota).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="mobile-team-member-7"]').text()).toContain('Lin')
  })

  it('keeps members visible when quota loading fails and retries only quota', async () => {
    mocks.quota.mockRejectedValueOnce(new Error('配额接口不可用'))
    const wrapper = mount(MobileTeamWorkspaceView, { global: { stubs: { Teleport: true } } })
    await flushPromises()

    expect(wrapper.get('[data-testid="mobile-team-member-7"]').text()).toContain('Lin')
    expect(wrapper.get('[data-testid="mobile-team-quota-error"]').text()).toContain('配额接口不可用')

    await wrapper.get('[data-testid="retry-mobile-team-quota"]').trigger('click')
    await flushPromises()

    expect(mocks.quota).toHaveBeenCalledTimes(2)
    expect(mocks.members).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-testid="mobile-team-quota-summary"]').text()).toContain('$100.00')
  })

  it('shows all five required team summary metrics', async () => {
    const wrapper = mount(MobileTeamWorkspaceView, { global: { stubs: { Teleport: true } } })
    await flushPromises()

    const summary = wrapper.get('[data-testid="mobile-team-quota-summary"]').text()
    expect(summary).toContain('成员数量')
    expect(summary).toContain('团队周配额')
    expect(summary).toContain('本周用量')
    expect(summary).toContain('已分配成员额度')
    expect(summary).toContain('未分配额度')
    expect(summary).toContain('$40.00')
  })

  it('reports a post-save refresh failure as a sync warning', async () => {
    mocks.quota.mockResolvedValueOnce(overview).mockRejectedValueOnce(new Error('刷新超时'))
    const wrapper = mount(MobileTeamWorkspaceView, { global: { stubs: { Teleport: true } } })
    await flushPromises()

    await wrapper.get('[data-testid="mobile-member-quota-7"]').setValue('50')
    await wrapper.get('[data-testid="save-mobile-member-quotas"]').trigger('click')
    await flushPromises()

    expect(mocks.toastSuccess).toHaveBeenCalledWith('成员配额已保存')
    expect(mocks.toastWarning).toHaveBeenCalledWith('成员配额已保存，但最新数据同步失败', { detail: '刷新超时' })
    expect(mocks.toastError).not.toHaveBeenCalledWith('成员配额保存失败', expect.anything())
    expect(wrapper.get('[data-testid="mobile-member-quota-7"]').element).toHaveProperty('value', '50')
  })

  it('toasts quota policy and reset failures while preserving the open draft', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    mocks.policy.mockRejectedValueOnce(new Error('策略保存被拒绝'))
    mocks.reset.mockRejectedValueOnce(new Error('重置请求被拒绝'))
    const wrapper = mount(MobileTeamWorkspaceView, { global: { stubs: { Teleport: true } } })
    await flushPromises()

    await wrapper.get('[data-testid="open-mobile-team-quota-settings"]').trigger('click')
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
})
