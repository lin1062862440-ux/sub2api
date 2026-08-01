import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import UserGroupSubscriptionsView from '../UserGroupSubscriptionsView.vue'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  getSubscriptions: vi.fn(),
  error: vi.fn(),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'en-US' } }),
  createI18n: () => ({ global: { t: (key: string) => key, locale: { value: 'en-US' } } }),
}))

vi.mock('@/api/userGroups', () => ({
  userGroupAPI: { list: mocks.list, getSubscriptions: mocks.getSubscriptions },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ canManageUserGroups: false }),
}))

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({ showError: mocks.error }),
}))

const groups = [
  { id: 7, name: '研发一组', description: '', status: 'active', member_count: 2, viewer_count: 1, created_at: '', updated_at: '' },
  { id: 8, name: '运营组', description: '', status: 'active', member_count: 3, viewer_count: 1, created_at: '', updated_at: '' },
]

const result = {
  summary: {
    member_count: 2,
    active_subscription_count: 1,
    no_subscription_count: 1,
    total_balance: 42.5,
    active_subscription_usage: 12,
  },
  items: [
    {
      member: { user_id: 11, email: 'alice@example.com', username: 'Alice', status: 'active', balance: 30, joined_at: '' },
      subscription_id: 101,
      billing_group_id: 3,
      billing_group: 'Claude Team',
      platform: 'anthropic',
      status: 'active',
      starts_at: '2026-08-01T00:00:00Z',
      expires_at: '2026-09-01T00:00:00Z',
      daily_used: 5,
      daily_limit: 10,
      weekly_used: 20,
      weekly_limit: 50,
      monthly_used: 40,
      monthly_limit: 100,
    },
    {
      member: { user_id: 12, email: 'bob@example.com', username: 'Bob', status: 'active', balance: 12.5, joined_at: '' },
      subscription_id: null,
      billing_group_id: null,
      billing_group: '',
      platform: '',
      status: '',
      daily_used: 0,
      daily_limit: null,
      weekly_used: 0,
      weekly_limit: null,
      monthly_used: 0,
      monthly_limit: null,
    },
  ],
  total: 2,
  page: 1,
  page_size: 20,
  pages: 1,
}

function mountView() {
  return mount(UserGroupSubscriptionsView, {
    global: {
      stubs: {
        AppLayout: { template: '<main><slot /></main>' },
        Icon: { template: '<i />' },
        Pagination: {
          props: ['page', 'total', 'pageSize'],
          emits: ['update:page'],
          template: '<button data-test="next-page" @click="$emit(\'update:page\', 2)">next</button>',
        },
      },
    },
  })
}

describe('UserGroupSubscriptionsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.list.mockResolvedValue(groups)
    mocks.getSubscriptions.mockResolvedValue(result)
  })

  it('renders summary, subscription quota bars, and members without subscriptions', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(mocks.getSubscriptions).toHaveBeenCalledWith(7, { status: undefined, page: 1, page_size: 20 })
    expect(wrapper.text()).toContain('Alice')
    expect(wrapper.text()).toContain('Claude Team')
    expect(wrapper.text()).toContain('Bob')
    expect(wrapper.text()).toContain('userGroups.subscriptions.noSubscription')
    expect(wrapper.findAll('[data-test="quota-progress"]')).toHaveLength(3)
    expect(wrapper.text()).toContain('$42.50')
  })

  it('shows the effective status for each subscription row', async () => {
    const wrapper = mountView()
    await flushPromises()

    const status = wrapper.find('[data-test="subscription-status-101"]')
    expect(status.exists()).toBe(true)
    expect(status.text()).toBe('userGroups.groups.active')
  })

  it('uses the user-group locale for the expired subscription filter', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('userGroups.subscriptions.expired')
    expect(wrapper.text()).not.toContain('admin.subscriptions.expired')
  })

  it('keeps subscription rows stacked until the content area is wide enough', async () => {
    const wrapper = mountView()
    await flushPromises()

    const classes = wrapper.get('article').classes()
    expect(classes.some(className => className.startsWith('xl:grid-cols-'))).toBe(true)
    expect(classes.some(className => className.startsWith('md:grid-cols-'))).toBe(false)
  })

  it('reloads data when the selected group or page changes', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-test="group-select"]').setValue('8')
    await flushPromises()
    expect(mocks.getSubscriptions).toHaveBeenLastCalledWith(8, { status: undefined, page: 1, page_size: 20 })

    await wrapper.get('[data-test="next-page"]').trigger('click')
    await flushPromises()
    expect(mocks.getSubscriptions).toHaveBeenLastCalledWith(8, { status: undefined, page: 2, page_size: 20 })
  })

  it('retains the group selector and shows a focused error state', async () => {
    mocks.getSubscriptions.mockRejectedValueOnce(new Error('forbidden'))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('[data-test="group-select"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="subscription-error"]').text()).toContain('forbidden')
  })
})
