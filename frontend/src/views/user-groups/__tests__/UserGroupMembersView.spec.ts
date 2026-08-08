import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import UserGroupMembersView from '../UserGroupMembersView.vue'

const mocks = vi.hoisted(() => ({
  canManage: true,
  list: vi.fn(),
  getMembers: vi.fn(),
  getViewers: vi.fn(),
  replaceMembers: vi.fn(),
  replaceViewers: vi.fn(),
  getPromptViewers: vi.fn(),
  setPromptCapture: vi.fn(),
  replacePromptViewers: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  getQuotaOverview: vi.fn(),
  setQuotaPolicy: vi.fn(),
  replaceQuotaManagers: vi.fn(),
  updateMemberQuotas: vi.fn(),
  replaceTeamSubscriptionGroups: vi.fn(),
  resetQuotaUsage: vi.fn(),
  push: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

const route = vi.hoisted(() => ({ params: { id: '7' }, name: 'UserGroupMembers', query: {} as Record<string, string> }))

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'en-US' } }),
  createI18n: () => ({ global: { t: (key: string) => key, locale: { value: 'en-US' } } }),
}))

vi.mock('@/api/userGroups', () => ({
  userGroupAPI: {
    list: mocks.list,
    getMembers: mocks.getMembers,
    getViewers: mocks.getViewers,
    replaceMembers: mocks.replaceMembers,
    replaceViewers: mocks.replaceViewers,
    getPromptViewers: mocks.getPromptViewers,
    setPromptCapture: mocks.setPromptCapture,
    replacePromptViewers: mocks.replacePromptViewers,
    update: mocks.update,
    archive: mocks.archive,
    getQuotaOverview: mocks.getQuotaOverview,
    setQuotaPolicy: mocks.setQuotaPolicy,
    replaceQuotaManagers: mocks.replaceQuotaManagers,
    updateMemberQuotas: mocks.updateMemberQuotas,
    replaceTeamSubscriptionGroups: mocks.replaceTeamSubscriptionGroups,
    resetQuotaUsage: mocks.resetQuotaUsage,
  },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ get canManageUserGroups() { return mocks.canManage } }),
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({ showSuccess: mocks.success, showError: mocks.error }),
}))

vi.mock('@/utils/avatar', () => ({ resolveAvatarUrl: () => '/avatar.png' }))

const group = {
  id: 7,
  name: 'Team A',
  description: 'Product engineering',
  status: 'active' as const,
  member_count: 1,
  viewer_count: 2,
  prompt_capture_enabled: true,
  can_view_prompt: true,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-02T00:00:00Z',
}

const member = {
  user_id: 11,
  email: 'alice@example.com',
  username: 'Alice',
  status: 'active',
  joined_at: '2026-08-01T00:00:00Z',
}

const overview = {
  group_id: 7,
  policy: {
    enabled: true,
    weekly_limit_usd: 800,
    weekly_usage_usd: 250,
    weekly_window_start: '2026-08-02T16:00:00Z',
    weekly_reset_at: '2026-08-09T16:00:00Z',
  },
  managers: [],
  members: [
    { user_id: 11, email: 'alice@example.com', username: 'Alice', status: 'active', weekly_limit_usd: 300, weekly_usage_usd: 120 },
  ],
  allocated_usd: 300,
  can_manage: true,
  can_configure: true,
  team_subscription_groups: [
    { billing_group_id: 31, name: 'OpenAI Team', platform: 'openai', status: 'active' },
  ],
  available_team_subscription_groups: [
    { billing_group_id: 31, name: 'OpenAI Team', platform: 'openai', status: 'active' },
  ],
}

const rankingMembers = [
  { user_id: 11, email: 'alice@example.com', username: 'Alice', status: 'active', joined_at: '2026-08-01T00:00:00Z' },
  { user_id: 12, email: 'bob@example.com', username: 'Bob', status: 'active', joined_at: '2026-08-01T00:00:00Z' },
  { user_id: 13, email: 'carol@example.com', username: 'Carol', status: 'active', joined_at: '2026-08-01T00:00:00Z' },
]

const rankingQuotaMembers = [
  { user_id: 11, email: 'alice@example.com', username: 'Alice', status: 'active', weekly_limit_usd: 100, weekly_usage_usd: 40 },
  { user_id: 12, email: 'bob@example.com', username: 'Bob', status: 'active', weekly_limit_usd: 300, weekly_usage_usd: 90 },
  { user_id: 13, email: 'carol@example.com', username: 'Carol', status: 'active', weekly_limit_usd: 75, weekly_usage_usd: 60 },
]

function mountView() {
  return mount(UserGroupMembersView, {
    global: {
      stubs: {
        AppLayout: { template: '<main><slot /></main>' },
        UserGroupDetailShell: { template: '<section><slot name="actions" /><slot /></section>' },
        Icon: true,
        UserGroupEditorDialog: true,
        UserGroupPeopleDialog: {
          props: ['show'],
          emits: ['save', 'close'],
          template: '<button v-if="show" data-test="save-people-stub" @click="$emit(\'save\', [11])">save people</button>',
        },
        UserGroupPromptSettingsDialog: true,
        TeamQuotaSettingsDialog: {
          props: ['show'],
          emits: ['close', 'save', 'manage', 'reset'],
          template: '<div v-if="show" data-test="quota-settings-stub"><button data-test="close-policy-stub" @click="$emit(\'close\')">close</button><button data-test="save-policy-stub" @click="$emit(\'save\', { enabled: true, weeklyLimit: 900, teamSubscriptionIds: [31] })">save policy</button></div>',
        },
        ConfirmDialog: true,
      },
    },
  })
}

function renderedMemberIds(wrapper: ReturnType<typeof mountView>) {
  return wrapper.findAll('[data-test^="team-member-"]').map(row => Number(row.attributes('data-test').replace('team-member-', '')))
}

describe('UserGroupMembersView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.canManage = true
    mocks.list.mockResolvedValue([group])
    mocks.getMembers.mockResolvedValue([member])
    mocks.getViewers.mockResolvedValue([])
    mocks.getPromptViewers.mockResolvedValue([])
    mocks.replaceMembers.mockResolvedValue(undefined)
    mocks.getQuotaOverview.mockResolvedValue(overview)
    mocks.updateMemberQuotas.mockResolvedValue(undefined)
    mocks.replaceTeamSubscriptionGroups.mockResolvedValue(undefined)
    mocks.setQuotaPolicy.mockResolvedValue(undefined)
    route.query = {}
  })

  it('loads the selected team and renders its member roster', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(mocks.getMembers).toHaveBeenCalledWith(7)
    expect(wrapper.text()).toContain('Alice')
    expect(wrapper.get('[data-test="team-quota-summary"]').text()).toContain('$800.00')
    expect(wrapper.get('[data-test="team-member-11"]').text()).toContain('$120.00')
    expect(wrapper.get('[data-test="team-member-11"]').text()).toContain('40%')
    expect(wrapper.text()).toContain('OpenAI Team')
    expect(wrapper.get('[data-test="manage-members"]').exists()).toBe(true)
  })

  it('sorts by actual weekly usage descending by default', async () => {
    mocks.getMembers.mockResolvedValue(rankingMembers)
    mocks.getQuotaOverview.mockResolvedValue({ ...overview, members: rankingQuotaMembers })
    const wrapper = mountView()
    await flushPromises()

    expect(renderedMemberIds(wrapper)).toEqual([12, 13, 11])
    expect(wrapper.get('[data-test="usage-sort-actual"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-test="usage-sort-utilization"]').attributes('aria-pressed')).toBe('false')
  })

  it('switches to saved quota utilization without draft-driven row movement', async () => {
    mocks.getMembers.mockResolvedValue(rankingMembers)
    mocks.getQuotaOverview.mockResolvedValue({ ...overview, members: rankingQuotaMembers })
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-test="usage-sort-utilization"]').trigger('click')

    expect(renderedMemberIds(wrapper)).toEqual([13, 11, 12])
    expect(wrapper.get('[data-test="usage-sort-actual"]').attributes('aria-pressed')).toBe('false')
    expect(wrapper.get('[data-test="usage-sort-utilization"]').attributes('aria-pressed')).toBe('true')

    await wrapper.get('[data-test="member-quota-11"]').setValue('1000')

    expect(renderedMemberIds(wrapper)).toEqual([13, 11, 12])
  })

  it('saves member allocations from the combined workspace', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-test="member-quota-11"]').setValue('350')
    await wrapper.get('[data-test="save-member-quotas"]').trigger('click')
    await flushPromises()

    expect(mocks.updateMemberQuotas).toHaveBeenCalledWith(7, [
      { user_id: 11, weekly_limit_usd: 350 },
    ])
    expect(mocks.success).toHaveBeenCalledWith('userGroups.quotas.allocationsSaved')
  })

  it('opens quota settings for legacy quota links', async () => {
    route.query = { openQuota: '1' }
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('[data-test="quota-settings-stub"]').exists()).toBe(true)

    await wrapper.get('[data-test="close-policy-stub"]').trigger('click')
    await wrapper.get('[data-test="refresh-team-workspace"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="quota-settings-stub"]').exists()).toBe(false)
  })

  it('lets administrators update members from the detail page', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-test="manage-members"]').trigger('click')
    await wrapper.get('[data-test="save-people-stub"]').trigger('click')
    await flushPromises()

    expect(mocks.replaceMembers).toHaveBeenCalledWith(7, [11])
    expect(mocks.success).toHaveBeenCalledWith('userGroups.groups.peopleSaved')
  })

  it('keeps management controls hidden for delegated viewers', async () => {
    mocks.canManage = false
    mocks.getQuotaOverview.mockResolvedValue({ ...overview, can_manage: false, can_configure: false })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-test="manage-members"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="edit-group"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="save-member-quotas"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Alice')
  })

  it('lets delegated quota managers allocate members without team administration controls', async () => {
    mocks.canManage = false
    mocks.getQuotaOverview.mockResolvedValue({ ...overview, can_manage: true, can_configure: false })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-test="manage-members"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="open-quota-settings"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="save-member-quotas"]').exists()).toBe(true)
  })
})
