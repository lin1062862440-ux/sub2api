import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import UserGroupUsageView from '../UserGroupUsageView.vue'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  getMembers: vi.fn(),
  getUsage: vi.fn(),
  route: { query: { group_id: '7' } as Record<string, string> },
  replace: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ replace: mocks.replace }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'en-US' } }),
  createI18n: () => ({ global: { t: (key: string) => key, locale: { value: 'en-US' } } }),
}))

vi.mock('@/api/userGroups', () => ({
  userGroupAPI: { list: mocks.list, getMembers: mocks.getMembers, getUsage: mocks.getUsage },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ canManageUserGroups: false }),
}))

const groups = [
  { id: 7, name: '研发一组', description: '', status: 'active', member_count: 2, viewer_count: 1, created_at: '', updated_at: '' },
  { id: 8, name: '运营组', description: '', status: 'active', member_count: 1, viewer_count: 0, created_at: '', updated_at: '' },
]
const members = [
  { user_id: 11, email: 'alice@example.com', username: 'Alice', status: 'active', balance: 30, joined_at: '' },
  { user_id: 12, email: 'bob@example.com', username: 'Bob', status: 'active', balance: 12, joined_at: '' },
]
const usageResult = {
  summary: {
    total_requests: 8,
    total_input_tokens: 1000,
    total_output_tokens: 500,
    total_cache_tokens: 250,
    total_tokens: 1750,
    total_actual_cost: 13.25,
    balance_consumption: 3.25,
    subscription_consumption: 10,
  },
  by_user: [
    { user_id: 11, email: 'alice@example.com', username: 'Alice', total_requests: 8, total_tokens: 1750, total_actual_cost: 13.25, balance_consumption: 3.25, subscription_consumption: 10 },
  ],
  items: [
    { id: 1, user_id: 11, email: 'alice@example.com', username: 'Alice', request_id: 'req-safe-1', model: 'claude-sonnet-4', input_tokens: 1000, output_tokens: 500, cache_creation_tokens: 100, cache_read_tokens: 150, total_tokens: 1750, actual_cost: 13.25, billing_type: 1, created_at: '2026-08-02T08:00:00Z' },
  ],
  total: 1,
  page: 1,
  page_size: 20,
  pages: 1,
}

function mountView() {
  return mount(UserGroupUsageView, {
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

describe('UserGroupUsageView', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 2, 12, 0, 0))
    vi.clearAllMocks()
    mocks.route.query = { group_id: '7' }
    mocks.list.mockResolvedValue(groups)
    mocks.getMembers.mockResolvedValue(members)
    mocks.getUsage.mockResolvedValue(usageResult)
  })

  afterEach(() => vi.useRealTimers())

  it('uses a seven-day local range and renders split billing totals, member totals, and details', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(mocks.getUsage).toHaveBeenCalledWith(7, expect.objectContaining({
      start_date: '2026-07-27',
      end_date: '2026-08-02',
      page: 1,
      page_size: 20,
    }))
    expect(wrapper.get('[data-test="balance-consumption"]').text()).toContain('$3.25')
    expect(wrapper.get('[data-test="subscription-consumption"]').text()).toContain('$10.00')
    expect(wrapper.text()).toContain('Alice')
    expect(wrapper.text()).toContain('claude-sonnet-4')
    expect(wrapper.text()).toContain('req-safe-1')
  })

  it('applies member, model, and billing filters and paginates details', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-test="member-filter"]').setValue('11')
    await wrapper.get('[data-test="model-filter"]').setValue('gpt-5')
    await wrapper.get('[data-test="billing-filter"]').setValue('0')
    await wrapper.get('[data-test="apply-usage-filters"]').trigger('click')
    await flushPromises()

    expect(mocks.getUsage).toHaveBeenLastCalledWith(7, expect.objectContaining({ user_id: 11, model: 'gpt-5', billing_type: 0, page: 1 }))

    await wrapper.get('[data-test="next-page"]').trigger('click')
    await flushPromises()
    expect(mocks.getUsage).toHaveBeenLastCalledWith(7, expect.objectContaining({ page: 2 }))
  })

  it('uses the route group and updates the query when the group changes', async () => {
    mocks.route.query = { group_id: '8' }
    const wrapper = mountView()
    await flushPromises()
    expect(mocks.getUsage).toHaveBeenCalledWith(8, expect.any(Object))

    await wrapper.get('[data-test="group-select"]').setValue('7')
    await flushPromises()
    expect(mocks.replace).toHaveBeenCalledWith({ query: { group_id: '7' } })
    expect(mocks.getUsage).toHaveBeenLastCalledWith(7, expect.any(Object))
  })

  it('keeps filters visible when the usage result is empty', async () => {
    mocks.getUsage.mockResolvedValueOnce({
      ...usageResult,
      summary: { ...usageResult.summary, total_requests: 0, total_actual_cost: 0 },
      by_user: [],
      items: [],
      total: 0,
      pages: 0,
    })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('[data-test="apply-usage-filters"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('userGroups.usage.noUsage')
  })

  it('delays the six-column filter layout until the content area is wide enough', async () => {
    const wrapper = mountView()
    await flushPromises()

    const filterGrid = wrapper.get('[data-test="apply-usage-filters"]').element.parentElement
    const classes = String(filterGrid?.className).split(/\s+/)
    expect(classes.some(className => className.startsWith('2xl:grid-cols-'))).toBe(true)
    expect(classes.some(className => className.startsWith('xl:grid-cols-'))).toBe(false)
  })

  it('keeps usage rows stacked until their fixed columns fit the content area', async () => {
    const wrapper = mountView()
    await flushPromises()

    const responsiveClasses = wrapper.findAll('[class]').flatMap(element => element.classes())
    const memberLayoutClasses = responsiveClasses.filter(className => className.includes('grid-cols-[minmax(180px'))
    const detailLayoutClasses = responsiveClasses.filter(className => className.includes('grid-cols-[minmax(160px'))

    expect(memberLayoutClasses.length).toBeGreaterThan(0)
    expect(detailLayoutClasses.length).toBeGreaterThan(0)
    expect(memberLayoutClasses.some(className => className.startsWith('xl:'))).toBe(true)
    expect(detailLayoutClasses.some(className => className.startsWith('xl:'))).toBe(true)
    expect(memberLayoutClasses.some(className => /^(md|lg):/.test(className))).toBe(false)
    expect(detailLayoutClasses.some(className => /^(md|lg):/.test(className))).toBe(false)
  })
})
