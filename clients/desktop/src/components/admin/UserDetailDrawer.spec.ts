import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminUser } from '@/api/admin/types'

const mocks = vi.hoisted(() => ({
  keys: vi.fn(),
  usage: vi.fn(),
  history: vi.fn(),
  quotas: vi.fn(),
  reset: vi.fn(),
  balance: vi.fn(),
  updateQuotas: vi.fn(),
  identity: vi.fn(),
}))

vi.mock('@/api/admin/users', () => ({
  getAdminUserApiKeys: mocks.keys,
  getAdminUserUsage: mocks.usage,
  getAdminUserBalanceHistory: mocks.history,
  getAdminUserPlatformQuotas: mocks.quotas,
  resetAdminUserPlatformQuota: mocks.reset,
  updateAdminUserBalance: mocks.balance,
  updateAdminUserPlatformQuotas: mocks.updateQuotas,
  bindAdminUserIdentity: mocks.identity,
}))

import UserDetailDrawer from './UserDetailDrawer.vue'

const user: AdminUser = {
  id: 7,
  username: 'Lin',
  email: 'lin@example.com',
  role: 'user',
  balance: 20,
  frozen_balance: 0,
  concurrency: 5,
  current_concurrency: 0,
  rpm_limit: 60,
  status: 'active',
  notes: '',
  allowed_groups: [],
  group_rates: {},
  created_at: '2026-08-02T00:00:00Z',
  updated_at: '2026-08-02T00:00:00Z',
}

describe('UserDetailDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.confirm = vi.fn(() => true)
    mocks.keys.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 })
    mocks.usage.mockResolvedValue({ total_requests: 0, total_tokens: 0, total_cost: 0 })
    mocks.history.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 })
    mocks.quotas.mockResolvedValue({
      platform_quotas: [{
        platform: 'anthropic',
        daily_limit_usd: 10,
        weekly_limit_usd: 50,
        monthly_limit_usd: 100,
        daily_usage_usd: 4,
        weekly_usage_usd: 12,
        monthly_usage_usd: 20,
      }],
    })
    mocks.reset.mockResolvedValue({ platform_quotas: [] })
  })

  it('requires confirmation before resetting a user platform quota', async () => {
    vi.mocked(window.confirm).mockReturnValueOnce(false).mockReturnValueOnce(true)
    const wrapper = mount(UserDetailDrawer, { props: { user } })
    await flushPromises()

    await wrapper.get('[data-testid="reset-quota-anthropic-daily"]').trigger('click')
    expect(mocks.reset).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="reset-quota-anthropic-daily"]').trigger('click')
    await flushPromises()
    expect(mocks.reset).toHaveBeenCalledWith(7, 'anthropic', 'daily')
  })

  it('supports resetting weekly and monthly quota windows', async () => {
    const wrapper = mount(UserDetailDrawer, { props: { user } })
    await flushPromises()

    await wrapper.get('[data-testid="reset-quota-anthropic-weekly"]').trigger('click')
    await flushPromises()
    expect(mocks.reset).toHaveBeenLastCalledWith(7, 'anthropic', 'weekly')

    mocks.quotas.mockResolvedValueOnce({ platform_quotas: [] })
    await wrapper.get('[data-testid="reset-quota-anthropic-monthly"]').trigger('click')
    await flushPromises()
    expect(mocks.reset).toHaveBeenLastCalledWith(7, 'anthropic', 'monthly')
  })
})
