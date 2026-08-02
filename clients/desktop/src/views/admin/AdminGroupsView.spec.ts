import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  status: vi.fn(),
}))

vi.mock('@/api/admin/groups', () => ({
  listAdminGroups: mocks.list,
  createAdminGroup: mocks.create,
  updateAdminGroup: mocks.update,
  updateAdminGroupStatus: mocks.status,
}))

import View from './AdminGroupsView.vue'

const group = {
  id: 8,
  name: 'Codex Team',
  description: 'OpenAI 团队订阅',
  platform: 'openai',
  rate_multiplier: 1.2,
  rpm_limit: 120,
  is_exclusive: true,
  status: 'active',
  subscription_type: 'subscription',
  daily_limit_usd: 10,
  weekly_limit_usd: 50,
  monthly_limit_usd: 200,
  account_count: 4,
  active_account_count: 3,
  sort_order: 1,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-02T00:00:00Z',
}

describe('AdminGroupsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.list.mockResolvedValue({ items: [group], total: 55, page: 1, page_size: 20 })
    mocks.create.mockResolvedValue(group)
    mocks.update.mockResolvedValue(group)
    mocks.status.mockResolvedValue({ ...group, status: 'inactive' })
  })

  it('renders group cards and filters the server-side result set', async () => {
    const wrapper = mount(View)
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('分组管理')
    expect(wrapper.text()).toContain('Codex Team')
    expect(wrapper.text()).toContain('OpenAI')
    expect(wrapper.text()).toContain('月额度')
    expect(wrapper.text()).toContain('$200.00')

    await wrapper.get('[data-testid="group-search"]').setValue('codex')
    await wrapper.get('[data-testid="group-platform-filter"]').setValue('openai')
    await wrapper.get('[data-testid="group-status-filter"]').setValue('active')
    await wrapper.get('[data-testid="group-filters"]').trigger('submit')
    await flushPromises()

    expect(mocks.list).toHaveBeenLastCalledWith({
      page: 1,
      page_size: 20,
      search: 'codex',
      platform: 'openai',
      status: 'active',
    })

    await wrapper.get('[data-testid="group-page-2"]').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
  })

  it('creates a group with the core billing and quota fields', async () => {
    const wrapper = mount(View)
    await flushPromises()

    await wrapper.get('[data-testid="create-group"]').trigger('click')
    await wrapper.get('[data-testid="group-name"]').setValue('Gemini 包月')
    await wrapper.get('[data-testid="group-description"]').setValue('Gemini 团队订阅')
    await wrapper.get('[data-testid="group-platform"]').setValue('gemini')
    await wrapper.get('[data-testid="group-rate-multiplier"]').setValue('1.5')
    await wrapper.get('[data-testid="group-rpm-limit"]').setValue('90')
    await wrapper.get('[data-testid="group-subscription-type"]').setValue('subscription')
    await wrapper.get('[data-testid="group-exclusive"]').setValue(true)
    await wrapper.get('[data-testid="group-daily-limit"]').setValue('12')
    await wrapper.get('[data-testid="group-weekly-limit"]').setValue('60')
    await wrapper.get('[data-testid="group-monthly-limit"]').setValue('240')
    await wrapper.get('[data-testid="group-editor"]').trigger('submit')
    await flushPromises()

    expect(mocks.create).toHaveBeenCalledWith({
      name: 'Gemini 包月',
      description: 'Gemini 团队订阅',
      platform: 'gemini',
      rate_multiplier: 1.5,
      rpm_limit: 90,
      is_exclusive: true,
      subscription_type: 'subscription',
      daily_limit_usd: 12,
      weekly_limit_usd: 60,
      monthly_limit_usd: 240,
    })
  })

  it('edits an existing group and keeps status changes behind confirmation', async () => {
    const wrapper = mount(View)
    await flushPromises()

    await wrapper.get('[data-testid="edit-group-8"]').trigger('click')
    expect(wrapper.get('[data-testid="group-name"]').element).toHaveProperty('value', 'Codex Team')
    await wrapper.get('[data-testid="group-name"]').setValue('Codex Pro')
    await wrapper.get('[data-testid="group-description"]').setValue('')
    await wrapper.get('[data-testid="group-editor"]').trigger('submit')
    await flushPromises()
    expect(mocks.update).toHaveBeenCalledWith(8, expect.objectContaining({
      name: 'Codex Pro',
      description: '',
      platform: 'openai',
      monthly_limit_usd: 200,
    }))

    await wrapper.get('[data-testid="toggle-group-8"]').trigger('click')
    expect(mocks.status).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="group-status-dialog"]').text()).toContain('停用分组')
    await wrapper.get('[data-testid="confirm-group-status"]').trigger('click')
    await flushPromises()
    expect(mocks.status).toHaveBeenCalledWith(8, 'inactive')
  })

  it('supports page sizes and retryable empty or error states', async () => {
    mocks.list.mockRejectedValueOnce(new Error('offline'))
    const wrapper = mount(View)
    expect(wrapper.find('.loading').exists()).toBe(true)
    await flushPromises()
    expect(wrapper.text()).toContain('分组列表加载失败')
    await wrapper.get('[data-testid="retry-groups"]').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenCalledTimes(2)

    await wrapper.get('[data-testid="group-page-size"]').setValue('50')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, page_size: 50 }))

    mocks.list.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 50 })
    await wrapper.get('[data-testid="refresh-groups"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('暂无分组')
  })
})
