import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSubscriptions: vi.fn(),
}))

vi.mock('@/api', () => ({ getSubscriptions: mocks.getSubscriptions }))

import SubscriptionsView from './SubscriptionsView.vue'

const subscriptions = [
  {
    id: 11,
    user_id: 1,
    group_id: 2,
    status: 'active',
    starts_at: '2026-07-01T00:00:00Z',
    expires_at: '2026-08-28T00:00:00Z',
    daily_usage_usd: 7.2,
    weekly_usage_usd: 32,
    monthly_usage_usd: 74,
    daily_window_start: '2026-08-01T00:00:00Z',
    weekly_window_start: '2026-07-28T00:00:00Z',
    monthly_window_start: '2026-08-01T00:00:00Z',
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    group: {
      id: 2,
      name: 'Claude 专业版',
      description: '适合日常开发与长任务',
      platform: 'anthropic',
      rate_multiplier: 1,
      daily_limit_usd: 10,
      weekly_limit_usd: 50,
      monthly_limit_usd: 100,
    },
  },
  {
    id: 12,
    user_id: 1,
    group_id: 3,
    status: 'expired',
    starts_at: '2026-06-01T00:00:00Z',
    expires_at: '2026-06-30T00:00:00Z',
    daily_usage_usd: 0,
    weekly_usage_usd: 0,
    monthly_usage_usd: 0,
    daily_window_start: null,
    weekly_window_start: null,
    monthly_window_start: null,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-30T00:00:00Z',
    group: { id: 3, name: 'OpenAI 体验版', platform: 'openai', rate_multiplier: 1 },
  },
]

describe('SubscriptionsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T12:00:00+08:00'))
    mocks.getSubscriptions.mockResolvedValue(subscriptions)
  })

  afterEach(() => vi.useRealTimers())

  it('shows subscription lifecycle and each configured quota window', async () => {
    const wrapper = mount(SubscriptionsView)
    await flushPromises()

    expect(mocks.getSubscriptions).toHaveBeenCalledOnce()
    expect(wrapper.get('[data-testid="subscription-summary"]').text()).toContain('1 个有效')
    expect(wrapper.text()).toContain('Claude 专业版')
    expect(wrapper.text()).toContain('日额度')
    expect(wrapper.text()).toContain('$7.20 / $10.00')
    expect(wrapper.text()).toContain('周额度')
    expect(wrapper.text()).toContain('月额度')
    expect(wrapper.text()).toContain('已过期')
  })

  it('renders a useful empty state', async () => {
    mocks.getSubscriptions.mockResolvedValue([])
    const wrapper = mount(SubscriptionsView)
    await flushPromises()

    expect(wrapper.get('[data-testid="subscriptions-empty"]').text()).toContain('暂无订阅')
    expect(wrapper.get('[data-testid="subscriptions-empty"]').text()).toContain('兑换码')
  })

  it('shows a team member allocation and a clear unallocated state', async () => {
    mocks.getSubscriptions.mockResolvedValue([
      {
        ...subscriptions[0],
        id: 21,
        team_weekly_limit_usd: 300,
        team_weekly_usage_usd: 120.5,
        team_weekly_window_start: '2026-07-28T00:00:00Z',
        group: { id: 9, name: 'OpenAI Team', platform: 'openai', subscription_type: 'team_subscription' },
      },
      {
        ...subscriptions[0],
        id: 22,
        team_weekly_limit_usd: null,
        group: { id: 10, name: 'OpenAI Team 2', platform: 'openai', subscription_type: 'team_subscription' },
      },
    ])
    const wrapper = mount(SubscriptionsView)
    await flushPromises()

    expect(wrapper.text()).toContain('本周已用 / 成员分配额度')
    expect(wrapper.text()).toContain('$120.50 / $300.00')
    expect(wrapper.get('[data-testid="subscription-team-unallocated"]').text()).toContain('暂未分配团队额度')
  })
})
