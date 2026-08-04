import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { UserSubscription } from '@/api'
import {
  formatSubscriptionDate,
  isSubscriptionExhausted,
  subscriptionProgress,
  subscriptionQuotaWindows,
  subscriptionStatusLabel,
} from './subscription-display'

function subscription(overrides: Partial<UserSubscription> = {}): UserSubscription {
  return {
    id: 1,
    user_id: 2,
    group_id: 3,
    status: 'active',
    starts_at: '2026-07-01T00:00:00Z',
    expires_at: '2026-09-01T00:00:00Z',
    daily_usage_usd: 4,
    weekly_usage_usd: 18,
    monthly_usage_usd: 45,
    daily_window_start: '2026-08-01T00:00:00Z',
    weekly_window_start: '2026-07-28T00:00:00Z',
    monthly_window_start: '2026-07-10T00:00:00Z',
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    group: {
      id: 3,
      name: 'Claude Pro',
      daily_limit_usd: 10,
      weekly_limit_usd: 50,
      monthly_limit_usd: 100,
    },
    ...overrides,
  }
}

describe('subscription display rules', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T12:00:00Z'))
  })

  afterEach(() => vi.useRealTimers())

  it('clamps progress and treats malformed limits as unavailable', () => {
    expect(subscriptionProgress(25, 100)).toBe(25)
    expect(subscriptionProgress(250, 100)).toBe(100)
    expect(subscriptionProgress(-25, 100)).toBe(0)
    expect(subscriptionProgress(Number.POSITIVE_INFINITY, 100)).toBe(100)
    expect(subscriptionProgress(Number.NEGATIVE_INFINITY, 100)).toBe(0)
    expect(subscriptionProgress(Number.NaN, 100)).toBe(0)

    for (const limit of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) {
      expect(subscriptionProgress(25, limit as number)).toBe(0)
    }
  })

  it('reports exhaustion only for a consumed finite quota window', () => {
    expect(isSubscriptionExhausted(subscription({ daily_usage_usd: 10 }))).toBe(true)
    expect(isSubscriptionExhausted(subscription({ weekly_usage_usd: Number.POSITIVE_INFINITY }))).toBe(true)
    expect(isSubscriptionExhausted(subscription())).toBe(false)
    expect(isSubscriptionExhausted(subscription({ group: undefined }))).toBe(false)
    expect(isSubscriptionExhausted(subscription({
      daily_usage_usd: 100,
      weekly_usage_usd: 100,
      monthly_usage_usd: 100,
      group: {
        id: 3,
        name: 'No limits',
        daily_limit_usd: 0,
        weekly_limit_usd: -1,
        monthly_limit_usd: Number.POSITIVE_INFINITY,
      },
    }))).toBe(false)
  })

  it('returns every finite quota window in daily, weekly, monthly order', () => {
    const windows = subscriptionQuotaWindows(subscription({
      daily_window_start: '2026-08-01T00:00:00Z',
      weekly_window_start: '2026-07-28T12:00:00Z',
      monthly_window_start: null,
    }))

    expect(windows).toEqual([
      { key: 'daily', label: '日额度', used: 4, limit: 10, resetLabel: '12 小时后重置' },
      { key: 'weekly', label: '周额度', used: 18, limit: 50, resetLabel: '3 天后重置' },
      { key: 'monthly', label: '月额度', used: 45, limit: 100, resetLabel: '等待周期开始' },
    ])
  })

  it('uses the member allocation for team subscriptions and ignores ordinary group limits', () => {
    const windows = subscriptionQuotaWindows(subscription({
      team_weekly_limit_usd: 300,
      team_weekly_usage_usd: 120.5,
      team_weekly_window_start: '2026-07-28T12:00:00Z',
      group: {
        id: 3,
        name: 'OpenAI Team',
        subscription_type: 'team_subscription',
        daily_limit_usd: 10,
        weekly_limit_usd: 50,
        monthly_limit_usd: 100,
      },
    }))

    expect(windows).toEqual([{
      key: 'team-weekly',
      label: '本周已用 / 成员分配额度',
      used: 120.5,
      limit: 300,
      resetLabel: '3 天后重置',
    }])
  })

  it('does not describe an unallocated team subscription as unlimited', () => {
    expect(subscriptionQuotaWindows(subscription({
      team_weekly_limit_usd: null,
      group: { id: 3, name: 'OpenAI Team', subscription_type: 'team_subscription' },
    }))).toEqual([])
  })

  it('omits invalid limits and normalizes malformed usage and reset dates', () => {
    const windows = subscriptionQuotaWindows(subscription({
      daily_usage_usd: Number.NaN,
      daily_window_start: 'not-a-date',
      weekly_usage_usd: Number.POSITIVE_INFINITY,
      weekly_window_start: '2026-07-25T12:00:00Z',
      monthly_usage_usd: -3,
      group: {
        id: 3,
        name: 'Mixed limits',
        daily_limit_usd: 10,
        weekly_limit_usd: 50,
        monthly_limit_usd: Number.POSITIVE_INFINITY,
      },
    }))

    expect(windows).toEqual([
      { key: 'daily', label: '日额度', used: 0, limit: 10, resetLabel: '等待周期开始' },
      { key: 'weekly', label: '周额度', used: 50, limit: 50, resetLabel: '即将重置' },
    ])
  })

  it('maps every subscription status to the existing desktop label', () => {
    expect(subscriptionStatusLabel('active')).toBe('使用中')
    expect(subscriptionStatusLabel('expired')).toBe('已过期')
    expect(subscriptionStatusLabel('revoked')).toBe('已撤销')
    expect(subscriptionStatusLabel('suspended')).toBe('已暂停')
  })

  it('formats valid dates in local time and keeps open-ended dates stable', () => {
    const value = '2026-08-01T23:30:00-07:00'
    const local = new Date(value)
    const expected = `${local.getFullYear()}年${local.getMonth() + 1}月${local.getDate()}日`

    expect(formatSubscriptionDate(value)).toBe(expected)
    expect(formatSubscriptionDate(null)).toBe('长期有效')
    expect(formatSubscriptionDate(undefined)).toBe('长期有效')
    expect(formatSubscriptionDate('not-a-date')).toBe('长期有效')
    expect(formatSubscriptionDate('0001-01-01T00:00:00Z')).toBe('长期有效')
  })
})
