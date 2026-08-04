import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  list: vi.fn(),
  getQuotaOverview: vi.fn(),
  setQuotaPolicy: vi.fn(),
  replaceQuotaManagers: vi.fn(),
  updateMemberQuotas: vi.fn(),
  replaceTeamSubscriptionGroups: vi.fn(),
  resetQuotaUsage: vi.fn(),
}))
const showSuccess = vi.hoisted(() => vi.fn())
const showError = vi.hoisted(() => vi.fn())

vi.mock('@/api/userGroups', () => ({ userGroupAPI: api }))
vi.mock('@/stores/app', () => ({ useAppStore: () => ({ showSuccess, showError }) }))
vi.mock('@/utils/avatar', () => ({ resolveAvatarUrl: () => '/avatar.png' }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ name: 'UserGroupPlanQuota', params: { id: '5' } }),
}))
vi.mock('vue-i18n', async (importOriginal) => ({
  ...await importOriginal<typeof import('vue-i18n')>(),
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'en-US' } }),
}))

import UserGroupQuotasView from '../UserGroupQuotasView.vue'

const group = {
  id: 5,
  name: 'Team A',
  description: '',
  status: 'active',
  member_count: 2,
  viewer_count: 1,
  can_view_prompt: false,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
}

const overview = {
  group_id: 5,
  policy: {
    enabled: true,
    weekly_limit_usd: 800,
    weekly_usage_usd: 250,
    weekly_window_start: '2026-08-02T16:00:00Z',
    weekly_reset_at: '2026-08-09T16:00:00Z',
  },
  managers: [],
  members: [
    { user_id: 7, email: 'lead@example.com', username: 'Lead', status: 'active', weekly_limit_usd: 300, weekly_usage_usd: 120 },
    { user_id: 9, email: 'dev@example.com', username: 'Dev', status: 'active', weekly_limit_usd: 200, weekly_usage_usd: 80 },
  ],
  allocated_usd: 500,
  can_manage: true,
  can_configure: true,
  team_subscription_groups: [
    { billing_group_id: 31, name: 'OpenAI Team', platform: 'openai', status: 'active' },
  ],
  available_team_subscription_groups: [
    { billing_group_id: 31, name: 'OpenAI Team', platform: 'openai', status: 'active' },
    { billing_group_id: 32, name: 'Claude Team', platform: 'anthropic', status: 'active' },
  ],
}

function mountView() {
  return mount(UserGroupQuotasView, {
    global: {
      stubs: {
        AppLayout: { template: '<div><slot /></div>' },
        UserGroupDetailShell: { template: '<div><slot name="actions" /><slot /></div>' },
        UserGroupPeopleDialog: true,
        ConfirmDialog: {
          props: ['show'],
          emits: ['confirm', 'cancel'],
          template: '<button v-if="show" data-test="confirm-reset" @click="$emit(\'confirm\')">confirm</button>',
        },
        Icon: true,
      },
    },
  })
}

describe('UserGroupQuotasView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.list.mockResolvedValue([group])
    api.getQuotaOverview.mockResolvedValue(overview)
    api.updateMemberQuotas.mockResolvedValue(undefined)
    api.replaceTeamSubscriptionGroups.mockResolvedValue(undefined)
    api.resetQuotaUsage.mockResolvedValue(undefined)
  })

  it('lets the system admin reset weekly team usage', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-test="reset-team-quota"]').trigger('click')
    await wrapper.get('[data-test="confirm-reset"]').trigger('click')
    await flushPromises()

    expect(api.resetQuotaUsage).toHaveBeenCalledWith(5)
    expect(showSuccess).toHaveBeenCalledWith('userGroups.quotas.resetSuccess')
  })

  it('hides quota configuration and reset controls from quota managers', async () => {
    api.getQuotaOverview.mockResolvedValue({
      ...overview,
      can_configure: false,
      available_team_subscription_groups: [],
    })

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-test="reset-team-quota"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="save-quota-policy"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="save-member-quotas"]').exists()).toBe(true)
  })

  it('loads quota state and saves a changed member allocation', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(api.getQuotaOverview).toHaveBeenCalledWith(5)
    expect(wrapper.get('[data-test="quota-summary"]').text()).toContain('$800.00')
    expect(wrapper.text()).toContain('OpenAI Team')

    await wrapper.get('[data-test="member-quota-7"]').setValue('350')
    await wrapper.get('[data-test="save-member-quotas"]').trigger('click')
    await flushPromises()

    expect(api.updateMemberQuotas).toHaveBeenCalledWith(5, [
      { user_id: 7, weekly_limit_usd: 350 },
      { user_id: 9, weekly_limit_usd: 200 },
    ])
    expect(showSuccess).toHaveBeenCalledWith('userGroups.quotas.allocationsSaved')
  })

  it('blocks saving allocations above the team limit', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-test="member-quota-7"]').setValue('700')
    expect(wrapper.get('[data-test="save-member-quotas"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('userGroups.quotas.overAllocated')
  })
})
