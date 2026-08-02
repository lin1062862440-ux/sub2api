import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  update: vi.fn(),
  test: vi.fn(),
  recover: vi.fn(),
  setSchedulable: vi.fn(),
  getModels: vi.fn(),
  getUsage: vi.fn(),
}))

vi.mock('@/api/admin/accounts', () => ({
  listAdminAccounts: mocks.list,
  updateAdminAccount: mocks.update,
  testAdminAccount: mocks.test,
  recoverAdminAccount: mocks.recover,
  setAdminAccountSchedulable: mocks.setSchedulable,
  getAdminAccountModels: mocks.getModels,
  getAdminAccountUsage: mocks.getUsage,
}))

import AdminAccountsView from './AdminAccountsView.vue'

const healthyAccount = {
  id: 1,
  name: 'Claude 主池',
  platform: 'anthropic',
  type: 'apikey',
  proxy_id: null,
  concurrency: 10,
  current_concurrency: 3,
  priority: 10,
  status: 'active',
  error_message: null,
  schedulable: true,
  last_used_at: '2026-08-02T07:50:00Z',
  expires_at: null,
  rate_limited_at: null,
  rate_limit_reset_at: null,
  overload_until: null,
  temp_unschedulable_until: null,
  temp_unschedulable_reason: null,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-08-02T07:50:00Z',
  groups: [{ id: 1, name: 'Claude Code' }],
}

const errorAccount = {
  ...healthyAccount,
  id: 2,
  name: 'Codex 备用',
  platform: 'openai',
  concurrency: 5,
  current_concurrency: 0,
  status: 'error',
  schedulable: false,
  error_message: 'refresh token expired',
  groups: [{ id: 2, name: 'Codex' }],
}

function arrangeSuccess() {
  mocks.list.mockResolvedValue({ items: [healthyAccount, errorAccount], total: 2, page: 1, page_size: 20 })
  mocks.update.mockImplementation((id: number, update: object) => Promise.resolve({ ...(id === 1 ? healthyAccount : errorAccount), ...update }))
  mocks.test.mockResolvedValue({ success: true, message: '连接正常', latency_ms: 420 })
  mocks.recover.mockResolvedValue({ ...errorAccount, status: 'active', schedulable: true, error_message: null })
  mocks.setSchedulable.mockImplementation((id: number, schedulable: boolean) => Promise.resolve({ ...(id === 1 ? healthyAccount : errorAccount), schedulable }))
  mocks.getModels.mockResolvedValue([
    { id: 'claude-sonnet-4-5', display_name: 'Claude Sonnet 4.5' },
    { id: 'claude-opus-4-1', display_name: 'Claude Opus 4.1' },
  ])
  mocks.getUsage.mockImplementation((id: number) => Promise.resolve(id === 1 ? {
    updated_at: '2026-08-02T07:58:00Z',
    five_hour: { utilization: 38, resets_at: '2026-08-02T10:00:00Z', remaining_seconds: 7200 },
    seven_day: { utilization: 64, resets_at: '2026-08-07T00:00:00Z', remaining_seconds: 360000 },
    seven_day_sonnet: null,
  } : {
    updated_at: null,
    five_hour: null,
    seven_day: null,
    seven_day_sonnet: null,
  }))
}

describe('AdminAccountsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    arrangeSuccess()
  })

  it('renders account cards with health, scheduling and usage progress', async () => {
    const wrapper = mount(AdminAccountsView)
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('账号管理')
    expect(wrapper.get('[data-testid="account-total"]').text()).toContain('2')
    expect(wrapper.get('[data-testid="account-normal"]').text()).toContain('1')
    expect(wrapper.get('[data-testid="account-attention"]').text()).toContain('1')
    expect(wrapper.text()).toContain('Claude 主池')
    expect(wrapper.text()).toContain('Claude Code')
    expect(wrapper.text()).toContain('3 / 10')
    expect(wrapper.text()).toContain('refresh token expired')
    expect(wrapper.findAll('[data-testid="account-card"]')).toHaveLength(2)
    expect(wrapper.get('[data-testid="account-usage-1"]').text()).toContain('5 小时')
    expect(wrapper.get('[data-testid="account-usage-1"]').text()).toContain('38%')
    expect(wrapper.get('[data-testid="account-usage-1"]').text()).toContain('7 天')
    expect(wrapper.get('[data-testid="account-usage-1"]').text()).toContain('64%')
    expect(wrapper.find('[data-testid="create-account"]').exists()).toBe(false)
    expect(wrapper.find('[title="编辑账号"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('高级管理')
    expect(mocks.getUsage).toHaveBeenCalledTimes(2)
  })

  it('reloads the list with search and platform filters', async () => {
    const wrapper = mount(AdminAccountsView)
    await flushPromises()

    await wrapper.get('[data-testid="account-search"]').setValue('Claude')
    await wrapper.get('[data-testid="account-platform-filter"]').setValue('anthropic')
    await wrapper.get('[data-testid="account-filters"]').trigger('submit')
    await flushPromises()

    expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({
      page: 1,
      page_size: 20,
      search: 'Claude',
      platform: 'anthropic',
    }))
  })

  it('opens a model selector before running a connection test', async () => {
    const wrapper = mount(AdminAccountsView)
    await flushPromises()

    await wrapper.get('[data-testid="test-account-1"]').trigger('click')
    await flushPromises()
    expect(mocks.getModels).toHaveBeenCalledWith(1)
    expect(mocks.test).not.toHaveBeenCalled()

    const dialog = wrapper.get('[data-testid="account-test-dialog"]')
    expect(dialog.text()).toContain('Claude 主池')
    expect(dialog.text()).toContain('Claude Sonnet 4.5')
    await dialog.get('[data-testid="account-test-model"]').setValue('claude-opus-4-1')
    await dialog.get('[data-testid="account-test-submit"]').trigger('click')
    await flushPromises()

    expect(mocks.test).toHaveBeenCalledWith(1, {
      model_id: 'claude-opus-4-1',
      prompt: '',
    })
    expect(wrapper.get('[data-testid="action-message"]').text()).toContain('连接正常')
  })

  it('links scheduling and account status through one control', async () => {
    const wrapper = mount(AdminAccountsView)
    await flushPromises()

    await wrapper.get('[data-testid="account-enabled-1"]').trigger('click')
    await flushPromises()
    expect(mocks.setSchedulable).toHaveBeenCalledWith(1, false)
    expect(mocks.update).toHaveBeenCalledWith(1, { status: 'inactive' })

    await wrapper.get('[data-testid="account-enabled-2"]').trigger('click')
    await flushPromises()
    expect(mocks.update).toHaveBeenCalledWith(2, { status: 'active' })
    expect(mocks.setSchedulable).toHaveBeenCalledWith(2, true)
  })

  it('recovers an unhealthy account and refreshes its usage', async () => {
    const wrapper = mount(AdminAccountsView)
    await flushPromises()

    await wrapper.get('[data-testid="recover-account-2"]').trigger('click')
    await flushPromises()
    expect(mocks.recover).toHaveBeenCalledWith(2)
    expect(mocks.getUsage).toHaveBeenCalledWith(2, { force: true })
  })

  it('preserves loading, empty, and retryable error states', async () => {
    mocks.list.mockRejectedValueOnce(new Error('offline'))
    const wrapper = mount(AdminAccountsView)

    expect(wrapper.find('[aria-label="正在加载账号"]').exists()).toBe(true)
    await flushPromises()
    expect(wrapper.text()).toContain('账号列表加载失败')
    expect(wrapper.text()).toContain('offline')

    await wrapper.get('.table-error button').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenCalledTimes(2)

    mocks.list.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 20 })
    await wrapper.get('.icon-button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('没有符合条件的账号')
  })
})
