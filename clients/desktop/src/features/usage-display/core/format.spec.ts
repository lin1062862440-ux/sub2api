import { describe, expect, it } from 'vitest'

import {
  formatUsageOrbValue,
  formatUsageTrayTitle,
  quotaResetAt,
  remainingPercent,
  resolveBalanceRanges,
  resolveQuotaSummary,
  truncateTraySource,
  type ResolvedUsageQuota,
  type UsageQuotaInput,
} from './format'
import * as format from './format'

type ShortestQuotaFormatters = {
  orderUsageQuotasShortestFirst?: (quotas: readonly ResolvedUsageQuota[]) => ResolvedUsageQuota[]
  resolveShortestUsageQuota?: (quotas: readonly ResolvedUsageQuota[]) => ResolvedUsageQuota | null
}

const shortestQuotaFormatters = format as typeof format & ShortestQuotaFormatters

const quotas: UsageQuotaInput[] = [
  {
    key: 'daily',
    label: '日额度',
    used: 2,
    limit: 10,
    windowStart: '2026-08-01T00:00:00Z',
    windowHours: 24,
  },
  {
    key: 'weekly',
    label: '周额度',
    used: 8,
    limit: 10,
    windowStart: '2026-07-28T00:00:00Z',
    windowHours: 168,
  },
]

describe('usage display formatting', () => {
  it('selects the finite quota with the least capacity remaining', () => {
    expect(resolveQuotaSummary(quotas)).toMatchObject({
      remainingPercent: 20,
      constrainedKey: 'weekly',
      unlimited: false,
    })
  })

  it('orders configured quotas from the shortest window to the longest', () => {
    const summary = resolveQuotaSummary([
      {
        key: 'monthly',
        label: '月额度',
        used: 24,
        limit: 100,
        windowStart: null,
        windowHours: 720,
      },
      ...quotas,
    ])
    const order = shortestQuotaFormatters.orderUsageQuotasShortestFirst

    expect(order).toBeTypeOf('function')
    if (!order) return
    expect(order(summary.quotas).map((item) => item.key)).toEqual(['daily', 'weekly', 'monthly'])
  })

  it('selects the shortest configured quota with deterministic fallbacks', () => {
    const summary = resolveQuotaSummary([
      ...quotas,
      {
        key: 'monthly',
        label: '月额度',
        used: 24,
        limit: 100,
        windowStart: null,
        windowHours: 720,
      },
    ])
    const select = shortestQuotaFormatters.resolveShortestUsageQuota

    expect(select).toBeTypeOf('function')
    if (!select) return
    expect(select(summary.quotas)?.key).toBe('daily')
    expect(select(summary.quotas.filter((item) => item.key !== 'daily'))?.key).toBe('weekly')
    expect(select(summary.quotas.filter((item) => item.key === 'monthly'))?.key).toBe('monthly')
    expect(select([])).toBeNull()
  })

  it('treats an empty finite quota list as unlimited', () => {
    expect(resolveQuotaSummary([])).toEqual({
      quotas: [],
      remainingPercent: null,
      constrainedKey: null,
      unlimited: true,
    })
  })

  it('clamps remaining percentages to the display range', () => {
    expect(remainingPercent(-2, 10)).toBe(100)
    expect(remainingPercent(4.96, 10)).toBe(50)
    expect(remainingPercent(12, 10)).toBe(0)
  })

  it('rejects non-finite quota limits', () => {
    expect(() => remainingPercent(1, 0)).toThrow('额度上限必须大于 0')
    expect(() => remainingPercent(1, Number.POSITIVE_INFINITY)).toThrow('额度上限必须大于 0')
  })

  it('calculates rolling quota reset timestamps', () => {
    expect(quotaResetAt('2026-08-01T00:00:00Z', 24)?.toISOString()).toBe('2026-08-02T00:00:00.000Z')
    expect(quotaResetAt('2026-07-28T00:00:00Z', 168)?.toISOString()).toBe('2026-08-04T00:00:00.000Z')
    expect(quotaResetAt('2026-07-02T00:00:00Z', 720)?.toISOString()).toBe('2026-08-01T00:00:00.000Z')
    expect(quotaResetAt(null, 24)).toBeNull()
    expect(quotaResetAt('invalid', 24)).toBeNull()
  })

  it('formats compact balance, subscription, unlimited, and unavailable titles', () => {
    expect(formatUsageTrayTitle({ kind: 'balance', balance: 128.6 })).toBe('$128.60')
    expect(formatUsageTrayTitle({ kind: 'subscription', name: 'Claude Pro', remainingPercent: 73 })).toBe('73%')
    expect(formatUsageTrayTitle({ kind: 'subscription', name: 'Claude 专业旗舰订阅', remainingPercent: 73 })).toBe('73%')
    expect(formatUsageTrayTitle({ kind: 'subscription', name: 'Claude Pro', remainingPercent: null })).toBe('∞')
    expect(formatUsageTrayTitle({ kind: 'unavailable' })).toBe('--')
  })

  it('formats stable compact values for the floating orb', () => {
    expect(formatUsageOrbValue({ kind: 'balance', balance: 128.6 })).toBe('$129')
    expect(formatUsageOrbValue({ kind: 'balance', balance: 1234 })).toBe('$1.2K')
    expect(formatUsageOrbValue({ kind: 'subscription', remainingPercent: 26, unlimited: false })).toBe('26%')
    expect(formatUsageOrbValue({ kind: 'subscription', remainingPercent: null, unlimited: true })).toBe('∞')
    expect(formatUsageOrbValue({ kind: 'unavailable' })).toBe('--')
  })

  it('truncates names by Unicode code point', () => {
    expect(truncateTraySource('Claude 专业旗舰订阅')).toBe('Claude 专业…')
    expect(truncateTraySource('Claude Pro')).toBe('Claude Pro')
  })

  it('resolves local date ranges for balance consumption', () => {
    expect(resolveBalanceRanges(new Date('2026-08-18T14:00:00+08:00'))).toEqual({
      today: { start_date: '2026-08-18', end_date: '2026-08-18', billing_type: 0 },
      last7Days: { start_date: '2026-08-12', end_date: '2026-08-18', billing_type: 0 },
      thisMonth: { start_date: '2026-08-01', end_date: '2026-08-18', billing_type: 0 },
    })
  })
})
