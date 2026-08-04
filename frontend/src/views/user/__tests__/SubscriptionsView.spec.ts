import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getMySubscriptions = vi.hoisted(() => vi.fn())

vi.mock('@/api/subscriptions', () => ({
  default: { getMySubscriptions }
}))
vi.mock('@/stores/app', () => ({
  useAppStore: () => ({ cachedPublicSettings: null, showError: vi.fn() })
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() })
}))
vi.mock('vue-i18n', async (importOriginal) => ({
  ...await importOriginal<typeof import('vue-i18n')>(),
  useI18n: () => ({
    t: (key: string) => ({
      'userSubscriptions.teamWeeklyUsage': '本周已用 / 成员分配额度',
      'userSubscriptions.unlimited': '无限制'
    })[key] ?? key
  })
}))

import SubscriptionsView from '../SubscriptionsView.vue'

function mountView() {
  return mount(SubscriptionsView, {
    global: {
      stubs: {
        AppLayout: { template: '<div><slot /></div>' },
        ProductIcon: true
      }
    }
  })
}

describe('SubscriptionsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMySubscriptions.mockResolvedValue([{
      id: 11,
      user_id: 9,
      group_id: 31,
      status: 'active',
      starts_at: '2026-08-01T00:00:00Z',
      expires_at: '2026-09-01T00:00:00Z',
      daily_usage_usd: 0,
      weekly_usage_usd: 0,
      monthly_usage_usd: 0,
      daily_window_start: null,
      weekly_window_start: null,
      monthly_window_start: null,
      owner_user_group_id: 7,
      team_weekly_limit_usd: 300,
      team_weekly_usage_usd: 120.5,
      team_weekly_window_start: null,
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
      group: {
        id: 31,
        name: 'OpenAI Team',
        description: null,
        platform: 'openai',
        subscription_type: 'team_subscription',
        rate_multiplier: 1,
        daily_limit_usd: null,
        weekly_limit_usd: null,
        monthly_limit_usd: null
      }
    }])
  })

  it('shows the current member team usage and allocation', async () => {
    const wrapper = mountView()
    await flushPromises()

    const quota = wrapper.get('[data-test="team-weekly-quota"]')
    expect(quota.text()).toContain('本周已用 / 成员分配额度')
    expect(quota.text()).toContain('$120.50 / $300.00')
    expect(wrapper.find('.subscription-unlimited').exists()).toBe(false)
  })
})
