import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import UserGroupUsageView from '../UserGroupUsageView.vue'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  getMembers: vi.fn(),
  getUsage: vi.fn(),
  getUsagePrompts: vi.fn(),
  route: { name: 'UserGroupUsage', params: { id: '7' } as Record<string, string> },
}))

vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'en-US' } }),
  createI18n: () => ({ global: { t: (key: string) => key, locale: { value: 'en-US' } } }),
}))

vi.mock('@/api/userGroups', () => ({
  userGroupAPI: { list: mocks.list, getMembers: mocks.getMembers, getUsage: mocks.getUsage, getUsagePrompts: mocks.getUsagePrompts },
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ canManageUserGroups: false }),
}))

const groups = [
  { id: 7, name: '研发一组', description: '', status: 'active', member_count: 2, viewer_count: 1, can_view_prompt: true, created_at: '', updated_at: '' },
  { id: 8, name: '运营组', description: '', status: 'active', member_count: 1, viewer_count: 0, can_view_prompt: false, created_at: '', updated_at: '' },
]
const members = [
  { user_id: 11, email: 'alice@example.com', username: 'Alice', status: 'active', joined_at: '' },
  { user_id: 12, email: 'bob@example.com', username: 'Bob', status: 'active', joined_at: '' },
]
const usageResult = {
  summary: {
    total_requests: 8,
    total_input_tokens: 1000,
    total_output_tokens: 500,
    total_cache_tokens: 250,
    total_tokens: 1750,
    total_actual_cost: 13.25,
  },
  by_user: [
    { user_id: 11, email: 'alice@example.com', username: 'Alice', total_requests: 8, total_tokens: 1750, total_actual_cost: 13.25 },
  ],
  items: [
    { id: 1, user_id: 11, email: 'alice@example.com', username: 'Alice', request_id: 'req-safe-1', model: 'claude-sonnet-4', input_tokens: 1000, output_tokens: 500, cache_creation_tokens: 100, cache_read_tokens: 150, total_tokens: 1750, actual_cost: 13.25, prompt_available: true, created_at: '2026-08-02T08:00:00Z' },
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
        UserGroupDetailShell: { template: '<section><slot name="actions" /><slot /></section>' },
        Icon: { template: '<i />' },
        Teleport: true,
        RouterLink: {
          props: ['to'],
          template: '<a><slot /></a>',
        },
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
    mocks.route.params = { id: '7' }
    mocks.list.mockResolvedValue(groups)
    mocks.getMembers.mockResolvedValue(members)
    mocks.getUsage.mockResolvedValue(usageResult)
    mocks.getUsagePrompts.mockResolvedValue([{
      id: 91,
      request_id: 'req-safe-1',
      protocol: 'anthropic_messages',
      model: 'claude-sonnet-4',
      stage: 'http',
      redacted_prompt: 'Please review [REDACTED_EMAIL]',
      prompt_length: 30,
      truncated: true,
      captured_at: '2026-08-02T08:00:00Z',
      expires_at: '2026-08-16T08:00:00Z',
    }])
  })

  afterEach(() => vi.useRealTimers())

  it('uses a seven-day local range and opens on the member summary', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(mocks.getUsage).toHaveBeenCalledWith(7, expect.objectContaining({
      start_date: '2026-07-27',
      end_date: '2026-08-02',
      page: 1,
      page_size: 20,
    }))
    expect(wrapper.get('[data-test="input-tokens"]').text()).toContain('1,000')
    expect(wrapper.get('[data-test="output-tokens"]').text()).toContain('500')
    expect(wrapper.text()).toContain('Alice')
    expect(wrapper.get('[data-test="usage-member-table"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="usage-detail-table"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="usage-summary-band"]').classes()).toContain('xl:grid-cols-5')
  })

  it('applies member and model filters and paginates details', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('[data-test="advanced-usage-filters"]').exists()).toBe(false)
    await wrapper.get('[data-test="toggle-usage-filters"]').trigger('click')
    expect(wrapper.get('[data-test="advanced-usage-filters"]').exists()).toBe(true)

    await wrapper.get('[data-test="member-filter"]').setValue('11')
    await wrapper.get('[data-test="model-filter"]').setValue('gpt-5')
    await wrapper.get('[data-test="apply-usage-filters"]').trigger('click')
    await flushPromises()

    expect(mocks.getUsage).toHaveBeenLastCalledWith(7, expect.objectContaining({ user_id: 11, model: 'gpt-5', page: 1 }))
    expect(mocks.getUsage).not.toHaveBeenLastCalledWith(7, expect.objectContaining({ billing_type: expect.anything() }))

    await wrapper.get('[data-test="usage-view-details"]').trigger('click')
    await wrapper.get('[data-test="next-page"]').trigger('click')
    await flushPromises()
    expect(mocks.getUsage).toHaveBeenLastCalledWith(7, expect.objectContaining({ page: 2 }))
  })

  it('switches between member and detail results without requesting usage again', async () => {
    const wrapper = mountView()
    await flushPromises()

    const requestCount = mocks.getUsage.mock.calls.length
    await wrapper.get('[data-test="usage-view-details"]').trigger('click')

    expect(wrapper.get('[data-test="usage-detail-table"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('claude-sonnet-4')
    expect(wrapper.text()).toContain('req-safe-1')
    expect(mocks.getUsage).toHaveBeenCalledTimes(requestCount)
  })

  it('shows and loads prompt details only for authorized available rows', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-test="usage-view-details"]').trigger('click')

    await wrapper.get('[data-test="prompt-details-1"]').trigger('click')
    await flushPromises()

    expect(mocks.getUsagePrompts).toHaveBeenCalledWith(7, 1)
    expect(wrapper.text()).toContain('Please review [REDACTED_EMAIL]')
    expect(wrapper.text()).toContain('userGroups.usage.promptTruncated')
  })

  it('hides prompt controls when permission or capture availability is absent', async () => {
    mocks.list.mockResolvedValue([{ ...groups[0], can_view_prompt: false }])
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-test="usage-view-details"]').trigger('click')

    expect(wrapper.find('[data-test="prompt-details-1"]').exists()).toBe(false)
  })

  it('uses the team id from the detail route without rendering a group selector', async () => {
    mocks.route.params = { id: '8' }
    const wrapper = mountView()
    await flushPromises()

    expect(mocks.getUsage).toHaveBeenCalledWith(8, expect.any(Object))
    expect(wrapper.find('[data-test="group-select"]').exists()).toBe(false)
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

  it('keeps advanced filters in a responsive inline row', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-test="toggle-usage-filters"]').trigger('click')
    const classes = wrapper.get('[data-test="advanced-usage-filters"]').classes()
    expect(classes).toContain('sm:grid-cols-2')
    expect(classes.some(className => className.startsWith('sm:grid-cols-'))).toBe(true)
  })

  it('keeps usage rows stacked until their fixed columns fit the content area', async () => {
    const wrapper = mountView()
    await flushPromises()

    const responsiveClasses = wrapper.findAll('[class]').flatMap(element => element.classes())
    const memberLayoutClasses = responsiveClasses.filter(className => className.includes('grid-cols-[minmax(180px'))
    expect(memberLayoutClasses.length).toBeGreaterThan(0)
    expect(memberLayoutClasses.some(className => className.startsWith('xl:'))).toBe(true)
    expect(memberLayoutClasses.some(className => /^(md|lg):/.test(className))).toBe(false)
  })
})
