import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  groups: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  balance: vi.fn(),
  replaceGroup: vi.fn(),
  bindIdentity: vi.fn(),
  keys: vi.fn(),
  usage: vi.fn(),
  history: vi.fn(),
  quotas: vi.fn(),
  updateQuotas: vi.fn(),
  resetQuota: vi.fn(),
}))

vi.mock('@/api/admin/users', () => ({
  listAdminUsers: mocks.list,
  getAdminUser: mocks.get,
  getAdminGroups: mocks.groups,
  createAdminUser: mocks.create,
  updateAdminUser: mocks.update,
  deleteAdminUser: mocks.remove,
  updateAdminUserBalance: mocks.balance,
  replaceAdminUserGroup: mocks.replaceGroup,
  bindAdminUserIdentity: mocks.bindIdentity,
  getAdminUserApiKeys: mocks.keys,
  getAdminUserUsage: mocks.usage,
  getAdminUserBalanceHistory: mocks.history,
  getAdminUserPlatformQuotas: mocks.quotas,
  updateAdminUserPlatformQuotas: mocks.updateQuotas,
  resetAdminUserPlatformQuota: mocks.resetQuota,
}))

import AdminUsersView from './AdminUsersView.vue'

const user = {
  id: 7,
  username: 'Lin',
  email: 'lin@example.com',
  role: 'user',
  balance: 32.5,
  frozen_balance: 2,
  concurrency: 8,
  current_concurrency: 2,
  rpm_limit: 60,
  status: 'active',
  allowed_groups: [1],
  group_rates: {},
  notes: '主账号',
  last_active_at: '2026-08-02T08:00:00Z',
  last_used_at: '2026-08-02T08:00:00Z',
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-08-02T08:00:00Z',
  subscriptions: [{ id: 3, status: 'active', group_id: 1, expires_at: null }],
}

const disabledUser = { ...user, id: 8, username: 'Disabled', email: 'disabled@example.com', status: 'disabled', current_concurrency: 0, balance: 0, subscriptions: [] }

function arrangeSuccess() {
  mocks.list.mockResolvedValue({ items: [user, disabledUser], total: 2, page: 1, page_size: 20 })
  mocks.get.mockResolvedValue(user)
  mocks.groups.mockResolvedValue([{ id: 1, name: 'Claude Code', platform: 'anthropic', is_exclusive: true }])
  mocks.create.mockResolvedValue({ ...user, id: 9 })
  mocks.update.mockImplementation((_id: number, update: object) => Promise.resolve({ ...user, ...update }))
  mocks.remove.mockResolvedValue({ message: 'deleted' })
  mocks.balance.mockResolvedValue({ ...user, balance: 52.5 })
  mocks.replaceGroup.mockResolvedValue({ migrated_keys: 1 })
  mocks.bindIdentity.mockResolvedValue({ provider_type: 'oidc', provider_subject: 'subject-1' })
  mocks.keys.mockResolvedValue({ items: [{ id: 11, name: 'Desktop Key', status: 'active', quota: 0, quota_used: 8 }], total: 1, page: 1, page_size: 20 })
  mocks.usage.mockResolvedValue({ total_requests: 2400, total_tokens: 880000, total_cost: 24.8 })
  mocks.history.mockResolvedValue({ items: [{ id: 1, type: 'admin_balance', value: 20, status: 'used', created_at: '2026-08-01T00:00:00Z', notes: 'manual' }], total: 1, page: 1, page_size: 20, total_recharged: 20 })
  mocks.quotas.mockResolvedValue({ platform_quotas: [{ platform: 'anthropic', daily_limit_usd: 10, weekly_limit_usd: null, monthly_limit_usd: null, daily_usage_usd: 4, weekly_usage_usd: 12, monthly_usage_usd: 20 }] })
  mocks.updateQuotas.mockResolvedValue({ platform_quotas: [] })
  mocks.resetQuota.mockResolvedValue({ platform_quotas: [] })
}

describe('AdminUsersView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    arrangeSuccess()
  })

  it('renders readable user operations and subscription context', async () => {
    const wrapper = mount(AdminUsersView)
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('用户管理')
    expect(wrapper.get('[data-testid="user-total"]').text()).toContain('2')
    expect(wrapper.get('[data-testid="user-active"]').text()).toContain('1')
    expect(wrapper.text()).toContain('lin@example.com')
    expect(wrapper.text()).toContain('$32.50')
    expect(wrapper.text()).toContain('2 / 8')
    expect(wrapper.text()).toContain('有效订阅')
  })

  it('filters users and toggles status without clearing the list', async () => {
    const wrapper = mount(AdminUsersView)
    await flushPromises()

    await wrapper.get('[data-testid="user-search"]').setValue('lin@example.com')
    await wrapper.get('[data-testid="user-status-filter"]').setValue('active')
    await wrapper.get('[data-testid="user-filters"]').trigger('submit')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'lin@example.com', status: 'active' }))

    await wrapper.get('[data-testid="toggle-user-7"]').trigger('click')
    await flushPromises()
    expect(mocks.update).toHaveBeenCalledWith(7, { status: 'disabled' })
  })

  it('opens a detail workspace with keys, usage, balance history and quotas', async () => {
    const wrapper = mount(AdminUsersView)
    await flushPromises()

    await wrapper.get('[data-testid="user-name-7"]').trigger('click')
    await flushPromises()

    const detail = wrapper.get('[data-testid="user-detail"]')
    expect(detail.text()).toContain('2,400')
    expect(detail.text()).toContain('Desktop Key')
    expect(detail.text()).toContain('manual')
    expect(detail.text()).toContain('Anthropic')
  })

  it('adjusts balance through an explicit operation', async () => {
    const wrapper = mount(AdminUsersView)
    await flushPromises()
    await wrapper.get('[data-testid="balance-user-7"]').trigger('click')

    await wrapper.get('[data-testid="balance-amount"]').setValue('20')
    await wrapper.get('[data-testid="balance-form"]').trigger('submit')
    await flushPromises()

    expect(mocks.balance).toHaveBeenCalledWith(7, { balance: 20, operation: 'add', notes: '' })
  })

  it('updates group access through a dedicated row action', async () => {
    mocks.groups.mockResolvedValue([
      { id: 1, name: 'Claude Code', platform: 'anthropic', is_exclusive: true },
      { id: 2, name: 'Codex Pro', platform: 'openai', is_exclusive: true },
      { id: 3, name: '公共通道', platform: 'openai', is_exclusive: false },
    ])
    const wrapper = mount(AdminUsersView)
    await flushPromises()

    await wrapper.get('[data-testid="groups-user-7"]').trigger('click')
    expect(wrapper.get('[data-testid="user-groups-dialog"]').text()).toContain('Codex Pro')
    await wrapper.get('[data-testid="user-group-2"]').trigger('click')
    await wrapper.get('[data-testid="user-groups-submit"]').trigger('click')
    await flushPromises()

    expect(mocks.update).toHaveBeenCalledWith(7, {
      allowed_groups: [1, 2],
    })
  })

  it('requires the exact username or email before deleting a user', async () => {
    const wrapper = mount(AdminUsersView)
    await flushPromises()

    await wrapper.get('[data-testid="delete-user-7"]').trigger('click')
    expect(wrapper.get('[data-testid="confirm-delete-user"]').attributes('disabled')).toBeDefined()

    await wrapper.get('[data-testid="delete-user-identity"]').setValue('Lin')
    await wrapper.get('[data-testid="confirm-delete-user"]').trigger('click')
    await flushPromises()

    expect(mocks.remove).toHaveBeenCalledWith(7)
  })

  it('creates a user with common limits and selected groups', async () => {
    const wrapper = mount(AdminUsersView)
    await flushPromises()

    await wrapper.get('[data-testid="create-user"]').trigger('click')
    await wrapper.get('[data-testid="user-editor-email"]').setValue('new@example.com')
    await wrapper.get('[data-testid="user-editor-password"]').setValue('password')
    await wrapper.get('[data-testid="user-editor-submit"]').trigger('submit')
    await flushPromises()

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      email: 'new@example.com',
      password: 'password',
      role: 'user',
      concurrency: 5,
    }))
    expect(mocks.create.mock.calls[0]![0]).not.toHaveProperty('balance')
    expect(mocks.create.mock.calls[0]![0]).not.toHaveProperty('allowed_groups')
  })

  it('supports direct page navigation and changing page size', async () => {
    mocks.list.mockResolvedValue({ items: [user, disabledUser], total: 95, page: 1, page_size: 20 })
    const wrapper = mount(AdminUsersView)
    await flushPromises()

    await wrapper.get('[data-testid="user-page-3"]').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3, page_size: 20 }))

    await wrapper.get('[data-testid="user-page-size"]').setValue('50')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, page_size: 50 }))
  })

  it('preserves loading, empty, and retryable error states', async () => {
    mocks.list.mockRejectedValueOnce(new Error('offline'))
    const wrapper = mount(AdminUsersView)

    expect(wrapper.find('.loading').exists()).toBe(true)
    await flushPromises()
    expect(wrapper.text()).toContain('用户列表加载失败')
    expect(wrapper.text()).toContain('offline')

    await wrapper.get('.empty button').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenCalledTimes(2)

    mocks.list.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 20 })
    await wrapper.get('.refresh').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('没有符合条件的用户')
  })
})
